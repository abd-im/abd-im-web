import type { MessageItem } from "@abd-im/wasm-client-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  addReaction,
  getReactionSummaries,
  MAX_REACTION_SUMMARY_BATCH_SIZE,
  removeReaction,
} from "@/api/messageReaction";
import type {
  MessageReactionSummary,
  MessageReactionUpdatedEvent,
} from "@/api/messageReactionTypes";
import { ALLOWED_REACTION_EMOJIS } from "@/api/messageReactionTypes";
import emitter from "@/utils/events";

import {
  reduceMessageReactionEvent,
  replaceReaction,
  selectReactionSummaryMessageIDs,
  sortMessageReactions,
} from "./messageReactionState";

type ReactionSummaries = Record<string, MessageReactionSummary>;

interface ReactionState {
  conversationID?: string;
  summaries: ReactionSummaries;
}

const EMPTY_SUMMARIES: ReactionSummaries = {};
const pendingKey = (clientMsgID: string, emoji: string) => `${clientMsgID}\0${emoji}`;

const chunkMessageIDs = (clientMsgIDs: string[]) => {
  const chunks: string[][] = [];
  for (
    let index = 0;
    index < clientMsgIDs.length;
    index += MAX_REACTION_SUMMARY_BATCH_SIZE
  ) {
    chunks.push(clientMsgIDs.slice(index, index + MAX_REACTION_SUMMARY_BATCH_SIZE));
  }
  return chunks;
};

const optimisticSummary = (
  summary: MessageReactionSummary | undefined,
  clientMsgID: string,
  emoji: string,
  added: boolean,
): MessageReactionSummary => {
  const current = summary ?? { clientMsgID, version: 0, reactions: [] };
  const existing = current.reactions.find((reaction) => reaction.emoji === emoji);
  const count = Math.max(0, (existing?.count ?? 0) + (added ? 1 : -1));

  return {
    ...current,
    reactions: replaceReaction(
      current.reactions,
      emoji,
      count > 0 ? { emoji, count, reactedByMe: added } : undefined,
    ),
  };
};

const restoreReaction = (
  current: MessageReactionSummary,
  previous: MessageReactionSummary | undefined,
  emoji: string,
): MessageReactionSummary => {
  const previousReaction = previous?.reactions.find(
    (reaction) => reaction.emoji === emoji,
  );
  return {
    ...current,
    reactions: replaceReaction(current.reactions, emoji, previousReaction),
  };
};

const preservePendingReactions = (
  incoming: MessageReactionSummary,
  current: MessageReactionSummary,
  pendingKeys: Set<string>,
): MessageReactionSummary => {
  let reactions = incoming.reactions;
  ALLOWED_REACTION_EMOJIS.forEach((emoji) => {
    if (!pendingKeys.has(pendingKey(incoming.clientMsgID, emoji))) return;
    reactions = replaceReaction(
      reactions,
      emoji,
      current.reactions.find((reaction) => reaction.emoji === emoji),
    );
  });
  return { ...incoming, reactions };
};

export function useMessageReactions(
  conversationID: string | undefined,
  messages: MessageItem[],
  selfUserID: string,
  connectionReady = true,
) {
  const messageIDs = useMemo(
    () => [...new Set(messages.map((message) => message.clientMsgID).filter(Boolean))],
    [messages],
  );
  const messageIDSetRef = useRef(new Set(messageIDs));
  messageIDSetRef.current = new Set(messageIDs);

  const conversationIDRef = useRef(conversationID);
  conversationIDRef.current = conversationID;
  const selfUserIDRef = useRef(selfUserID);
  selfUserIDRef.current = selfUserID;

  const summariesConversationIDRef = useRef(conversationID);
  const summariesRef = useRef<ReactionSummaries>({});
  const loadedMessageIDsRef = useRef(new Set<string>());
  const loadingMessageIDsRef = useRef(new Set<string>());
  const loadGenerationRef = useRef(0);
  const pendingKeysRef = useRef(new Set<string>());
  const reconnectRefreshPendingRef = useRef(false);

  if (summariesConversationIDRef.current !== conversationID) {
    summariesConversationIDRef.current = conversationID;
    summariesRef.current = {};
    loadedMessageIDsRef.current = new Set();
    loadingMessageIDsRef.current = new Set();
    loadGenerationRef.current += 1;
    pendingKeysRef.current = new Set();
    reconnectRefreshPendingRef.current = false;
  }

  const [reactionState, setReactionState] = useState<ReactionState>({
    conversationID,
    summaries: {},
  });
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [refreshRevision, setRefreshRevision] = useState(0);

  const commitSummaries = useCallback(
    (
      expectedConversationID: string,
      update: (current: ReactionSummaries) => ReactionSummaries,
    ) => {
      if (
        conversationIDRef.current !== expectedConversationID ||
        summariesConversationIDRef.current !== expectedConversationID
      ) {
        return;
      }

      const current = summariesRef.current;
      const next = update(current);
      if (next === current) return;

      summariesRef.current = next;
      setReactionState({ conversationID: expectedConversationID, summaries: next });
    },
    [],
  );

  const mergeSummaries = useCallback(
    (
      expectedConversationID: string,
      incoming: MessageReactionSummary[],
      acceptEqualVersion = false,
      keepPendingReactions = false,
    ) => {
      commitSummaries(expectedConversationID, (current) => {
        let next = current;
        incoming.forEach((summary) => {
          if (!messageIDSetRef.current.has(summary.clientMsgID)) return;
          const existing = next[summary.clientMsgID];
          const shouldMerge =
            !existing ||
            summary.version > existing.version ||
            (acceptEqualVersion && summary.version === existing.version);
          if (!shouldMerge) return;
          if (next === current) next = { ...current };
          const normalized = {
            ...summary,
            reactions: sortMessageReactions(summary.reactions ?? []),
          };
          next[summary.clientMsgID] =
            keepPendingReactions && existing
              ? preservePendingReactions(normalized, existing, pendingKeysRef.current)
              : normalized;
        });
        return next;
      });
    },
    [commitSummaries],
  );

  const fetchSummaries = useCallback(
    async (
      clientMsgIDs: string[],
      acceptEqualVersion = false,
      keepPendingReactions = false,
    ) => {
      const expectedConversationID = conversationIDRef.current;
      if (!expectedConversationID || clientMsgIDs.length === 0) return;

      const requestedIDs = [...new Set(clientMsgIDs)].filter((clientMsgID) =>
        messageIDSetRef.current.has(clientMsgID),
      );
      const batches = chunkMessageIDs(requestedIDs);
      const responses = await Promise.all(
        batches.map((batch) =>
          getReactionSummaries({
            conversationID: expectedConversationID,
            clientMsgIDs: batch,
          }),
        ),
      );
      mergeSummaries(
        expectedConversationID,
        responses.flat(),
        acceptEqualVersion,
        keepPendingReactions,
      );
    },
    [mergeSummaries],
  );

  const refreshLoaded = useCallback(
    () => fetchSummaries([...messageIDSetRef.current], true, true),
    [fetchSummaries],
  );

  useEffect(() => {
    summariesRef.current = {};
    loadedMessageIDsRef.current = new Set();
    loadingMessageIDsRef.current = new Set();
    loadGenerationRef.current += 1;
    pendingKeysRef.current = new Set();
    reconnectRefreshPendingRef.current = false;
    setReactionState({ conversationID, summaries: {} });
    setPendingKeys(new Set());
  }, [conversationID]);

  useEffect(() => {
    if (!conversationID) return;
    if (!connectionReady) {
      reconnectRefreshPendingRef.current = true;
    }

    const currentMessageIDs = new Set(messageIDs);
    loadedMessageIDsRef.current.forEach((clientMsgID) => {
      if (!currentMessageIDs.has(clientMsgID)) {
        loadedMessageIDsRef.current.delete(clientMsgID);
      }
    });
    commitSummaries(conversationID, (current) => {
      const entries = Object.entries(current).filter(([clientMsgID]) =>
        currentMessageIDs.has(clientMsgID),
      );
      return entries.length === Object.keys(current).length
        ? current
        : Object.fromEntries(entries);
    });

    const forceRefresh = connectionReady && reconnectRefreshPendingRef.current;
    const loadedOrLoadingMessageIDs = new Set([
      ...loadedMessageIDsRef.current,
      ...loadingMessageIDsRef.current,
    ]);
    const newMessageIDs = selectReactionSummaryMessageIDs(
      messageIDs,
      loadedOrLoadingMessageIDs,
      connectionReady,
      forceRefresh,
    );
    if (newMessageIDs.length === 0) return;

    if (forceRefresh) {
      loadedMessageIDsRef.current = new Set();
      loadingMessageIDsRef.current = new Set();
      loadGenerationRef.current += 1;
      reconnectRefreshPendingRef.current = false;
    }
    const requestGeneration = loadGenerationRef.current;
    newMessageIDs.forEach((clientMsgID) =>
      loadingMessageIDsRef.current.add(clientMsgID),
    );
    void fetchSummaries(newMessageIDs)
      .then(() => {
        if (
          conversationIDRef.current !== conversationID ||
          loadGenerationRef.current !== requestGeneration
        ) {
          return;
        }
        newMessageIDs.forEach((clientMsgID) => {
          loadingMessageIDsRef.current.delete(clientMsgID);
          if (messageIDSetRef.current.has(clientMsgID)) {
            loadedMessageIDsRef.current.add(clientMsgID);
          }
        });
      })
      .catch(() => {
        if (
          conversationIDRef.current !== conversationID ||
          loadGenerationRef.current !== requestGeneration
        ) {
          return;
        }
        if (forceRefresh) reconnectRefreshPendingRef.current = true;
        newMessageIDs.forEach((clientMsgID) =>
          loadingMessageIDsRef.current.delete(clientMsgID),
        );
      });
  }, [
    commitSummaries,
    connectionReady,
    conversationID,
    fetchSummaries,
    messageIDs,
    refreshRevision,
  ]);

  useEffect(() => {
    const handleReactionUpdated = (event: MessageReactionUpdatedEvent) => {
      const expectedConversationID = conversationIDRef.current;
      if (
        !expectedConversationID ||
        event.conversationID !== expectedConversationID ||
        !messageIDSetRef.current.has(event.clientMsgID)
      ) {
        return;
      }

      const result = reduceMessageReactionEvent(
        summariesRef.current[event.clientMsgID],
        event,
        selfUserIDRef.current,
      );
      if (result.requiresRefresh) {
        void fetchSummaries([event.clientMsgID], true, true).catch(() => undefined);
        return;
      }
      const nextSummary = result.summary;
      if (!nextSummary || nextSummary.version !== event.version) return;
      commitSummaries(expectedConversationID, (summaries) => ({
        ...summaries,
        [event.clientMsgID]: nextSummary,
      }));
    };
    const handleRefresh = () => {
      reconnectRefreshPendingRef.current = true;
      setRefreshRevision((current) => current + 1);
    };

    emitter.on("MESSAGE_REACTION_UPDATED", handleReactionUpdated);
    emitter.on("MESSAGE_REACTIONS_REFRESH", handleRefresh);
    return () => {
      emitter.off("MESSAGE_REACTION_UPDATED", handleReactionUpdated);
      emitter.off("MESSAGE_REACTIONS_REFRESH", handleRefresh);
    };
  }, [commitSummaries, fetchSummaries]);

  const isPending = useCallback(
    (clientMsgID: string, emoji: string) =>
      pendingKeys.has(pendingKey(clientMsgID, emoji)),
    [pendingKeys],
  );

  const toggleReaction = useCallback(
    async (clientMsgID: string, emoji: string, reactedByMe: boolean) => {
      const expectedConversationID = conversationIDRef.current;
      const key = pendingKey(clientMsgID, emoji);
      if (
        !expectedConversationID ||
        !messageIDSetRef.current.has(clientMsgID) ||
        pendingKeysRef.current.has(key)
      ) {
        return;
      }

      const previous = summariesRef.current[clientMsgID];
      const added = !reactedByMe;
      pendingKeysRef.current.add(key);
      setPendingKeys(new Set(pendingKeysRef.current));
      commitSummaries(expectedConversationID, (current) => ({
        ...current,
        [clientMsgID]: optimisticSummary(
          current[clientMsgID],
          clientMsgID,
          emoji,
          added,
        ),
      }));

      try {
        const changeReaction = added ? addReaction : removeReaction;
        const summary = await changeReaction({
          conversationID: expectedConversationID,
          clientMsgID,
          emoji,
        });
        mergeSummaries(expectedConversationID, [summary], true);
      } catch {
        commitSummaries(expectedConversationID, (current) => {
          const summary = current[clientMsgID];
          if (!summary || summary.version !== (previous?.version ?? 0)) return current;
          return {
            ...current,
            [clientMsgID]: restoreReaction(summary, previous, emoji),
          };
        });
        try {
          await fetchSummaries([clientMsgID], true);
        } catch {
          // The optimistic value has already been reverted; a later refresh retries recovery.
        }
      } finally {
        if (conversationIDRef.current === expectedConversationID) {
          pendingKeysRef.current.delete(key);
          setPendingKeys(new Set(pendingKeysRef.current));
        }
      }
    },
    [commitSummaries, fetchSummaries, mergeSummaries],
  );

  return {
    summaries:
      reactionState.conversationID === conversationID
        ? reactionState.summaries
        : EMPTY_SUMMARIES,
    isPending,
    toggleReaction,
    refreshLoaded,
  };
}

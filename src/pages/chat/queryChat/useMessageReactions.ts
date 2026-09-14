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
  selectReactionSummaryMessageSeqs,
  sortMessageReactions,
} from "./messageReactionState";

type ReactionSummaries = Record<number, MessageReactionSummary>;

interface ReactionState {
  conversationID?: string;
  summaries: ReactionSummaries;
}

const EMPTY_SUMMARIES: ReactionSummaries = {};
const pendingKey = (seq: number, emoji: string) => `${seq}\0${emoji}`;

const chunkMessageSeqs = (seqs: number[]) => {
  const chunks: number[][] = [];
  for (let index = 0; index < seqs.length; index += MAX_REACTION_SUMMARY_BATCH_SIZE) {
    chunks.push(seqs.slice(index, index + MAX_REACTION_SUMMARY_BATCH_SIZE));
  }
  return chunks;
};

const optimisticSummary = (
  summary: MessageReactionSummary | undefined,
  seq: number,
  emoji: string,
  added: boolean,
): MessageReactionSummary => {
  const current = summary ?? { seq, version: 0, reactions: [] };
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
    if (!pendingKeys.has(pendingKey(incoming.seq, emoji))) return;
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
  const messageSeqs = useMemo(
    () => [
      ...new Set(
        messages
          .map((message) => message.seq)
          .filter((seq) => Number.isSafeInteger(seq) && seq > 0),
      ),
    ],
    [messages],
  );
  const messageSeqSetRef = useRef(new Set(messageSeqs));
  messageSeqSetRef.current = new Set(messageSeqs);

  const conversationIDRef = useRef(conversationID);
  conversationIDRef.current = conversationID;
  const selfUserIDRef = useRef(selfUserID);
  selfUserIDRef.current = selfUserID;

  const summariesConversationIDRef = useRef(conversationID);
  const summariesRef = useRef<ReactionSummaries>({});
  const loadedMessageSeqsRef = useRef(new Set<number>());
  const loadingMessageSeqsRef = useRef(new Set<number>());
  const loadGenerationRef = useRef(0);
  const pendingKeysRef = useRef(new Set<string>());
  const reconnectRefreshPendingRef = useRef(false);

  if (summariesConversationIDRef.current !== conversationID) {
    summariesConversationIDRef.current = conversationID;
    summariesRef.current = {};
    loadedMessageSeqsRef.current = new Set();
    loadingMessageSeqsRef.current = new Set();
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
          if (!messageSeqSetRef.current.has(summary.seq)) return;
          const existing = next[summary.seq];
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
          next[summary.seq] =
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
      seqs: number[],
      acceptEqualVersion = false,
      keepPendingReactions = false,
    ) => {
      const expectedConversationID = conversationIDRef.current;
      if (!expectedConversationID || seqs.length === 0) return;

      const requestedSeqs = [...new Set(seqs)].filter((seq) =>
        messageSeqSetRef.current.has(seq),
      );
      const batches = chunkMessageSeqs(requestedSeqs);
      const responses = await Promise.all(
        batches.map((batch) =>
          getReactionSummaries({
            conversationID: expectedConversationID,
            seqs: batch,
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
    () => fetchSummaries([...messageSeqSetRef.current], true, true),
    [fetchSummaries],
  );

  useEffect(() => {
    summariesRef.current = {};
    loadedMessageSeqsRef.current = new Set();
    loadingMessageSeqsRef.current = new Set();
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

    const currentMessageSeqs = new Set(messageSeqs);
    loadedMessageSeqsRef.current.forEach((seq) => {
      if (!currentMessageSeqs.has(seq)) {
        loadedMessageSeqsRef.current.delete(seq);
      }
    });
    commitSummaries(conversationID, (current) => {
      const entries = Object.entries(current).filter(([seq]) =>
        currentMessageSeqs.has(Number(seq)),
      );
      return entries.length === Object.keys(current).length
        ? current
        : Object.fromEntries(entries);
    });

    const forceRefresh = connectionReady && reconnectRefreshPendingRef.current;
    const loadedOrLoadingMessageSeqs = new Set([
      ...loadedMessageSeqsRef.current,
      ...loadingMessageSeqsRef.current,
    ]);
    const newMessageSeqs = selectReactionSummaryMessageSeqs(
      messageSeqs,
      loadedOrLoadingMessageSeqs,
      connectionReady,
      forceRefresh,
    );
    if (newMessageSeqs.length === 0) return;

    if (forceRefresh) {
      loadedMessageSeqsRef.current = new Set();
      loadingMessageSeqsRef.current = new Set();
      loadGenerationRef.current += 1;
      reconnectRefreshPendingRef.current = false;
    }
    const requestGeneration = loadGenerationRef.current;
    newMessageSeqs.forEach((seq) => loadingMessageSeqsRef.current.add(seq));
    void fetchSummaries(newMessageSeqs)
      .then(() => {
        if (
          conversationIDRef.current !== conversationID ||
          loadGenerationRef.current !== requestGeneration
        ) {
          return;
        }
        newMessageSeqs.forEach((seq) => {
          loadingMessageSeqsRef.current.delete(seq);
          if (messageSeqSetRef.current.has(seq)) {
            loadedMessageSeqsRef.current.add(seq);
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
        newMessageSeqs.forEach((seq) => loadingMessageSeqsRef.current.delete(seq));
      });
  }, [
    commitSummaries,
    connectionReady,
    conversationID,
    fetchSummaries,
    messageSeqs,
    refreshRevision,
  ]);

  useEffect(() => {
    const handleReactionUpdated = (event: MessageReactionUpdatedEvent) => {
      const expectedConversationID = conversationIDRef.current;
      if (
        !expectedConversationID ||
        event.conversationID !== expectedConversationID ||
        !messageSeqSetRef.current.has(event.seq)
      ) {
        return;
      }

      const result = reduceMessageReactionEvent(
        summariesRef.current[event.seq],
        event,
        selfUserIDRef.current,
      );
      if (result.requiresRefresh) {
        void fetchSummaries([event.seq], true, true).catch(() => undefined);
        return;
      }
      const nextSummary = result.summary;
      if (!nextSummary || nextSummary.version !== event.version) return;
      commitSummaries(expectedConversationID, (summaries) => ({
        ...summaries,
        [event.seq]: nextSummary,
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
    (seq: number, emoji: string) => pendingKeys.has(pendingKey(seq, emoji)),
    [pendingKeys],
  );

  const toggleReaction = useCallback(
    async (seq: number, emoji: string, reactedByMe: boolean) => {
      const expectedConversationID = conversationIDRef.current;
      const key = pendingKey(seq, emoji);
      if (
        !expectedConversationID ||
        !messageSeqSetRef.current.has(seq) ||
        pendingKeysRef.current.has(key)
      ) {
        return;
      }

      const previous = summariesRef.current[seq];
      const added = !reactedByMe;
      pendingKeysRef.current.add(key);
      setPendingKeys(new Set(pendingKeysRef.current));
      commitSummaries(expectedConversationID, (current) => ({
        ...current,
        [seq]: optimisticSummary(current[seq], seq, emoji, added),
      }));

      try {
        const changeReaction = added ? addReaction : removeReaction;
        const summary = await changeReaction({
          conversationID: expectedConversationID,
          seq,
          emoji,
        });
        mergeSummaries(expectedConversationID, [summary], true);
      } catch {
        commitSummaries(expectedConversationID, (current) => {
          const summary = current[seq];
          if (!summary || summary.version !== (previous?.version ?? 0)) return current;
          return {
            ...current,
            [seq]: restoreReaction(summary, previous, emoji),
          };
        });
        try {
          await fetchSummaries([seq], true);
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

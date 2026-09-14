import type {
  MessageReaction,
  MessageReactionSummary,
  MessageReactionUpdatedEvent,
} from "@/api/messageReactionTypes";
import { ALLOWED_REACTION_EMOJIS } from "@/api/messageReactionTypes";

const reactionOrder = new Map<string, number>(
  ALLOWED_REACTION_EMOJIS.map((emoji, index) => [emoji, index]),
);

export const selectReactionSummaryMessageSeqs = (
  messageSeqs: number[],
  loadedMessageSeqs: ReadonlySet<number>,
  connectionReady: boolean,
  forceRefresh: boolean,
) => {
  if (!connectionReady) return [];
  return forceRefresh
    ? messageSeqs
    : messageSeqs.filter((seq) => !loadedMessageSeqs.has(seq));
};

export const sortMessageReactions = (reactions: MessageReaction[]) =>
  [...reactions].sort(
    (left, right) =>
      (reactionOrder.get(left.emoji) ?? Number.MAX_SAFE_INTEGER) -
      (reactionOrder.get(right.emoji) ?? Number.MAX_SAFE_INTEGER),
  );

export const replaceReaction = (
  reactions: MessageReaction[],
  emoji: string,
  reaction?: MessageReaction,
) => {
  const next = reactions.filter((item) => item.emoji !== emoji);
  if (reaction && reaction.count > 0) {
    next.push(reaction);
  }
  return sortMessageReactions(next);
};

export interface ReactionEventResult {
  summary: MessageReactionSummary | undefined;
  requiresRefresh: boolean;
}

export const parseReactionUpdatedEvent = (
  raw: unknown,
): MessageReactionUpdatedEvent | undefined => {
  try {
    const envelope = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      key?: unknown;
      data?: unknown;
    };
    if (!envelope || typeof envelope !== "object") return;
    if (envelope.key !== "message.reaction.updated") return;

    const data: unknown =
      typeof envelope.data === "string"
        ? (JSON.parse(envelope.data) as unknown)
        : envelope.data;
    if (!data || typeof data !== "object") return;

    const event = data as Partial<MessageReactionUpdatedEvent>;
    if (
      typeof event.conversationID !== "string" ||
      typeof event.seq !== "number" ||
      !Number.isSafeInteger(event.seq) ||
      event.seq <= 0 ||
      typeof event.emoji !== "string" ||
      !reactionOrder.has(event.emoji) ||
      (event.action !== "added" && event.action !== "removed") ||
      typeof event.actorUserID !== "string" ||
      typeof event.count !== "number" ||
      !Number.isSafeInteger(event.count) ||
      event.count < 0 ||
      typeof event.version !== "number" ||
      !Number.isSafeInteger(event.version) ||
      event.version < 1
    ) {
      return;
    }
    return event as MessageReactionUpdatedEvent;
  } catch {
    return;
  }
};

export const reduceMessageReactionEvent = (
  current: MessageReactionSummary | undefined,
  event: MessageReactionUpdatedEvent,
  selfUserID: string,
): ReactionEventResult => {
  if (!current || event.version > current.version + 1) {
    return { summary: current, requiresRefresh: true };
  }
  if (event.version <= current.version) {
    return { summary: current, requiresRefresh: false };
  }

  const existing = current.reactions.find((reaction) => reaction.emoji === event.emoji);
  const userIDs = existing?.userIDs ? [...existing.userIDs] : [];
  const actorIndex = userIDs.indexOf(event.actorUserID);
  if (event.action === "added" && actorIndex === -1) {
    userIDs.push(event.actorUserID);
  } else if (event.action === "removed" && actorIndex !== -1) {
    userIDs.splice(actorIndex, 1);
  }
  if (userIDs.length !== event.count) {
    return { summary: current, requiresRefresh: true };
  }
  const reactedByMe =
    event.actorUserID === selfUserID
      ? event.action === "added"
      : existing?.reactedByMe ?? false;

  return {
    requiresRefresh: false,
    summary: {
      ...current,
      version: event.version,
      reactions: replaceReaction(
        current.reactions,
        event.emoji,
        event.count > 0
          ? { emoji: event.emoji, count: event.count, reactedByMe, userIDs }
          : undefined,
      ),
    },
  };
};

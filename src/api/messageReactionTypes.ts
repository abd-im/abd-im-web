export const ALLOWED_REACTION_EMOJIS = [
  "👍",
  "👎",
  "😄",
  "🎉",
  "😕",
  "❤️",
  "🚀",
  "👀",
] as const;

export type MessageReactionAction = "added" | "removed";

export interface MessageReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  userIDs: string[];
}

export interface MessageReactionSummary {
  seq: number;
  version: number;
  reactions: MessageReaction[];
  stale?: boolean;
}

export type MessageReactionSummaryPayload = Omit<
  MessageReactionSummary,
  "reactions"
> & {
  reactions:
    | (Omit<MessageReaction, "userIDs"> & { userIDs?: string[] | null })[]
    | null;
};

export const normalizeMessageReactionSummary = (
  summary: MessageReactionSummaryPayload,
): MessageReactionSummary => ({
  ...summary,
  stale: summary.stale ?? false,
  reactions: (summary.reactions ?? []).map((reaction) => ({
    ...reaction,
    userIDs: reaction.userIDs ?? [],
  })),
});

export interface MessageReactionUpdatedEvent {
  conversationID: string;
  seq: number;
  emoji: string;
  action: MessageReactionAction;
  actorUserID: string;
  count: number;
  version: number;
}

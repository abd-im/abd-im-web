export const ALLOWED_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export type MessageReactionAction = "added" | "removed";

export interface MessageReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface MessageReactionSummary {
  clientMsgID: string;
  version: number;
  reactions: MessageReaction[];
}

export type MessageReactionSummaryPayload = Omit<
  MessageReactionSummary,
  "reactions"
> & {
  reactions: MessageReaction[] | null;
};

export const normalizeMessageReactionSummary = (
  summary: MessageReactionSummaryPayload,
): MessageReactionSummary => ({
  ...summary,
  reactions: summary.reactions ?? [],
});

export interface MessageReactionUpdatedEvent {
  conversationID: string;
  clientMsgID: string;
  emoji: string;
  action: MessageReactionAction;
  actorUserID: string;
  count: number;
  version: number;
}

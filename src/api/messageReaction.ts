import { RUNTIME_API_URL } from "@/config";
import createAxiosInstance from "@/utils/request";

import type {
  MessageReaction,
  MessageReactionSummary,
  MessageReactionSummaryPayload,
  MessageReactionUpdatedEvent,
} from "./messageReactionTypes";
import {
  ALLOWED_REACTION_EMOJIS,
  normalizeMessageReactionSummary,
} from "./messageReactionTypes";

const request = createAxiosInstance(RUNTIME_API_URL);

export const MAX_REACTION_SUMMARY_BATCH_SIZE = 100;

export {
  ALLOWED_REACTION_EMOJIS,
  type MessageReaction,
  type MessageReactionSummary,
  type MessageReactionUpdatedEvent,
};

export interface ChangeReactionParams {
  conversationID: string;
  clientMsgID: string;
  emoji: string;
}

export interface GetReactionSummariesParams {
  conversationID: string;
  clientMsgIDs: string[];
}

interface ChangeReactionResponse {
  summary: MessageReactionSummaryPayload;
}

interface GetReactionSummariesResponse {
  summaries: MessageReactionSummaryPayload[];
}

export const addReaction = async (params: ChangeReactionParams) => {
  const { data } = await request.post<ChangeReactionResponse>(
    "/msg/add_reaction",
    params,
  );
  return normalizeMessageReactionSummary(data.summary);
};

export const removeReaction = async (params: ChangeReactionParams) => {
  const { data } = await request.post<ChangeReactionResponse>(
    "/msg/remove_reaction",
    params,
  );
  return normalizeMessageReactionSummary(data.summary);
};

export const getReactionSummaries = async (params: GetReactionSummariesParams) => {
  const { data } = await request.post<GetReactionSummariesResponse>(
    "/msg/get_reaction_summaries",
    params,
  );
  return data.summaries.map(normalizeMessageReactionSummary);
};

import * as localForage from "localforage";

import type { MessageReactionSummary } from "@/api/messageReactionTypes";

export type CachedReactionSummaries = Record<string, MessageReactionSummary>;

const reactionCache = localForage.createInstance({
  name: "ABD-IM-Reactions",
  storeName: "summaries",
});

const cacheKey = (userID: string, conversationID: string) =>
  `${encodeURIComponent(userID)}:${encodeURIComponent(conversationID)}`;

export const getCachedReactionSummaries = async (
  userID: string,
  conversationID: string,
) =>
  (await reactionCache.getItem<CachedReactionSummaries>(
    cacheKey(userID, conversationID),
  )) ?? {};

export const setCachedReactionSummaries = (
  userID: string,
  conversationID: string,
  summaries: CachedReactionSummaries,
) => reactionCache.setItem(cacheKey(userID, conversationID), summaries);

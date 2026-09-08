import type { FriendUserItem } from "@abd-im/wasm-client-sdk/lib/types/entity";

export type UserDisplayNameSource = {
  userID?: string;
  nickname?: string;
  remark?: string;
};

export type UserDisplayNameResolver = (
  source: UserDisplayNameSource,
  fallback?: string,
) => string;

const firstNonBlank = (...values: Array<string | undefined>) =>
  values.find((value) => value?.trim()) ?? "";

/**
 * Resolves a user-facing name from live relationship data.
 *
 * Message and group-member nicknames are snapshots. A current friend remark is
 * authoritative whenever one exists.
 */
export const createUserDisplayNameResolver = (
  friends: Pick<FriendUserItem, "userID" | "remark">[],
): UserDisplayNameResolver => {
  const friendIDs = new Set(friends.map((friend) => friend.userID));
  const remarks = new Map(
    friends
      .filter((friend) => friend.remark?.trim())
      .map((friend) => [friend.userID, friend.remark]),
  );

  return (source, fallback) =>
    firstNonBlank(
      source.userID ? remarks.get(source.userID) : undefined,
      source.userID && friendIDs.has(source.userID) ? undefined : source.remark,
      source.nickname,
      fallback,
      source.userID,
    );
};

export const resolveUserDisplayName = (
  source: UserDisplayNameSource,
  friends: Pick<FriendUserItem, "userID" | "remark">[],
  fallback?: string,
) => createUserDisplayNameResolver(friends)(source, fallback);

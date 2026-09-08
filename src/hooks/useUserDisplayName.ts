import { useMemo } from "react";

import { useContactStore } from "@/store/contact";
import {
  createUserDisplayNameResolver,
  type UserDisplayNameResolver,
  type UserDisplayNameSource,
} from "@/utils/userDisplayName";

export const useUserDisplayNameResolver = (): UserDisplayNameResolver => {
  const friends = useContactStore((state) => state.friendList);

  return useMemo(() => createUserDisplayNameResolver(friends), [friends]);
};

export const useUserDisplayName = (
  source: UserDisplayNameSource,
  fallback?: string,
) => {
  const resolveUserDisplayName = useUserDisplayNameResolver();
  return resolveUserDisplayName(source, fallback);
};

export const getUserDisplayName = (source: UserDisplayNameSource, fallback?: string) =>
  createUserDisplayNameResolver(useContactStore.getState().friendList)(
    source,
    fallback,
  );

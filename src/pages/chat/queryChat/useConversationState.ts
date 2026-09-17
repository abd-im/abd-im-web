import { SessionType } from "@abd-im/wasm-client-sdk";
import { useLatest, useUpdateEffect } from "ahooks";
import { useCallback, useEffect, useRef } from "react";

import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";

export default function useConversationState() {
  const syncState = useUserStore((state) => state.syncState);
  const latestSyncState = useLatest(syncState);
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const latestCurrentConversation = useLatest(currentConversation);
  const unreadTimer = useRef<number>();

  const checkConversationState = useCallback(() => {
    if (!latestCurrentConversation.current || latestSyncState.current === "loading")
      return;

    if (
      latestCurrentConversation.current.unreadCount > 0 &&
      latestCurrentConversation.current.conversationType !== SessionType.WorkingGroup &&
      latestCurrentConversation.current.conversationType !== SessionType.Single
    ) {
      void IMSDK.markConversationMessageAsRead(
        latestCurrentConversation.current.conversationID,
      );
    }
  }, [latestCurrentConversation, latestSyncState]);

  useUpdateEffect(() => {
    if (syncState !== "loading") {
      checkConversationState();
    }
  }, [syncState]);

  useUpdateEffect(() => {
    window.clearTimeout(unreadTimer.current);
    unreadTimer.current = window.setTimeout(checkConversationState, 2000);
    return () => window.clearTimeout(unreadTimer.current);
  }, [checkConversationState, currentConversation?.unreadCount]);

  useEffect(() => {
    checkConversationState();
  }, [checkConversationState, currentConversation?.conversationID]);

  return {
    currentConversation,
  };
}

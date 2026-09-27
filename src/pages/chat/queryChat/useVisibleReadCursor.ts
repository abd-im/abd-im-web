import {
  MessageItem,
  MessageStatus,
  MessageType,
  SessionType,
} from "@abd-im/wasm-client-sdk";
import { useEffect, useRef } from "react";

import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";

import { AT_ALL_TAG } from "./mentions";

export function useVisibleReadCursor(
  message: MessageItem,
  conversationID?: string,
  immediate = false,
) {
  const ref = useRef<HTMLDivElement>(null);
  const cursorReported = useRef("");
  const mentionReported = useRef("");
  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      !conversationID ||
      (message.sessionType !== SessionType.WorkingGroup &&
        message.sessionType !== SessionType.Single) ||
      message.status !== MessageStatus.Succeed ||
      message.seq < 1
    )
      return;
    let visible = false;
    const messageKey = `${conversationID}:${message.seq}`;
    const report = () => {
      const current = useConversationStore.getState().currentConversation;
      if (
        !visible ||
        current?.conversationID !== conversationID ||
        document.visibilityState !== "visible" ||
        !document.hasFocus()
      )
        return;
      const selfID = useUserStore.getState().selfInfo.userID;
      const mayMentionMe =
        message.sessionType === SessionType.WorkingGroup &&
        message.contentType === MessageType.AtTextMessage &&
        message.sendID !== selfID &&
        message.atTextElem?.atUserList?.some(
          (userID) => userID === selfID || userID === AT_ALL_TAG,
        );
      if (
        mayMentionMe &&
        current.unreadMentionCount > 0 &&
        mentionReported.current !== messageKey
      ) {
        mentionReported.current = messageKey;
        void IMSDK.markMentionsRead({ conversationID, seqs: [message.seq] }).catch(
          () => {
            if (mentionReported.current === messageKey) mentionReported.current = "";
          },
        );
      }
      if (cursorReported.current === messageKey) return;
      cursorReported.current = messageKey;
      void IMSDK.markConversationMessageAsReadBySeq({
        conversationID,
        seq: message.seq,
        immediate,
      }).catch(() => {
        if (cursorReported.current === messageKey) cursorReported.current = "";
      });
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible =
          entry.isIntersecting &&
          entry.intersectionRect.height >=
            Math.min(80, entry.boundingClientRect.height * 0.6);
        report();
      },
      {
        threshold: [
          0,
          Math.min(0.6, 80 / Math.max(1, element.getBoundingClientRect().height)),
          1,
        ],
      },
    );
    observer.observe(element);
    const unsubscribe = useConversationStore.subscribe((state, previous) => {
      if (
        state.currentConversation?.unreadMentionCount !==
        previous.currentConversation?.unreadMentionCount
      )
        report();
    });
    document.addEventListener("visibilitychange", report);
    window.addEventListener("focus", report);
    return () => {
      unsubscribe();
      observer.disconnect();
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("focus", report);
    };
  }, [
    conversationID,
    message.seq,
    message.sessionType,
    message.status,
    message.contentType,
    message.sendID,
    message.atTextElem?.atUserList,
    immediate,
  ]);
  return ref;
}

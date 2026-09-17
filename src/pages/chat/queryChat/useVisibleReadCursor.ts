import { MessageItem, MessageStatus, SessionType } from "@abd-im/wasm-client-sdk";
import { useEffect, useRef } from "react";

import { IMSDK } from "@/layout/MainContentWrap";

export function useVisibleReadCursor(
  message: MessageItem,
  conversationID?: string,
  immediate = false,
) {
  const ref = useRef<HTMLDivElement>(null);
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
    let reported = false;
    const report = () => {
      if (
        !visible ||
        reported ||
        document.visibilityState !== "visible" ||
        !document.hasFocus()
      )
        return;
      reported = true;
      void IMSDK.markConversationMessageAsReadBySeq({
        conversationID,
        seq: message.seq,
        immediate,
      }).catch(() => {
        reported = false;
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
    document.addEventListener("visibilitychange", report);
    window.addEventListener("focus", report);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("focus", report);
    };
  }, [conversationID, message.seq, message.sessionType, message.status, immediate]);
  return ref;
}

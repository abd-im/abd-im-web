import { CbEvents, MessageItem, MessageStatus, WSEvent } from "@abd-im/wasm-client-sdk";
import { useEffect, useMemo } from "react";

import { IMSDK } from "@/layout/MainContentWrap";
import { useMessageReadReceiptStore } from "@/store/messageReadReceipt";

export function useMessageReadReceipts(
  conversationID: string | undefined,
  enabled: boolean,
  messages: MessageItem[],
  selfID: string,
) {
  const seqsJSON = JSON.stringify(
    messages
      .filter(
        (message) =>
          message.sendID === selfID &&
          message.status === MessageStatus.Succeed &&
          message.seq > 0 &&
          message.contentType < 1000,
      )
      .map((message) => message.seq),
  );
  const seqs = useMemo(() => JSON.parse(seqsJSON) as number[], [seqsJSON]);

  useEffect(() => {
    if (!conversationID || !enabled) return;
    let cancelled = false;
    let request = 0;
    const refresh = () => {
      const current = ++request;
      void IMSDK.getMessageReadInfo({ conversationID, seqs })
        .then(({ data }) => {
          if (!cancelled && current === request) {
            useMessageReadReceiptStore.getState().update(data);
          }
        })
        .catch((error) => {
          console.warn("getMessageReadInfo failed", error);
        });
    };
    const readStateChangedHandler = ({ data }: WSEvent<string>) => {
      if (data === conversationID) {
        refresh();
      }
    };
    IMSDK.on(CbEvents.OnMessageReadStateChanged, readStateChangedHandler);
    refresh();
    return () => {
      cancelled = true;
      IMSDK.off(CbEvents.OnMessageReadStateChanged, readStateChangedHandler);
    };
  }, [conversationID, enabled, seqs]);
}

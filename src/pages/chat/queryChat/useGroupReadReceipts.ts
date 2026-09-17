import {
  CbEvents,
  MessageItem,
  MessageStatus,
  ReceiptInfo,
  SessionType,
  WSEvent,
} from "@abd-im/wasm-client-sdk";
import { useEffect, useMemo } from "react";

import { IMSDK } from "@/layout/MainContentWrap";
import { useGroupReadReceiptStore } from "@/store/groupReadReceipt";

export function useGroupReadReceipts(
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
      void IMSDK.getGroupMessageReadInfo({ conversationID, seqs })
        .then(({ data }) => {
          if (!cancelled && current === request) {
            useGroupReadReceiptStore.getState().update(data);
          }
        })
        .catch(() => {
          if (!cancelled && current === request) {
            useGroupReadReceiptStore.getState().update({
              conversationID,
              enabled: false,
              status: "error",
              reason: "LOCAL_QUERY_FAILED",
              groupMessageReadInfo: [],
            });
          }
        });
    };
    const readReceiptHandler = ({ data }: WSEvent<ReceiptInfo[]>) => {
      if (
        data.some(
          (receipt) =>
            receipt.sessionType === SessionType.WorkingGroup &&
            receipt.conversationID === conversationID,
        )
      ) {
        refresh();
      }
    };
    IMSDK.on(CbEvents.OnRecvC2CReadReceipt, readReceiptHandler);
    refresh();
    return () => {
      cancelled = true;
      IMSDK.off(CbEvents.OnRecvC2CReadReceipt, readReceiptHandler);
    };
  }, [conversationID, enabled, seqs]);
}

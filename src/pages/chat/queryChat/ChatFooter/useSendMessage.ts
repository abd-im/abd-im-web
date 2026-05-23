import { MessageItem, MessageStatus, SessionType } from "@openim/wasm-client-sdk";
import { useCallback } from "react";
import { useParams } from "react-router-dom";

import { IMSDK } from "@/layout/MainContentWrap";
import { useUserStore } from "@/store";

import { pushNewMessage, updateOneMessage } from "../useHistoryMessageList";

export interface SendMessageParams {
  message: MessageItem;
}

export function useSendMessage() {
  const { conversationID } = useParams();
  const selfInfo = useUserStore((state) => state.selfInfo);

  const sendMessage = useCallback(
    async ({ message }: SendMessageParams) => {
      if (!conversationID) return;

      const isGroup = conversationID.startsWith("sg_");
      const recvID = isGroup ? "" : conversationID.split("_")[1];
      const groupID = isGroup ? conversationID.split("_")[1] : "";

      message.sendID = selfInfo.userID;
      message.senderNickname = selfInfo.nickname;
      message.senderFaceUrl = selfInfo.faceURL;
      message.status = MessageStatus.Sending;
      message.sendTime = Date.now();
      message.sessionType = isGroup ? SessionType.Group : SessionType.Single;

      pushNewMessage(message);

      try {
        const { data } = await IMSDK.sendMessage({
          recvID,
          groupID,
          message,
        });
        updateOneMessage(data);
      } catch (error) {
        message.status = MessageStatus.Failed;
        updateOneMessage({ ...message });
      }
    },
    [conversationID, selfInfo],
  );

  return {
    sendMessage,
  };
}

import { MessageItem, MessageStatus, SessionType } from "@openim/wasm-client-sdk";
import { useCallback } from "react";

import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";

import { pushNewMessage, updateOneMessage } from "../useHistoryMessageList";

export interface SendMessageParams {
  message: MessageItem;
}

export function useSendMessage() {
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const selfInfo = useUserStore((state) => state.selfInfo);

  const sendMessage = useCallback(
    async ({ message }: SendMessageParams) => {
      if (!currentConversation) return;

      const isGroup = currentConversation.conversationType === SessionType.Group;
      const recvID = isGroup ? "" : currentConversation.userID ?? "";
      const groupID = isGroup ? currentConversation.groupID ?? "" : "";

      message.sendID = selfInfo.userID;
      message.senderNickname = selfInfo.nickname;
      message.senderFaceUrl = selfInfo.faceURL;
      message.status = MessageStatus.Sending;
      message.sendTime = Date.now();
      message.sessionType = currentConversation.conversationType;

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
    [currentConversation, selfInfo],
  );

  return {
    sendMessage,
  };
}

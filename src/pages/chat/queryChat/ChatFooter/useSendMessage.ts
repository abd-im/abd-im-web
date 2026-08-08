import {
  ConversationItem,
  MessageItem,
  MessageStatus,
  MessageType,
} from "@abd-im/wasm-client-sdk";
import { t } from "i18next";
import { useCallback } from "react";

import { GroupSessionTypes } from "@/constants/im";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";

import { pushNewMessage, updateOneMessage } from "../useHistoryMessageList";

export interface SendMessageParams {
  message: MessageItem;
  conversation?: ConversationItem;
}

const getPushDesc = (message: MessageItem): string => {
  switch (message.contentType) {
    case MessageType.TextMessage:
      return message.textElem?.content || "";
    case MessageType.AtTextMessage:
      return message.atTextElem?.text || "";
    case MessageType.QuoteMessage:
      return message.quoteElem?.text || "";
    case MessageType.PictureMessage:
      return t("messageDescription.imageMessage");
    case MessageType.VoiceMessage:
      return t("messageDescription.voiceMessage");
    case MessageType.VideoMessage:
      return t("messageDescription.videoMessage");
    case MessageType.FileMessage:
      return t("messageDescription.fileMessage", {
        file: message.fileElem?.fileName || "",
      });
    case MessageType.CardMessage:
      return t("messageDescription.cardMessage");
    case MessageType.LocationMessage:
      return t("messageDescription.locationMessage", {
        location: message.locationElem?.description || "",
      });
    case MessageType.CustomMessage:
      return t("messageDescription.customMessage");
    case MessageType.MergeMessage:
      return t("messageDescription.mergeMessage");
    case MessageType.FaceMessage:
      return t("messageDescription.faceMessage");
    default:
      return t("messageDescription.catchMessage");
  }
};

export function useSendMessage() {
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const selfInfo = useUserStore((state) => state.selfInfo);

  const sendMessage = useCallback(
    async ({ message, conversation }: SendMessageParams) => {
      const targetConversation = conversation ?? currentConversation;
      if (!targetConversation) return false;
      const shouldRenderInCurrentChat =
        targetConversation.conversationID === currentConversation?.conversationID;

      const isGroup = GroupSessionTypes.includes(targetConversation.conversationType);
      const recvID = isGroup ? "" : targetConversation.userID ?? "";
      const groupID = isGroup ? targetConversation.groupID ?? "" : "";

      message.sendID = selfInfo.userID;
      message.senderNickname = selfInfo.nickname;
      message.senderFaceUrl = selfInfo.faceURL;
      message.status = MessageStatus.Sending;
      message.sendTime = Date.now();
      message.sessionType = targetConversation.conversationType;

      if (shouldRenderInCurrentChat) {
        pushNewMessage(message);
      }

      try {
        const offlinePushInfo = {
          title: isGroup ? targetConversation.showName : selfInfo.nickname,
          desc: getPushDesc(message),
          ex: "",
          iOSPushSound: "+1",
          iOSBadgeCount: true,
        };

        const { data } = await IMSDK.sendMessage({
          recvID,
          groupID,
          message,
          offlinePushInfo,
        });
        if (shouldRenderInCurrentChat) {
          updateOneMessage(data);
        }
        return true;
      } catch (error) {
        message.status = MessageStatus.Failed;
        if (shouldRenderInCurrentChat) {
          updateOneMessage({ ...message });
        }
        return false;
      }
    },
    [currentConversation, selfInfo],
  );

  return {
    sendMessage,
  };
}

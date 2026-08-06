import { MessageItem, MessageType } from "@abd-im/wasm-client-sdk";
import { t } from "i18next";

export const getMessagePreview = (message?: MessageItem): string => {
  if (!message) return t("messageDescription.catchMessage");

  switch (message.contentType) {
    case MessageType.TextMessage:
      return message.textElem?.content || "";
    case MessageType.StreamMessage:
      return (
        (message.streamElem?.content || "") +
        (message.streamElem?.packets || []).join("")
      );
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
    case MessageType.RevokeMessage:
      return t("messageDescription.quoteMessageRevoke");
    default:
      return t("messageDescription.catchMessage");
  }
};

import { MessageItem, MessageType } from "@abd-im/wasm-client-sdk";

export const AT_ALL_TAG = "AtAllTag";

export const isMessageMentioningUser = (message: MessageItem, userID: string) =>
  message.contentType === MessageType.AtTextMessage &&
  message.sendID !== userID &&
  Boolean(
    message.atTextElem?.atUserList.some(
      (atUserID) => atUserID === userID || atUserID === AT_ALL_TAG,
    ),
  );

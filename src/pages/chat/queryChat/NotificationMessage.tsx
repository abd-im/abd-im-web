import { MessageItem, MessageType } from "@abd-im/wasm-client-sdk";
import { t } from "i18next";
import { FC, memo } from "react";

import { useUserStore } from "@/store";
import { notificationMessageFormat } from "@/utils/imCommon";

const NotificationMessage: FC<{
  message: MessageItem;
}> = ({ message }) => {
  const selfID = useUserStore((state) => state.selfInfo.userID);

  const getFormatNotification = (msg: MessageItem) => {
    if (msg.contentType === MessageType.BurnMessageChange) {
      try {
        const detail = JSON.parse(msg.notificationElem!.detail);
        const status = detail.isPrivate ? t("open") : t("close");
        return t("messageDescription.burnReadStatus", { status });
      } catch (e) {
        return "";
      }
    }
    if (msg.contentType === MessageType.RevokeMessage) {
      try {
        const detail = JSON.parse(msg.notificationElem!.detail);
        const isSelf = detail.revokerID === selfID;
        const revokerName = isSelf
          ? t("you")
          : detail.revokerNickname || msg.senderNickname;
        return t("messageDescription.revokeMessage", {
          revoker: revokerName,
        });
      } catch (e) {
        return t("messageDescription.revokeMessage", {
          revoker: msg.senderNickname,
        });
      }
    }
    return notificationMessageFormat(msg);
  };

  return (
    <div className="relative" id={`chat_${message.clientMsgID}`}>
      <div className="mx-6 py-3 text-center text-xs text-[var(--sub-text)]">
        {String(getFormatNotification(message))}
      </div>
    </div>
  );
};

export default memo(NotificationMessage);

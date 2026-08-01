import { MessageItem, MessageType } from "@openim/wasm-client-sdk";
import clsx from "clsx";
import { t } from "i18next";
import { FC, memo, useRef } from "react";

import { useUserStore } from "@/store";
import { notificationMessageFormat } from "@/utils/imCommon";

const NotificationMessage: FC<{
  message: MessageItem;
}> = ({ message }) => {
  const messageWrapRef = useRef<HTMLDivElement>(null);
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
          revoker: `<span class="text-brand font-medium mx-1">${revokerName}</span>`,
        });
      } catch (e) {
        return t("messageDescription.revokeMessage", {
          revoker: `<span class="text-brand font-medium mx-1">${msg.senderNickname}</span>`,
        });
      }
    }
    return notificationMessageFormat(msg);
  };

  return (
    <div className="relative" id={`chat_${message.clientMsgID}`}>
      <div
        ref={messageWrapRef}
        className={clsx("mx-6 py-3 text-center text-xs text-[var(--sub-text)]")}
        dangerouslySetInnerHTML={{
          __html: String(getFormatNotification(message)),
        }}
      ></div>
    </div>
  );
};

export default memo(NotificationMessage);

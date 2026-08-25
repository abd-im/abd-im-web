import { MessageStatus, SessionType } from "@abd-im/wasm-client-sdk";
import clsx from "clsx";
import { FC } from "react";
import { useTranslation } from "react-i18next";

import { useUserStore } from "@/store";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const MessageSuffix: FC<IMessageItemProps> = ({ message }) => {
  const { t } = useTranslation();
  const selfID = useUserStore((state) => state.selfInfo.userID);

  const isSelf = message.sendID === selfID;
  const isRead = message.isRead;
  const showReadStatus = message.sessionType === SessionType.Single;

  if (
    !isSelf ||
    message.status === MessageStatus.Failed ||
    (!showReadStatus && message.status === MessageStatus.Succeed)
  ) {
    return null;
  }

  return (
    <div
      className={styles.suffix}
      style={{ minWidth: "40px", minHeight: "16px", display: "flex" }}
    >
      {message.status === MessageStatus.Succeed && (
        <span
          className={clsx(
            "select-none text-xs font-normal leading-none",
            !showReadStatus && "hidden",
            isRead ? "text-[#999]" : "text-brand",
          )}
        >
          {isRead ? t("placeholder.isRead") : t("placeholder.unread")}
        </span>
      )}
    </div>
  );
};

export default MessageSuffix;

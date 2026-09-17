import type { AtUsersInfoItem } from "@abd-im/wasm-client-sdk/lib/types/entity";
import { Fragment, type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  useUserDisplayName,
  useUserDisplayNameResolver,
} from "@/hooks/useUserDisplayName";
import { emit } from "@/utils/events";

import { AT_ALL_TAG } from "../mentions";
import { getMessagePreview } from "../messagePreview";
import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";
import MessageText from "./MessageText";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const AtTextMessageRender = ({ message }: IMessageItemProps) => {
  const { t } = useTranslation();
  const resolveUserDisplayName = useUserDisplayNameResolver();
  const atTextElem = message.atTextElem;
  const quoteMessage = atTextElem?.quoteMessage;
  const snapshotAuthor = quoteMessage?.senderNickname || quoteMessage?.sendID || "";
  const quoteAuthor = useUserDisplayName(
    {
      userID: quoteMessage?.sendID,
      nickname: snapshotAuthor,
    },
    snapshotAuthor,
  );

  const content = useMemo(() => {
    const text = atTextElem?.text ?? "";
    const infoByToken = new Map<string, AtUsersInfoItem>();
    atTextElem?.atUsersInfo?.forEach((item) => {
      infoByToken.set(`@${item.groupNickname}`, item);
    });
    const tokens = [...infoByToken.keys()].sort((a, b) => b.length - a.length);
    if (!tokens.length) return <MessageText text={text} />;

    const matcher = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "g");
    return text.split(matcher).map((part, index): ReactNode => {
      const info = infoByToken.get(part);
      if (!info)
        return (
          <Fragment key={index}>
            <MessageText text={part} />
          </Fragment>
        );
      const label =
        info.atUserID === AT_ALL_TAG
          ? t("placeholder.mentionAll")
          : resolveUserDisplayName(
              { userID: info.atUserID, nickname: info.groupNickname },
              info.groupNickname,
            );
      if (info.atUserID === AT_ALL_TAG) {
        return (
          <span key={`${info.atUserID}-${index}`} className={styles["message-mention"]}>
            @{label}
          </span>
        );
      }
      return (
        <button
          key={`${info.atUserID}-${index}`}
          type="button"
          className={styles["message-mention"]}
          onClick={() => window.userClick(info.atUserID, message.groupID)}
        >
          @{label}
        </button>
      );
    });
  }, [atTextElem, message.groupID, resolveUserDisplayName, t]);

  return (
    <div className={styles.bubble}>
      {quoteMessage && (
        <button
          type="button"
          className={styles["message-quote"]}
          disabled={!quoteMessage.clientMsgID}
          onClick={() => {
            if (!quoteMessage.clientMsgID) return;
            emit("LOCATE_QUOTED_MESSAGE", {
              clientMsgID: quoteMessage.clientMsgID,
              sourceMessage: quoteMessage,
            });
          }}
        >
          <span className={styles["message-quote-label"]}>
            {t("placeholder.reply")} {quoteAuthor}:{" "}
          </span>
          <span className={styles["message-quote-text"]}>
            {getMessagePreview(quoteMessage)}
          </span>
        </button>
      )}
      <div className={styles["quote-message-text"]} data-quote-source>
        {content}
      </div>
    </div>
  );
};

export default AtTextMessageRender;

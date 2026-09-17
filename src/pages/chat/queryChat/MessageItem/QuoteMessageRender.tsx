import { FC } from "react";
import { useTranslation } from "react-i18next";

import { useUserDisplayName } from "@/hooks/useUserDisplayName";
import { emit } from "@/utils/events";

import { getMessagePreview } from "../messagePreview";
import type { PartialQuoteElem } from "../partialQuote";
import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";
import MessageText from "./MessageText";

const QuoteMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const { t } = useTranslation();
  const quoteElem = message.quoteElem as PartialQuoteElem | undefined;
  const quoteMessage = quoteElem?.quoteMessage;
  const text = quoteElem?.text || "";
  const snapshotAuthor = quoteMessage?.senderNickname || quoteMessage?.sendID || "";
  const quoteAuthor = useUserDisplayName(
    {
      userID: quoteMessage?.sendID,
      nickname: snapshotAuthor,
    },
    snapshotAuthor,
  );
  const mentionToken =
    message.groupID && snapshotAuthor && text.startsWith(`@${snapshotAuthor}`)
      ? `@${snapshotAuthor}`
      : "";

  return (
    <div className={styles.bubble}>
      <button
        type="button"
        className={styles["message-quote"]}
        disabled={!quoteMessage?.clientMsgID}
        onClick={() => {
          if (!quoteMessage?.clientMsgID) return;
          emit("LOCATE_QUOTED_MESSAGE", {
            clientMsgID: quoteMessage.clientMsgID,
            quoteText: quoteElem?.quoteText,
            quoteOffset: quoteElem?.quoteOffset,
            sourceMessage: quoteMessage,
          });
        }}
      >
        <span className={styles["message-quote-label"]}>
          {t("placeholder.reply")} {quoteAuthor}:{" "}
        </span>
        <span className={styles["message-quote-text"]}>
          {quoteElem?.quoteText || getMessagePreview(quoteMessage)}
        </span>
      </button>
      <div className={styles["quote-message-text"]} data-quote-source>
        {mentionToken && quoteMessage?.sendID && (
          <button
            type="button"
            className={styles["message-mention"]}
            onClick={() => window.userClick(quoteMessage.sendID, message.groupID)}
          >
            @{quoteAuthor}
          </button>
        )}
        <MessageText text={mentionToken ? text.slice(mentionToken.length) : text} />
      </div>
    </div>
  );
};

export default QuoteMessageRender;

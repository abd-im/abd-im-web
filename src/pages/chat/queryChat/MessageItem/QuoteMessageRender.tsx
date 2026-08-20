import { FC } from "react";
import { useTranslation } from "react-i18next";

import { emit } from "@/utils/events";

import { getMessagePreview } from "../messagePreview";
import type { PartialQuoteElem } from "../partialQuote";
import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const QuoteMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const { t } = useTranslation();
  const quoteElem = message.quoteElem as PartialQuoteElem | undefined;
  const quoteMessage = quoteElem?.quoteMessage;
  const text = quoteElem?.text || "";
  const quoteAuthor = quoteMessage?.senderNickname || quoteMessage?.sendID || "";
  const mention =
    message.groupID && quoteAuthor && text.startsWith(`@${quoteAuthor}`)
      ? `@${quoteAuthor}`
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
        {mention && <span className={styles["message-mention"]}>{mention}</span>}
        {mention ? text.slice(mention.length) : text}
      </div>
    </div>
  );
};

export default QuoteMessageRender;

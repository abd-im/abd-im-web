import { FC } from "react";
import { useTranslation } from "react-i18next";

import { getMessagePreview } from "../messagePreview";
import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const QuoteMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const { t } = useTranslation();
  const quoteMessage = message.quoteElem?.quoteMessage;
  const text = message.quoteElem?.text || "";
  const quoteAuthor = quoteMessage?.senderNickname || quoteMessage?.sendID || "";
  const mention =
    message.groupID && quoteAuthor && text.startsWith(`@${quoteAuthor}`)
      ? `@${quoteAuthor}`
      : "";

  return (
    <div className={styles.bubble}>
      <div className={styles["message-quote"]}>
        <span className={styles["message-quote-label"]}>
          {t("placeholder.reply")} {quoteAuthor}:{" "}
        </span>
        <span className={styles["message-quote-text"]}>
          {getMessagePreview(quoteMessage)}
        </span>
      </div>
      <div className={styles["quote-message-text"]}>
        {mention && <span className={styles["message-mention"]}>{mention}</span>}
        {mention ? text.slice(mention.length) : text}
      </div>
    </div>
  );
};

export default QuoteMessageRender;

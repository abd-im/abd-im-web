import { FC } from "react";
import ReactMarkdown from "react-markdown";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const StreamMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const content =
    (message.streamElem?.content ?? "") + (message.streamElem?.packets ?? []).join("");

  if (message.streamElem?.type === "markdown") {
    return (
      <div className={styles.bubble}>
        <div className={styles["markdown-content"]} data-quote-source>
          <ReactMarkdown skipHtml>{content}</ReactMarkdown>
        </div>
      </div>
    );
  }

  return <div className={styles.bubble}>{content}</div>;
};

export default StreamMessageRender;

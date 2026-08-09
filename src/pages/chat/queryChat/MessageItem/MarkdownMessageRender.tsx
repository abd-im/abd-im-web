import { FC } from "react";
import ReactMarkdown from "react-markdown";

import { getMarkdownMessageContent } from "../markdownMessage";
import type { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const MarkdownMessageRender: FC<IMessageItemProps> = ({ message }) => (
  <div className={styles.bubble}>
    <div className={styles["markdown-content"]}>
      <ReactMarkdown skipHtml>{getMarkdownMessageContent(message)}</ReactMarkdown>
    </div>
  </div>
);

export default MarkdownMessageRender;

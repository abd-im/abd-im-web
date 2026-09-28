import { FC } from "react";

import MarkdownContent from "@/components/MarkdownContent";

import { getMarkdownMessageContent } from "../markdownMessage";
import type { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const MarkdownMessageRender: FC<IMessageItemProps> = ({ message }) => (
  <div className={styles.bubble}>
    <div className={styles["markdown-content"]} data-quote-source>
      <MarkdownContent>{getMarkdownMessageContent(message)}</MarkdownContent>
    </div>
  </div>
);

export default MarkdownMessageRender;

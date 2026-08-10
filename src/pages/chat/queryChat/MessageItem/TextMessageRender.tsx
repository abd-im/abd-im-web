import { FC } from "react";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const TextMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const content = message.textElem?.content ?? "";

  return (
    <div className={styles.bubble}>
      <span>{content}</span>
    </div>
  );
};

export default TextMessageRender;

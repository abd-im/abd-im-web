import { FC } from "react";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const TextMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const content = message.textElem?.content ?? message.atTextElem?.text ?? "";

  return (
    <div className={styles.bubble} data-quote-source>
      <span>{content}</span>
    </div>
  );
};

export default TextMessageRender;

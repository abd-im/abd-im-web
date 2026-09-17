import { FC } from "react";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";
import MessageText from "./MessageText";

const TextMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const content = message.textElem?.content ?? message.atTextElem?.text ?? "";

  return (
    <div className={styles.bubble} data-quote-source>
      <MessageText text={content} />
    </div>
  );
};

export default TextMessageRender;

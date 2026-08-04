import { FC } from "react";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const StreamMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const content =
    (message.streamElem?.content ?? "") + (message.streamElem?.packets ?? []).join("");

  return <div className={styles.bubble}>{content}</div>;
};

export default StreamMessageRender;

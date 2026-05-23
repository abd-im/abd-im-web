import { FC } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { formatBr } from "@/utils/common";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const TextMessageRender: FC<IMessageItemProps> = ({ message }) => {
  let content = message.textElem?.content;
  content = formatBr(content!);

  return (
    <div className={styles.bubble}>
      <span dangerouslySetInnerHTML={{ __html: content }}></span>
    </div>
  );
};

export default TextMessageRender;

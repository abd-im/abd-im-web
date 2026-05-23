import { FileOutlined } from "@ant-design/icons";
import clsx from "clsx";
import { FC } from "react";
import { useTranslation } from "react-i18next";

import { bytesToSize } from "@/utils/common";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const FileMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const fileElem = message.fileElem;
  if (!fileElem) return null;

  const downloadFile = () => {
    const url = fileElem.sourceUrl || fileElem.filePath;
    if (url) {
      window.open(url);
    }
  };

  return (
    <div
      className={clsx(styles.bubble, "relative flex min-w-[200px] cursor-pointer items-center")}
      onClick={downloadFile}
    >
      <FileOutlined style={{ fontSize: 32, marginRight: 12 }} />
      <div className="flex flex-col overflow-hidden">
        <div className="max-w-[150px] truncate font-medium">{fileElem.fileName}</div>
        <div className="text-xs text-[var(--sub-text)]">
          {bytesToSize(fileElem.fileSize)}
        </div>
      </div>
    </div>
  );
};

export default FileMessageRender;

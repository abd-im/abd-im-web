import { Modal } from "antd";
import { FileText } from "lucide-react";
import { FC, useState } from "react";
import { useTranslation } from "react-i18next";

import { getMessagePreview } from "../messagePreview";
import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const MergeMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const merge = message.mergeElem;
  const summaries = merge?.abstractList ?? [];
  const messages = merge?.multiMessage ?? [];

  return (
    <>
      <button
        type="button"
        className={`${styles.bubble} ${styles["merge-message-card"]}`}
        onClick={() => setOpen(true)}
      >
        <span className={styles["merge-message-title"]}>
          <FileText size={16} aria-hidden />
          {merge?.title || t("placeholder.messageHistory")}
        </span>
        <span className={styles["merge-message-summary"]}>
          {(summaries.length ? summaries : [t("messageDescription.mergeMessage")])
            .slice(0, 2)
            .map((summary, index) => (
              <span key={`${summary}-${index}`}>{summary}</span>
            ))}
        </span>
        <span className={styles["merge-message-footer"]}>
          {t("placeholder.viewForwardRecord", { count: messages.length })}
        </span>
      </button>
      <Modal
        title={merge?.title || t("placeholder.messageHistory")}
        open={open}
        footer={null}
        onCancel={() => setOpen(false)}
        width={560}
      >
        <div className={styles["merge-record-list"]}>
          {messages.map((record, index) => (
            <div key={record.clientMsgID || `${record.sendID}-${index}`}>
              <div className={styles["merge-record-meta"]}>
                <span>{record.senderNickname || record.sendID}</span>
                <span>{new Date(record.sendTime).toLocaleString()}</span>
              </div>
              <div className={styles["merge-record-bubble"]}>
                {getMessagePreview(record)}
              </div>
            </div>
          ))}
          {!messages.length && (
            <p className="py-8 text-center text-sm text-[var(--sub-text)]">
              {t("placeholder.noData")}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
};

export default MergeMessageRender;

import { Modal } from "antd";
import { FileText } from "lucide-react";
import { FC, useState } from "react";
import { useTranslation } from "react-i18next";

import { useUserDisplayNameResolver } from "@/hooks/useUserDisplayName";

import { messageDate } from "../messageDate";
import { getMessagePreview } from "../messagePreview";
import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const MergeMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const resolveUserDisplayName = useUserDisplayNameResolver();
  const merge = message.mergeElem;
  const summaries = merge?.abstractList ?? [];
  const messages = merge?.multiMessage ?? [];
  const title = merge?.title || t("placeholder.messageHistory");

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
        title={
          <div className={styles["merge-record-title"]}>
            <strong>{title}</strong>
            <span>
              {t("placeholder.forwardRecordSummary", {
                count: messages.length,
                title,
              })}
            </span>
          </div>
        }
        open={open}
        footer={null}
        onCancel={() => setOpen(false)}
        width={740}
        rootClassName={styles["merge-record-modal"]}
      >
        <div className={styles["merge-record-list"]}>
          {messages.map((record, index) => (
            <div key={record.clientMsgID || `${record.sendID}-${index}`}>
              <div className={styles["merge-record-meta"]}>
                <span>
                  {resolveUserDisplayName({
                    userID: record.sendID,
                    nickname: record.senderNickname,
                  })}
                </span>
                <span>{messageDate(record.sendTime).format("HH:mm")}</span>
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

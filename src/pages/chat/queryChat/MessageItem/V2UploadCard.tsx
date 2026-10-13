import type { MessageItem } from "@abd-im/wasm-client-sdk";
import { X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { bytesToSize } from "@/utils/common";
import { emit } from "@/utils/events";

import { clearMessageRetry } from "../ChatFooter/messageRetry";
import {
  cancelUploadTasks,
  clearUploadProgress,
  getUploadProgress,
  subscribeUploadProgress,
} from "../uploadProgress";
import styles from "./v2-message.module.scss";

export interface UploadAttachmentItem {
  id?: string;
  filename: string;
  size: number;
}

const getMessageConversationID = (message: MessageItem) => {
  if (message.groupID) return `sg_${message.groupID}`;
  return `si_${[message.sendID, message.recvID].sort().join("_")}`;
};

export function getUploadingAttachments(message: MessageItem): UploadAttachmentItem[] {
  const body = message.message;
  if (!body) return [];
  if (body.attachments && body.attachments.length > 0) {
    return body.attachments.map((att) => ({
      id: att.id,
      filename: att.filename || "attachment",
      size: att.size || 0,
    }));
  }
  const result: UploadAttachmentItem[] = [];
  for (const component of body.components || []) {
    if (component.type === 12 && component.items) {
      for (const item of component.items) {
        const url = item.media?.url || "";
        const filename =
          item.description || url.split("/").pop()?.split("?")[0] || "image.png";
        result.push({ filename, size: 0 });
      }
    } else if (component.type === 13 && component.file) {
      const url = component.file.url || "";
      const filename =
        component.name ||
        component.description ||
        url.split("/").pop()?.split("?")[0] ||
        "file";
      result.push({ filename, size: component.size || 0 });
    } else if (component.type === 11 && component.media) {
      const url = component.media.url || "";
      const filename =
        component.description || url.split("/").pop()?.split("?")[0] || "attachment";
      result.push({ filename, size: 0 });
    }
  }
  return result;
}

export default function V2UploadCard({
  message,
  attachments,
}: {
  message: MessageItem;
  attachments?: UploadAttachmentItem[];
}) {
  const { t } = useTranslation();
  const [, setProgressRevision] = useState(0);

  const files = attachments?.length ? attachments : getUploadingAttachments(message);
  const progressIDs = files.map((file) => file.id).filter(Boolean) as string[];
  const progressKey = progressIDs.join("\u0000");
  useEffect(() => {
    const ids = progressKey ? progressKey.split("\u0000") : [];
    if (!ids.length) return;
    const unsubscribe = ids.map((id) =>
      subscribeUploadProgress(id, () =>
        setProgressRevision((revision) => revision + 1),
      ),
    );
    return () => {
      unsubscribe.forEach((dispose) => dispose());
      ids.forEach((id) => clearUploadProgress(id));
    };
  }, [progressKey]);

  const progressValues = progressIDs
    .map((id) => getUploadProgress(id))
    .filter((progress): progress is NonNullable<typeof progress> => Boolean(progress));
  const progressTotal = progressValues.reduce(
    (sum, progress) => sum + progress.total,
    0,
  );
  const progressCurrent = progressValues.reduce(
    (sum, progress) => sum + progress.current,
    0,
  );
  const progress =
    progressTotal > 0
      ? Math.min(100, Math.floor((progressCurrent / progressTotal) * 100))
      : 0;
  const isMultiple = files.length > 1;
  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
  const sizeText = totalSize > 0 ? bytesToSize(totalSize) : "";

  let title: string;
  if (isMultiple) {
    if (sizeText) {
      title = t("attachments.uploadingMultipleWithSize", {
        count: files.length,
        size: sizeText,
        defaultValue: `正在上传 ${files.length} 个文件 — ${sizeText}`,
      });
    } else {
      title = t("attachments.uploadingMultiple", {
        count: files.length,
        defaultValue: `正在上传 ${files.length} 个文件`,
      });
    }
  } else {
    title = files[0]?.filename || "attachment";
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    progressIDs.forEach((id) => {
      cancelUploadTasks(id);
      clearUploadProgress(id);
    });
    if (message.clientMsgID) {
      clearMessageRetry(message.clientMsgID);
      emit("DELETE_ONE_MSG", message.clientMsgID);
      void import("@/layout/MainContentWrap")
        .then(({ IMSDK }) =>
          IMSDK.deleteMessageFromLocalStorage({
            conversationID: getMessageConversationID(message),
            clientMsgID: message.clientMsgID,
          }),
        )
        .catch(() => undefined);
    }
  };

  return (
    <div className={styles.uploadCard} data-upload-card>
      <svg
        width="26"
        height="32"
        viewBox="0 0 26 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.uploadCardIcon}
        aria-hidden="true"
      >
        <path
          d="M2.5 0C1.11929 0 0 1.11929 0 2.5V29.5C0 30.8807 1.11929 32 2.5 32H23.5C24.8807 32 26 30.8807 26 29.5V8.5L17.5 0H2.5Z"
          fill="#B5BAF8"
        />
        <path d="M17.5 0V6C17.5 7.38071 18.6193 8.5 20 8.5H26L17.5 0Z" fill="#858FE8" />
      </svg>
      <div className={styles.uploadCardContent}>
        <div className={styles.uploadCardTitle} title={title}>
          {title}
        </div>
        <div className={styles.uploadProgressTrack}>
          <div className={styles.uploadProgressBar} style={{ width: `${progress}%` }} />
        </div>
      </div>
      <button
        type="button"
        className={styles.uploadCancelBtn}
        onClick={handleCancel}
        aria-label={t("cancel") || "取消"}
        title={t("cancel") || "取消"}
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

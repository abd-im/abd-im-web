import {
  FileText,
  FileImage,
  FileCode2,
  FileArchive,
  FileMusic,
  FileVideo,
  Eye,
} from "lucide-react";
import { FC, useState } from "react";
import { useTranslation } from "react-i18next";

import { bytesToSize } from "@/utils/common";

import { IMessageItemProps } from ".";
import { getSafeFileUrl } from "./filePreview";
import FilePreviewModal from "./FilePreviewModal";
import styles from "./v2-message.module.scss";

const FileMessageRender: FC<IMessageItemProps & { fluid?: boolean }> = ({
  message,
  fluid,
}) => {
  const { t } = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileElem = message.fileElem;
  if (!fileElem) return null;

  const url = fileElem.sourceUrl || fileElem.filePath;
  const extension = fileElem.fileName.split(".").pop()?.toLowerCase() || "";
  const Icon = /^(png|jpe?g|webp|gif|svg)$/.test(extension)
    ? FileImage
    : /^(zip|rar|7z|tar|gz)$/.test(extension)
    ? FileArchive
    : /^(mp3|wav|ogg|m4a|flac)$/.test(extension)
    ? FileMusic
    : /^(mp4|webm|mov)$/.test(extension)
    ? FileVideo
    : /^(json|js|ts|py|go|yaml|html|css)$/.test(extension)
    ? FileCode2
    : FileText;

  return (
    <>
      <button
        type="button"
        className={`${styles.fileCard} ${fluid ? styles.fileFluid : ""}`}
        disabled={!getSafeFileUrl(url)}
        title={t("filePreview.open")}
        onClick={() => setPreviewOpen(true)}
      >
        <span
          className={styles.fileIcon}
          data-kind={
            extension === "pdf" ? "pdf" : extension === "md" ? "markdown" : "file"
          }
        >
          <Icon size={25} strokeWidth={1.7} />
        </span>
        <span className="min-w-0 flex-1">
          <strong className={styles.fileName}>{fileElem.fileName}</strong>
          <span className="mt-1 block text-xs text-muted-foreground">
            {extension && (
              <>
                {extension.toUpperCase()} <span aria-hidden> · </span>
              </>
            )}
            {fileElem.fileSize > 0
              ? bytesToSize(Number(fileElem.fileSize))
              : t("placeholder.fileSizeUnknown")}
          </span>
        </span>
        <Eye size={17} className={styles.filePreviewIcon} aria-hidden />
      </button>
      {previewOpen && (
        <FilePreviewModal
          message={message}
          name={fileElem.fileName}
          url={url}
          size={Number(fileElem.fileSize)}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
};

export default FileMessageRender;

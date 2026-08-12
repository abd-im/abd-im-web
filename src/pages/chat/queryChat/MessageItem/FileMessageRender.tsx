import { FileText } from "lucide-react";
import { FC } from "react";
import { useTranslation } from "react-i18next";

import { bytesToSize } from "@/utils/common";

import { IMessageItemProps } from ".";

const FileMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const { t } = useTranslation();
  const fileElem = message.fileElem;
  if (!fileElem) return null;

  const downloadFile = () => {
    const url = fileElem.sourceUrl || fileElem.filePath;
    if (url) {
      window.open(url);
    }
  };

  return (
    <button
      type="button"
      className="relative flex min-w-[240px] max-w-[300px] items-center gap-3 rounded-lg border border-surface-border bg-surface p-3 text-left text-foreground shadow-surface transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      disabled={!fileElem.sourceUrl && !fileElem.filePath}
      onClick={downloadFile}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-app-shell text-muted-foreground">
        <FileText size={25} strokeWidth={1.6} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-semibold">
          {fileElem.fileName}
        </strong>
        <span className="mt-1 block text-xs text-muted-foreground">
          {fileElem.fileSize > 0
            ? bytesToSize(Number(fileElem.fileSize))
            : t("placeholder.fileSizeUnknown")}
        </span>
      </span>
    </button>
  );
};

export default FileMessageRender;

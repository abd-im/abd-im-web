import { FileText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui";
import type { ComposerAttachment } from "@/store/composer";
import { bytesToSize } from "@/utils/common";

import { getAttachmentType } from "./attachmentType";

function AttachmentThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (getAttachmentType(file) !== "image") return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? (
    <img
      src={url}
      alt={file.name}
      className="h-12 w-12 shrink-0 rounded object-contain"
    />
  ) : (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded bg-app-shell text-muted-foreground">
      <FileText size={24} />
    </span>
  );
}

export default function ComposerAttachments({
  attachments,
  disabled,
  onRemove,
}: {
  attachments: ComposerAttachment[];
  disabled: boolean;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className="composer-attachments" aria-label={t("attachments.pending")}>
      {attachments.map(({ id, file }) => (
        <li key={id} className="composer-attachment">
          <AttachmentThumbnail file={file} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium" title={file.name}>
              {file.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {bytesToSize(file.size)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={t("attachments.remove", { name: file.name })}
            onClick={() => onRemove(id)}
          >
            <X size={14} />
          </Button>
        </li>
      ))}
    </ul>
  );
}

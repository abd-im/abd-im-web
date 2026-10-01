import type { MessageItem } from "@abd-im/wasm-client-sdk";
import { X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ImageViewer } from "@/components/ImageViewer";
import { MediaProgress } from "@/components/MediaProgress";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  Spinner,
} from "@/components/ui";
import { useCachedMedia } from "@/hooks/useCachedMedia";
import { feedbackToast } from "@/utils/common";

import {
  getFilePreviewType,
  getPreviewSizeLimit,
  getSafeFileUrl,
  loadFilePreview,
  PreviewTooLargeError,
} from "./filePreview";
import styles from "./message-item.module.scss";

const PdfPreview = lazy(() => import("./PdfPreview"));

export default function FilePreviewModal({
  name,
  url,
  size,
  message,
  onClose,
}: {
  name: string;
  url: string;
  size: number;
  message: MessageItem;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const type = getFilePreviewType(name);
  const media = useCachedMedia(message, "source", true, true);
  const safeUrl = getSafeFileUrl(media.managed ? media.file?.location || "" : url);
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState<string>();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSource(undefined);
    setText("");
    setError("");
    setLoading(false);
    if (!type || !safeUrl) return;
    const limit = getPreviewSizeLimit(type);
    if (size > limit) {
      setError("tooLarge");
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | undefined;
    let cancelled = false;
    setLoading(true);
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    void loadFilePreview(safeUrl, limit, controller.signal)
      .then(async (blob) => {
        if (type === "text" || type === "markdown") {
          const content = await blob.text();
          if (!controller.signal.aborted) setText(content);
        } else if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setSource(objectUrl);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof PreviewTooLargeError ? "tooLarge" : "failed");
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [safeUrl, size, type, attempt]);

  const footer = (
    <div className="flex shrink-0 justify-end gap-2">
      <Button onClick={onClose}>{t("filePreview.close")}</Button>
      {media.managed ? (
        <Button
          variant="primary"
          disabled={!media.file}
          onClick={() => {
            if (media.file)
              void window
                .electronAPI!.media.save(media.file.ref, name)
                .catch((error) => feedbackToast({ error }));
          }}
        >
          {t("mediaCache.saveAs")}
        </Button>
      ) : (
        safeUrl &&
        !message.attachedInfoElem?.isPrivateChat && (
          <Button asChild variant="primary">
            <a href={safeUrl} target="_blank" rel="noopener noreferrer" download={name}>
              {t("filePreview.download")}
            </a>
          </Button>
        )
      )}
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={type === "image" ? "image-preview-dialog" : "file-preview-dialog"}
      >
        <header className="flex items-center justify-between gap-3">
          <DialogTitle
            className="min-w-0 truncate text-base font-semibold"
            title={name}
          >
            {name}
          </DialogTitle>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${t("filePreview.close")} ${name}`}
            >
              <X />
            </Button>
          </DialogClose>
        </header>
        <div
          className={
            type === "image"
              ? "flex min-h-0 flex-1 flex-col"
              : "min-h-0 flex-1 overflow-auto py-3"
          }
          data-testid="file-preview-content"
        >
          {media.managed && !media.file ? (
            <MediaProgress media={media} />
          ) : !type || !safeUrl ? (
            <p className="py-12 text-center text-muted-foreground">
              {t("filePreview.unsupported")}
            </p>
          ) : loading ? (
            <div className="grid h-full place-items-center">
              <Spinner label={t("filePreview.loading")} />
            </div>
          ) : error ? (
            <div className="space-y-3 py-12 text-center" role="alert">
              <p>
                {t(`filePreview.${error}`, {
                  size: getPreviewSizeLimit(type) / 1024 / 1024,
                })}
              </p>
              {error === "failed" && (
                <Button onClick={() => setAttempt((value) => value + 1)}>
                  {t("filePreview.retry")}
                </Button>
              )}
            </div>
          ) : type === "markdown" ? (
            <div className={`typeset ${styles["file-markdown"]}`}>
              <ReactMarkdown
                skipHtml
                remarkPlugins={[remarkGfm]}
                urlTransform={(url, key) => {
                  const protocols =
                    key === "src"
                      ? ["https:", "http:"]
                      : ["https:", "http:", "mailto:"];
                  try {
                    return protocols.includes(new URL(url).protocol) ? url : "";
                  } catch {
                    return "";
                  }
                }}
                components={{
                  table: ({ children }) => (
                    <div className="typeset-scroll">
                      <table>{children}</table>
                    </div>
                  ),
                  a: ({ children, href }) =>
                    href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ) : (
                      <span>{children}</span>
                    ),
                  img: ({ src, alt }) =>
                    src ? (
                      <img
                        src={src}
                        alt={alt || ""}
                        className="max-h-[60vh] object-contain"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span>{alt}</span>
                    ),
                }}
              >
                {text}
              </ReactMarkdown>
            </div>
          ) : type === "text" ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-sm">
              {text}
            </pre>
          ) : type === "image" && source ? (
            <ImageViewer src={source} alt={name} onError={() => setError("failed")} />
          ) : type === "pdf" && source ? (
            <Suspense fallback={<Spinner />}>
              <PdfPreview source={source} name={name} />
            </Suspense>
          ) : null}
        </div>
        {footer}
      </DialogContent>
    </Dialog>
  );
}

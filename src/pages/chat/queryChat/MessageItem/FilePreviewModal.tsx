import { Modal, Spin } from "antd";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui";

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
  onClose,
}: {
  name: string;
  url: string;
  size: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const type = getFilePreviewType(name);
  const safeUrl = getSafeFileUrl(url);
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

  return (
    <Modal
      open
      title={
        <span className="block truncate pr-8" title={name}>
          {name}
        </span>
      }
      width={900}
      onCancel={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("filePreview.close")}</Button>
          {safeUrl && (
            <Button asChild variant="primary">
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={name}
              >
                {t("filePreview.download")}
              </a>
            </Button>
          )}
        </div>
      }
    >
      <div
        className="max-h-[65vh] min-h-[240px] overflow-auto py-3"
        data-testid="file-preview-content"
      >
        {!type || !safeUrl ? (
          <p className="py-12 text-center text-muted-foreground">
            {t("filePreview.unsupported")}
          </p>
        ) : loading ? (
          <div className="grid min-h-[240px] place-items-center">
            <Spin tip={t("filePreview.loading")} />
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
          <div className={styles["file-markdown"]}>
            <ReactMarkdown
              skipHtml
              remarkPlugins={[remarkGfm]}
              urlTransform={(url, key) => {
                const protocols =
                  key === "src" ? ["https:", "http:"] : ["https:", "http:", "mailto:"];
                try {
                  return protocols.includes(new URL(url).protocol) ? url : "";
                } catch {
                  return "";
                }
              }}
              components={{
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
          <img
            className="mx-auto max-h-[60vh] max-w-full object-contain"
            src={source}
            alt={name}
            onError={() => setError("failed")}
          />
        ) : type === "pdf" && source ? (
          <Suspense fallback={<Spin />}>
            <PdfPreview source={source} name={name} />
          </Suspense>
        ) : null}
      </div>
    </Modal>
  );
}

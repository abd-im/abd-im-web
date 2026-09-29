import { Spin } from "antd";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui";

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({ source, name }: { source: string; name: string }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDocument(undefined);
    setPageNumber(1);
    setLoading(true);
    setFailed(false);
    const assets = new URL("./pdfjs/", window.document.baseURI).href;
    const task = getDocument({
      url: source,
      cMapUrl: `${assets}cmaps/`,
      standardFontDataUrl: `${assets}standard_fonts/`,
      wasmUrl: `${assets}wasm/`,
      enableXfa: false,
    });
    void task.promise
      .then((pdf) => {
        if (!cancelled) setDocument(pdf);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [source, attempt]);

  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    let rendering: RenderTask | undefined;
    setLoading(true);
    void document
      .getPage(pageNumber)
      .then(async (page) => {
        if (cancelled || !canvas.current) return;
        const base = page.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.min(800 / base.width, 1200 / base.height, 2);
        const viewport = page.getViewport({ scale: scale * ratio });
        canvas.current.width = viewport.width;
        canvas.current.height = viewport.height;
        canvas.current.style.width = `${viewport.width / ratio}px`;
        rendering = page.render({ canvas: canvas.current, viewport });
        await rendering.promise;
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      rendering?.cancel();
    };
  }, [document, pageNumber]);

  return (
    <div>
      {document && (
        <div className="sticky top-0 z-10 mb-3 flex items-center justify-center gap-3 bg-surface py-2">
          <Button
            disabled={failed || loading || pageNumber <= 1}
            onClick={() => setPageNumber((page) => page - 1)}
          >
            {t("filePreview.previousPage")}
          </Button>
          <span className="text-sm" aria-live="polite">
            {t("filePreview.page", { current: pageNumber, total: document.numPages })}
          </span>
          <Button
            disabled={failed || loading || pageNumber >= document.numPages}
            onClick={() => setPageNumber((page) => page + 1)}
          >
            {t("filePreview.nextPage")}
          </Button>
        </div>
      )}
      {failed ? (
        <div className="space-y-3 py-12 text-center" role="alert">
          <p>{t("filePreview.failed")}</p>
          <Button onClick={() => setAttempt((value) => value + 1)}>
            {t("filePreview.retry")}
          </Button>
        </div>
      ) : (
        <div className="relative min-h-[240px]" aria-busy={loading}>
          {loading && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-surface">
              <Spin />
            </div>
          )}
          <canvas
            ref={canvas}
            className="mx-auto h-auto max-w-full"
            role="img"
            aria-label={`${name} — ${t("filePreview.page", {
              current: pageNumber,
              total: document?.numPages || 1,
            })}`}
          />
        </div>
      )}
    </div>
  );
}

import {
  FlipHorizontal,
  FlipVertical,
  ImageOff,
  Maximize,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { Button, Spinner } from "@/components/ui";

import styles from "./image-viewer.module.scss";

interface ImageViewerProps {
  src: string;
  alt: string;
  fallbackSrc?: string;
  dimensions?: { width: number; height: number };
  children?: ReactNode;
  onError?: () => void;
}

const initialOrientation = { rotation: 0, horizontal: 1, vertical: 1 };

export function ImageViewer({
  src,
  alt,
  fallbackSrc,
  dimensions,
  children,
  onError,
}: ImageViewerProps) {
  const { t } = useTranslation();
  const [loadedSource, setLoadedSource] = useState("");
  const [failedSource, setFailedSource] = useState("");
  const [scale, setScale] = useState(1);
  const [orientation, setOrientation] = useState(initialOrientation);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const knownSize = dimensions && dimensions.width > 0 && dimensions.height > 0;
  const [imageSize, setImageSize] = useState(
    knownSize ? dimensions : { width: 1, height: 1 },
  );
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = () =>
      setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  const failed = failedSource === src;
  const loading = loadedSource !== src && !failed;
  const placeholder = loadedSource || fallbackSrc;
  const showPlaceholder = (loading || failed) && placeholder && placeholder !== src;
  const rotated = Math.abs(orientation.rotation) % 180 !== 0;
  // Panning bounds follow the fitted image, including its rotated dimensions.
  const fit = Math.min(
    1,
    Math.max(1, viewportSize.width - 32) /
      (rotated ? imageSize.height : imageSize.width),
    Math.max(1, viewportSize.height - 32) /
      (rotated ? imageSize.width : imageSize.height),
  );
  const width = imageSize.width * fit;
  const height = imageSize.height * fit;
  const imageStyle = {
    width,
    height,
    transform: `translate(-50%, -50%) rotate(${orientation.rotation}deg) scale(${orientation.horizontal}, ${orientation.vertical})`,
  };

  return (
    <div className={styles.viewer} data-testid="image-viewer">
      <TransformWrapper
        minScale={1}
        maxScale={8}
        centerOnInit
        centerZoomedOut
        wheel={{ step: 0.001 }}
        doubleClick={{ mode: "toggle", step: Math.log(2) }}
        keyboard={{ disabled: false }}
        panning={{ velocityDisabled: true }}
        onTransform={(_, state) => setScale(state.scale)}
      >
        {({ zoomIn, zoomOut, resetTransform }) => {
          const tools = [
            {
              key: "zoomOut",
              Icon: ZoomOut,
              disabled: scale <= 1,
              run: () => zoomOut(0.35),
            },
            {
              key: "zoomIn",
              Icon: ZoomIn,
              disabled: scale >= 8,
              run: () => zoomIn(0.35),
            },
            {
              key: "fit",
              Icon: Maximize,
              run: () => {
                setOrientation(initialOrientation);
                return resetTransform();
              },
            },
            {
              key: "rotateLeft",
              Icon: RotateCcw,
              run: () =>
                setOrientation((value) => ({
                  ...value,
                  rotation: value.rotation - 90,
                })),
            },
            {
              key: "rotateRight",
              Icon: RotateCw,
              run: () =>
                setOrientation((value) => ({
                  ...value,
                  rotation: value.rotation + 90,
                })),
            },
            {
              key: "flipHorizontal",
              Icon: FlipHorizontal,
              run: () =>
                setOrientation((value) => ({
                  ...value,
                  horizontal: -value.horizontal,
                })),
            },
            {
              key: "flipVertical",
              Icon: FlipVertical,
              run: () =>
                setOrientation((value) => ({ ...value, vertical: -value.vertical })),
            },
          ];
          return (
            <>
              <div
                ref={viewportRef}
                className={`${styles.viewport} ${scale > 1 ? styles.pannable : ""}`}
              >
                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{
                    position: "relative",
                    width: rotated ? height : width,
                    height: rotated ? width : height,
                  }}
                  wrapperProps={{
                    role: "region",
                    "aria-label": t("imagePreview.viewport"),
                    onPointerDown: (event) =>
                      event.currentTarget.focus({ preventScroll: true }),
                  }}
                  contentClass="image-viewer-transform"
                >
                  {showPlaceholder && (
                    <img
                      className={styles.image}
                      src={placeholder}
                      alt=""
                      draggable={false}
                      style={imageStyle}
                      onLoad={(event) => {
                        if (!knownSize)
                          setImageSize({
                            width: event.currentTarget.naturalWidth,
                            height: event.currentTarget.naturalHeight,
                          });
                      }}
                    />
                  )}
                  <img
                    className={styles.image}
                    src={src}
                    alt={alt}
                    draggable={false}
                    style={{
                      ...imageStyle,
                      visibility: loading || failed ? "hidden" : "visible",
                    }}
                    onLoad={(event) => {
                      if (!knownSize || src !== fallbackSrc)
                        setImageSize({
                          width: event.currentTarget.naturalWidth,
                          height: event.currentTarget.naturalHeight,
                        });
                      setLoadedSource(src);
                      setFailedSource("");
                    }}
                    onError={() => {
                      setFailedSource(src);
                      onError?.();
                    }}
                  />
                </TransformComponent>
                {loading && !showPlaceholder && (
                  <div className={styles.status}>
                    <Spinner label={t("filePreview.loading")} />
                  </div>
                )}
                {failed && (
                  <div className={styles.status}>
                    <p
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                      role="alert"
                    >
                      <ImageOff size={20} />
                      {t("imagePreview.failed")}
                    </p>
                  </div>
                )}
                {children && <div className={styles.progress}>{children}</div>}
              </div>
              <div
                className={styles.toolbar}
                role="toolbar"
                aria-label={t("imagePreview.controls")}
              >
                {tools.map(({ key, Icon, disabled, run }) => (
                  <Button
                    key={key}
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    aria-label={t(`imagePreview.${key}`)}
                    title={t(`imagePreview.${key}`)}
                    onClick={() => void run()}
                  >
                    <Icon />
                  </Button>
                ))}
              </div>
            </>
          );
        }}
      </TransformWrapper>
    </div>
  );
}

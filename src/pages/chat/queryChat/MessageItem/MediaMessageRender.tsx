import { MessageStatus } from "@abd-im/wasm-client-sdk";
import { ImageOff, X } from "lucide-react";
import { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ImageViewer } from "@/components/ImageViewer";
import { MediaProgress } from "@/components/MediaProgress";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  Spinner,
} from "@/components/ui";
import { useCachedMedia } from "@/hooks/useCachedMedia";

import { IMessageItemProps } from ".";
import { getMediaPreviewSize } from "./mediaPreview";

const MediaMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const pictureElem = message.pictureElem;
  const thumbnail = useCachedMedia(message, "snapshot", true, true);
  const original = useCachedMedia(message, "source", previewOpen, true);
  const sourceUrl = thumbnail.managed
    ? thumbnail.file?.location || ""
    : pictureElem?.snapshotPicture?.url || pictureElem?.sourcePicture.url || "";

  useEffect(() => {
    setImageFailed(false);
    setImageLoading(true);
  }, [sourceUrl]);

  if (!pictureElem) return null;

  const previewSize = getMediaPreviewSize(
    pictureElem.sourcePicture.width,
    pictureElem.sourcePicture.height,
    160,
    120,
  );

  const isSending = message.status === MessageStatus.Sending;
  const unavailable = imageFailed || (!thumbnail.managed && !sourceUrl);
  const previewUrl = original.managed
    ? original.file?.location || sourceUrl
    : pictureElem.sourcePicture.url || sourceUrl;

  return (
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <div className="relative inline-grid max-w-full align-top">
        <DialogTrigger asChild>
          <button
            type="button"
            className="message-image grid place-items-center overflow-hidden rounded-md border border-surface-border bg-app-shell text-faint-foreground shadow-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            style={{
              width: `${unavailable ? 132 : previewSize.width}px`,
              maxWidth: "100%",
              aspectRatio: unavailable
                ? "4 / 3"
                : `${previewSize.width} / ${previewSize.height}`,
            }}
            aria-label={t("placeholder.image")}
            disabled={!sourceUrl || imageFailed || isSending}
          >
            {sourceUrl && !imageFailed ? (
              <>
                <img
                  className="block h-full w-full object-cover"
                  src={sourceUrl}
                  alt=""
                  onLoad={() => setImageLoading(false)}
                  onError={() => setImageFailed(true)}
                />
                {imageLoading && <Spinner className="absolute" />}
              </>
            ) : (
              (thumbnail.file || !thumbnail.managed) && (
                <ImageOff size={25} strokeWidth={1.5} />
              )
            )}
          </button>
        </DialogTrigger>
        {thumbnail.managed && !thumbnail.file && (
          <div className="absolute inset-0 grid place-items-center">
            {thumbnail.loading ? <Spinner /> : <MediaProgress media={thumbnail} />}
          </div>
        )}
        {isSending && (
          <div className="bg-surface/70 absolute inset-0 grid place-items-center">
            <Spinner label={t("attachments.sending")} />
          </div>
        )}
      </div>
      <DialogContent className="image-preview-dialog">
        <header className="flex items-center justify-end">
          <DialogTitle className="sr-only">{t("placeholder.image")}</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label={t("close")}>
              <X />
            </Button>
          </DialogClose>
        </header>
        <ImageViewer
          src={previewUrl}
          fallbackSrc={sourceUrl}
          dimensions={{
            width: pictureElem.sourcePicture.width,
            height: pictureElem.sourcePicture.height,
          }}
          alt={t("placeholder.image")}
        >
          {original.managed && !original.file && <MediaProgress media={original} />}
        </ImageViewer>
      </DialogContent>
    </Dialog>
  );
};

export default MediaMessageRender;

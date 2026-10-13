import { MessageStatus } from "@abd-im/wasm-client-sdk";
import { Play, Video, X } from "lucide-react";
import { FC, SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";

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
import { VideoPlayer } from "@/components/VideoPlayer";
import { useCachedMedia } from "@/hooks/useCachedMedia";
import { feedbackToast, secondsToMS } from "@/utils/common";

import { IMessageItemProps } from ".";
import { getMediaPreviewSize } from "./mediaPreview";

const VideoMessageRender: FC<
  IMessageItemProps & {
    fit?: "tile" | "contain";
    fluid?: boolean;
    description?: string;
  }
> = ({ message, fit, fluid, description }) => {
  const { t } = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [detectedDuration, setDetectedDuration] = useState(0);
  const videoElem = message.videoElem;
  const snapshot = useCachedMedia(message, "snapshot", true, true);
  const video = useCachedMedia(message, "video", previewOpen, true);
  if (!videoElem) return null;

  const videoUrl = videoElem.videoUrl || videoElem.videoPath;
  const playbackUrl = video.managed ? video.file?.location : videoUrl;
  const snapshotUrl = snapshot.managed
    ? snapshot.file?.location
    : videoElem.snapshotUrl || videoElem.snapshotPath;
  const previewSize = getMediaPreviewSize(
    videoElem.snapshotWidth,
    videoElem.snapshotHeight,
    320,
    180,
  );

  const seekToPreviewFrame = (event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setDetectedDuration(video.duration);
      video.currentTime = Math.min(1, video.duration * 0.1);
    }
  };

  return (
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <div
        className={`relative inline-grid max-w-full align-top ${
          fit === "tile" ? "h-full w-full" : ""
        } ${fluid ? "w-full" : ""}`}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            className="group relative block w-full overflow-hidden rounded-md border border-surface-border bg-app-shell text-left shadow-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            style={{
              width:
                fit === "tile" || fluid
                  ? "100%"
                  : `${previewSize.width}px`,
              height: fit === "tile" ? "100%" : undefined,
              maxWidth: "100%",
              minWidth: fit === "tile" ? undefined : "min(100%, 280px)",
              aspectRatio:
                fit === "tile"
                  ? undefined
                  : `${previewSize.width} / ${previewSize.height}`,
            }}
            aria-label={description || t("placeholder.video")}
            disabled={!videoUrl}
          >
          {!snapshot.managed && videoUrl ? (
            <video
              className="h-full w-full object-cover"
              src={videoUrl}
              poster={snapshotUrl || undefined}
              preload="metadata"
              muted
              playsInline
              onLoadedMetadata={seekToPreviewFrame}
            />
          ) : snapshotUrl ? (
            <img src={snapshotUrl} className="h-full w-full object-cover" alt="" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-faint-foreground">
              <Video size={34} strokeWidth={1.5} />
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white shadow-surface">
              <Play className="ml-0.5" size={23} fill="currentColor" />
            </span>
          </span>
          <span className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
            {videoElem.duration > 0
              ? secondsToMS(videoElem.duration)
              : detectedDuration > 0
              ? secondsToMS(detectedDuration)
              : t("placeholder.video")}
          </span>
          {message.status === MessageStatus.Sending && (
            <span className="bg-surface/70 absolute inset-0 grid place-items-center">
              <Spinner label={t("attachments.sending")} />
            </span>
          )}
        </button>
      </DialogTrigger>
    </div>
    <DialogContent className="video-preview-dialog">
        <header className="flex items-center justify-end">
          <DialogTitle className="sr-only">{t("placeholder.video")}</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label={t("close")}>
              <X />
            </Button>
          </DialogClose>
        </header>
        <div className="min-h-0 flex-1">
          {playbackUrl ? (
            <VideoPlayer src={playbackUrl} />
          ) : (
            <div className="grid h-full place-items-center">
              {video.error ? t("mediaCache.failed") : <Spinner />}
            </div>
          )}
        </div>
        {video.managed ? (
          <div className="flex min-h-10 shrink-0 items-center justify-end gap-2">
            <MediaProgress media={video} />
            {video.file && video.snapshot?.state === "completed" && (
              <Button
                onClick={() => {
                  void window
                    .electronAPI!.media.save(
                      video.file!.ref,
                      `video.${videoElem.videoType.split("/").pop()}`,
                    )
                    .catch((error) => feedbackToast({ error }));
                }}
              >
                {t("mediaCache.saveAs")}
              </Button>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default VideoMessageRender;

import { MessageStatus } from "@abd-im/wasm-client-sdk";
import { Modal, Spin } from "antd";
import { Play, Video } from "lucide-react";
import { FC, SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { secondsToMS } from "@/utils/common";

import { IMessageItemProps } from ".";
import { getMediaPreviewSize } from "./mediaPreview";

const VideoMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const { t } = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);
  const videoElem = message.videoElem;
  if (!videoElem) return null;

  const videoUrl = videoElem.videoUrl || videoElem.videoPath;
  const snapshotUrl = videoElem.snapshotUrl || videoElem.snapshotPath;
  const previewSize = getMediaPreviewSize(
    videoElem.snapshotWidth,
    videoElem.snapshotHeight,
  );

  const seekToPreviewFrame = (event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.min(1, video.duration * 0.1);
    }
  };

  return (
    <>
      <Spin
        wrapperClassName="inline-block max-w-full align-top"
        spinning={message.status === MessageStatus.Sending}
      >
        <button
          type="button"
          className="group relative block overflow-hidden rounded-md border border-surface-border bg-app-shell text-left shadow-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          style={{
            width: `${previewSize.width}px`,
            maxWidth: "100%",
            aspectRatio: `${previewSize.width} / ${previewSize.height}`,
          }}
          aria-label={t("placeholder.video")}
          disabled={!videoUrl}
          onClick={() => setPreviewOpen(true)}
        >
          {videoUrl ? (
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
            {secondsToMS(videoElem.duration)}
          </span>
        </button>
      </Spin>
      <Modal
        title={null}
        footer={null}
        open={previewOpen}
        centered
        width="min(900px, calc(100vw - 32px))"
        destroyOnClose
        onCancel={() => setPreviewOpen(false)}
        className="video-preview-modal"
      >
        {videoUrl && (
          <video
            className="max-h-[calc(100vh-96px)] w-full bg-black object-contain"
            src={videoUrl}
            controls
            autoPlay
          />
        )}
      </Modal>
    </>
  );
};

export default VideoMessageRender;

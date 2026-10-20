import { type MediaV2, type MessageItem, MessageStatus } from "@abd-im/wasm-client-sdk";
import { useContext } from "react";

import { AudioPlayer } from "@/components/AudioPlayer";
import { MediaProgress } from "@/components/MediaProgress";
import {
  MediaAttachmentIDContext,
  MediaCacheEnabledContext,
  useCachedMedia,
} from "@/hooks/useCachedMedia";

import { resolveV2Media } from "../messageV2";
import FileMessageRender from "./FileMessageRender";
import MediaMessageRender from "./MediaMessageRender";
import V2UploadCard from "./V2UploadCard";
import VideoMessageRender from "./VideoMessageRender";

export default function V2Attachment({
  message,
  media,
  kind,
  description,
  fit,
  fluid,
}: {
  message: MessageItem;
  media: MediaV2;
  kind: "file" | "media";
  description?: string | null;
  fit?: "tile" | "contain";
  fluid?: boolean;
}) {
  const cacheEnabled = useContext(MediaCacheEnabledContext);
  const resolved = resolveV2Media(media, message.message?.attachments);
  if (!resolved.url) return null;
  const { attachment, url, contentType, width, height } = resolved;
  const name =
    resolved.filename ||
    description ||
    url.split("/").pop()?.split("?")[0] ||
    "attachment";
  const size = attachment?.size || 0;
  if (message.status === MessageStatus.Sending) {
    return <V2UploadCard message={message} attachments={[{ filename: name, size }]} />;
  }
  const uuid = attachment?.id || url;
  const imageSource = `${resolved.filename || ""} ${url}`;
  const isVideo =
    contentType.startsWith("video/") ||
    /\.(avi|m4v|mkv|mov|mp4|mpeg|mpg|webm)(?:[?#]|$)/i.test(imageSource);
  const isImage =
    !isVideo &&
    (contentType.startsWith("image/") ||
      (width > 0 && height > 0) ||
      /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(imageSource));
  let content;
  if (contentType.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac)(\?|$)/i.test(url)) {
    content = <CachedAudio message={message} url={url} name={name} />;
  } else if (isImage) {
    const picture = { uuid, url, type: contentType, size, width, height };
    content = (
      <MediaMessageRender
        fit={fit || (kind === "media" ? "tile" : "contain")}
        fluid={fluid}
        description={description || name}
        message={{
          ...message,
          pictureElem: {
            sourcePath: "",
            sourcePicture: picture,
            bigPicture: picture,
            snapshotPicture: picture,
          },
        }}
      />
    );
  } else if (isVideo) {
    const poster = message.message?.attachments?.find(
      (file) => file.id === `${attachment?.id}:poster`,
    );
    content = (
      <VideoMessageRender
        fit={fit || (kind === "media" ? "tile" : "contain")}
        fluid={fluid}
        description={description || name}
        message={{
          ...message,
          videoElem: {
            videoUUID: uuid,
            videoUrl: url,
            videoType: contentType,
            videoSize: size,
            videoPath: "",
            duration: attachment?.duration_secs || 0,
            snapshotUUID: poster?.id || "",
            snapshotUrl: poster?.url || "",
            snapshotPath: "",
            snapshotSize: poster?.size || 0,
            snapshotWidth: poster?.width || width,
            snapshotHeight: poster?.height || height,
          },
        }}
      />
    );
  } else if (kind === "file") {
    content = (
      <FileMessageRender
        fluid={fluid}
        message={{
          ...message,
          fileElem: {
            uuid,
            sourceUrl: url,
            fileName: name,
            fileSize: size,
            filePath: "",
          },
        }}
      />
    );
  } else {
    const picture = { uuid, url, type: contentType, size, width, height };
    content = (
      <MediaMessageRender
        fit={fit || "contain"}
        fluid={fluid}
        description={description || name}
        message={{
          ...message,
          pictureElem: {
            sourcePath: "",
            sourcePicture: picture,
            bigPicture: picture,
            snapshotPicture: picture,
          },
        }}
      />
    );
  }
  return (
    <MediaCacheEnabledContext.Provider
      value={
        cacheEnabled &&
        Boolean(attachment?.id) &&
        (!isImage || Boolean(attachment?.content_type?.startsWith("image/"))) &&
        (!isVideo || Boolean(attachment?.content_type?.startsWith("video/")))
      }
    >
      <MediaAttachmentIDContext.Provider value={attachment?.id}>
        {content}
      </MediaAttachmentIDContext.Provider>
    </MediaCacheEnabledContext.Provider>
  );
}

function CachedAudio({
  message,
  url,
  name,
}: {
  message: MessageItem;
  url: string;
  name: string;
}) {
  const media = useCachedMedia(message, "source", true, true);
  const source = media.managed ? media.file?.location : url;
  return source ? (
    <AudioPlayer src={source} name={name} />
  ) : (
    <MediaProgress media={media} />
  );
}

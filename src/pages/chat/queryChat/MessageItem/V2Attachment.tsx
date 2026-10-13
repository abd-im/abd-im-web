import { type MediaV2, type MessageItem, MessageStatus } from "@abd-im/wasm-client-sdk";

import { AudioPlayer } from "@/components/AudioPlayer";
import { MediaCacheEnabledContext } from "@/hooks/useCachedMedia";

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
    content = <AudioPlayer src={url} name={name} />;
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
            snapshotUUID: "",
            snapshotUrl: "",
            snapshotPath: "",
            snapshotSize: 0,
            snapshotWidth: width,
            snapshotHeight: height,
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
  // Embedded attachments share a message ID. The current SDK media cache cannot
  // address them individually; use their URLs, as for existing composite parts.
  return (
    <MediaCacheEnabledContext.Provider value={false}>
      {content}
    </MediaCacheEnabledContext.Provider>
  );
}

import { MessageStatus } from "@abd-im/wasm-client-sdk";
import { Image, Spin } from "antd";
import { ImageOff } from "lucide-react";
import { FC, useEffect, useState } from "react";

import { IMessageItemProps } from ".";
import { getMediaPreviewSize } from "./mediaPreview";

const MediaMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const pictureElem = message.pictureElem;
  const sourceUrl =
    pictureElem?.snapshotPicture?.url || pictureElem?.sourcePicture.url || "";

  useEffect(() => {
    setImageFailed(false);
  }, [sourceUrl]);

  if (!pictureElem) return null;

  const previewSize = getMediaPreviewSize(
    pictureElem.sourcePicture.width,
    pictureElem.sourcePicture.height,
    160,
    120,
  );

  const isSending = message.status === MessageStatus.Sending;
  const sizeStyle = {
    width: `${imageFailed || !sourceUrl ? 132 : previewSize.width}px`,
    maxWidth: "100%",
    aspectRatio:
      imageFailed || !sourceUrl
        ? "4 / 3"
        : `${previewSize.width} / ${previewSize.height}`,
  };

  return (
    <Spin wrapperClassName="inline-block max-w-full align-top" spinning={isSending}>
      <div
        className="relative grid place-items-center overflow-hidden rounded-md border border-surface-border bg-app-shell text-faint-foreground shadow-surface"
        style={sizeStyle}
      >
        {sourceUrl && !imageFailed ? (
          <Image
            rootClassName="message-image !block h-full w-full cursor-pointer"
            className="block !h-full !w-full object-cover"
            src={sourceUrl}
            onError={() => setImageFailed(true)}
            preview={{ src: pictureElem.sourcePicture.url || sourceUrl }}
            placeholder={
              <div className="flex h-full w-full items-center justify-center">
                <Spin />
              </div>
            }
          />
        ) : (
          <ImageOff size={25} strokeWidth={1.5} />
        )}
      </div>
    </Spin>
  );
};

export default MediaMessageRender;

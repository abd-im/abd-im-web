import { MessageItem, MessageType } from "@abd-im/wasm-client-sdk";
import { FC } from "react";

import type { IMessageItemProps } from ".";
import FileMessageRender from "./FileMessageRender";
import MediaMessageRender from "./MediaMessageRender";
import styles from "./message-item.module.scss";
import QuoteMessageRender from "./QuoteMessageRender";
import TextMessageRender from "./TextMessageRender";
import VideoMessageRender from "./VideoMessageRender";

const renderers: Partial<Record<MessageType, FC<IMessageItemProps>>> = {
  [MessageType.TextMessage]: TextMessageRender,
  [MessageType.QuoteMessage]: QuoteMessageRender,
  [MessageType.PictureMessage]: MediaMessageRender,
  [MessageType.VideoMessage]: VideoMessageRender,
  [MessageType.FileMessage]: FileMessageRender,
};

export default function CompositeMessageRender({ parts }: { parts: MessageItem[] }) {
  return (
    <div
      className={`${styles.bubble} ${styles["composite-message"]}`}
      data-testid="composite-message"
    >
      {parts.map((message, index) => {
        const Renderer = renderers[message.contentType];
        return Renderer ? (
          <Renderer key={`${message.clientMsgID}:${index}`} message={message} />
        ) : null;
      })}
    </div>
  );
}

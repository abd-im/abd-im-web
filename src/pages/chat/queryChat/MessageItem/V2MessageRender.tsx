import {
  type ComponentV2,
  MessageStatus,
  type MessageV2,
} from "@abd-im/wasm-client-sdk";
import clsx from "clsx";
import { EyeOff } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { IMessageItemProps } from ".";
import messageStyles from "./message-item.module.scss";
import styles from "./v2-message.module.scss";
import V2Attachment from "./V2Attachment";
import { V2Button, V2Select } from "./V2InteractiveComponents";
import V2UploadCard, { getUploadingAttachments } from "./V2UploadCard";

const mentionTargetPrefix = "#mention/";

type V2Mention = NonNullable<MessageV2["mentions"]>[number];

const escapeMarkdownLabel = (value: string) =>
  value.replace(/[\\`*_[\]()<>#]/g, "\\$&");

const mentionTokenEntries = (mentions: V2Mention[]) => {
  const entries = new Map<string, V2Mention>();
  mentions.forEach((mention) => {
    if (!mention.id) return;
    entries.set(`<@${mention.id}>`, mention);
    entries.set(`<@!${mention.id}>`, mention);
    entries.set(`@${mention.id}`, mention);
    if (mention.username) entries.set(`@${mention.username}`, mention);
    if (mention.global_name) entries.set(`@${mention.global_name}`, mention);
  });
  return [...entries.entries()].sort(([left], [right]) => right.length - left.length);
};

const toMentionMarkdown = (content: string, mentions: V2Mention[] | undefined) => {
  const entries = mentionTokenEntries(mentions || []);
  if (!entries.length) return content;

  const tokens = entries.map(([token]) => token);
  const byToken = new Map(entries);
  const matcher = new RegExp(
    `(${tokens.map((token) => escapeRegExp(token)).join("|")})`,
    "g",
  );
  return content.replace(matcher, (token) => {
    const mention = byToken.get(token);
    if (!mention) return token;
    const fallback = mention.global_name || mention.username || mention.id;
    return `[${escapeMarkdownLabel(
      `@${fallback}`,
    )}](${mentionTargetPrefix}${encodeURIComponent(mention.id)})`;
  });
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function V2MessageRender({
  message,
  isSender,
  reactionContent,
}: IMessageItemProps) {
  const body = message.message;
  if (!body) return null;

  const wrapMessage = (content: ReactNode, onlyText = false) => (
    <div
      className={clsx(
        styles.message,
        isSender ? styles.messageSender : styles.messageReceiver,
        onlyText && styles.textOnly,
      )}
      data-v2-message
    >
      <div
        className={clsx(
          messageStyles.bubble,
          styles.messageBubble,
          isSender ? styles.bubbleSender : styles.bubbleReceiver,
        )}
      >
        {content}
        {reactionContent && (
          <div
            className={clsx(
              styles.reactionContent,
              isSender && styles.reactionContentSender,
            )}
          >
            {reactionContent}
          </div>
        )}
      </div>
    </div>
  );

  const render = (component: ComponentV2, index: number): ReactNode => {
    let content: ReactNode;
    switch (component.type) {
      case 10:
        content = (
          <div className={styles.text} data-quote-source>
            <ReactMarkdown
              skipHtml
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children, ...props }) => {
                  const mentionID = href?.startsWith(mentionTargetPrefix)
                    ? decodeURIComponent(href.slice(mentionTargetPrefix.length))
                    : undefined;
                  if (mentionID) {
                    return (
                      <button
                        type="button"
                        className={messageStyles["message-mention"]}
                        data-v2-mention-user-id={mentionID}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          window.userClick(mentionID, message.groupID);
                        }}
                      >
                        {children}
                      </button>
                    );
                  }
                  return (
                    <a {...props} href={href}>
                      {children}
                    </a>
                  );
                },
              }}
            >
              {toMentionMarkdown(component.content || "", body.mentions)}
            </ReactMarkdown>
          </div>
        );
        break;
      case 9:
        content = (
          <div className={styles.section}>
            <div className={styles.sectionBody}>
              {component.components?.map(render)}
            </div>
            {component.accessory && (
              <div className={styles.accessory}>{render(component.accessory, 0)}</div>
            )}
          </div>
        );
        break;
      case 11:
        content = component.media && (
          <div className={styles.thumbnail}>
            <V2Attachment
              message={message}
              media={component.media}
              kind="media"
              description={component.description}
            />
          </div>
        );
        break;
      case 12:
        content = (
          <div className={styles.gallery} data-count={component.items?.length}>
            {component.items?.map((item, i) => {
              const attachment = (
                <V2Attachment
                  message={message}
                  media={item.media}
                  kind="media"
                  fit="contain"
                  fluid
                  description={item.description}
                />
              );
              return (
                <div key={i}>
                  {item.spoiler ? <Spoiler>{attachment}</Spoiler> : attachment}
                </div>
              );
            })}
          </div>
        );
        break;
      case 13:
        content = component.file && (
          <V2Attachment
            message={message}
            media={component.file}
            kind="file"
            fluid
            description={component.name || component.description}
          />
        );
        break;
      case 14:
        content =
          component.divider === false ? (
            <div style={{ height: component.spacing === 2 ? 16 : 8 }} />
          ) : (
            <hr
              className={`${styles.separator} ${
                component.spacing === 2 ? styles.largeSeparator : ""
              }`}
            />
          );
        break;
      case 17:
        content = (
          <div
            className={styles.card}
            style={
              component.accent_color === null || component.accent_color === undefined
                ? undefined
                : {
                    borderLeftColor: `#${component.accent_color
                      .toString(16)
                      .padStart(6, "0")}`,
                    borderLeftWidth: 4,
                  }
            }
          >
            {component.components?.map(render)}
          </div>
        );
        break;
      case 1:
        content = (
          <div className={styles.actions}>
            {component.components?.map((child, i) => (
              <div
                key={child.id ?? i}
                className={
                  [3, 5, 6, 7, 8].includes(child.type) ? styles.selectRow : undefined
                }
              >
                {render(child, i)}
              </div>
            ))}
          </div>
        );
        break;
      case 2:
        content = <V2Button component={component} messageID={message.clientMsgID} />;
        break;
      case 3:
      case 5:
      case 6:
      case 7:
      case 8:
        content = <V2Select component={component} messageID={message.clientMsgID} />;
        break;
      default:
        return null;
    }
    return component.spoiler ? (
      <Spoiler key={component.id ?? index}>{content}</Spoiler>
    ) : (
      <div key={component.id ?? index} className={styles.component}>
        {content}
      </div>
    );
  };

  const isSending = message.status === MessageStatus.Sending;
  const uploadingFiles = isSending ? getUploadingAttachments(message) : [];
  if (uploadingFiles.length > 0) {
    const nonAttachmentComponents = body.components.filter(
      (c) => c.type !== 11 && c.type !== 12 && c.type !== 13,
    );
    return wrapMessage(
      <>
        {nonAttachmentComponents.map(render)}
        <V2UploadCard message={message} attachments={uploadingFiles} />
      </>,
      false,
    );
  }

  const onlyText = body.components.every((component) => component.type === 10);
  return wrapMessage(<>{body.components.map(render)}</>, onlyText);
}

function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  const { t } = useTranslation();
  if (revealed) return <>{children}</>;
  return (
    <div className={styles.spoiler}>
      <div className={styles.spoilerContent} aria-hidden="true" {...{ inert: "" }}>
        {children}
      </div>
      <button
        type="button"
        className={styles.spoilerReveal}
        onClick={() => setRevealed(true)}
      >
        <span>
          <EyeOff size={14} />
          {t("messageComponents.spoiler")}
        </span>
      </button>
    </div>
  );
}

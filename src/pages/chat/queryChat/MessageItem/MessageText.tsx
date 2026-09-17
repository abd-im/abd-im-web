import { Fragment } from "react";

import styles from "./message-item.module.scss";

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>，。！？；：]+/gi;
const SIMPLE_TRAILING_PUNCTUATION = /[.,!?;:。，！？；：]+$/;
const PAIRED_PUNCTUATION: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
};

const trimTrailingPunctuation = (value: string) => {
  let url = value.replace(SIMPLE_TRAILING_PUNCTUATION, "");
  let suffix = value.slice(url.length);

  while (url) {
    const closing = url.slice(-1);
    const opening = PAIRED_PUNCTUATION[closing];
    if (!opening) break;
    const openingCount = url.split(opening).length - 1;
    const closingCount = url.split(closing).length - 1;
    if (closingCount <= openingCount) break;
    suffix = closing + suffix;
    url = url.slice(0, -1);
  }

  return { url, suffix };
};

interface MessageTextProps {
  text: string;
}

const MessageText = ({ text }: MessageTextProps) => {
  const parts = [];
  let previousEnd = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const matchedText = match[0];
    const { url, suffix } = trimTrailingPunctuation(matchedText);
    if (start > previousEnd) parts.push(text.slice(previousEnd, start));
    if (url) {
      parts.push(
        <a
          key={`${start}-${url}`}
          className={styles["message-link"]}
          href={url.startsWith("www.") ? `https://${url}` : url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {url}
        </a>,
      );
    }
    if (suffix) parts.push(suffix);
    previousEnd = start + matchedText.length;
  }

  if (previousEnd < text.length) parts.push(text.slice(previousEnd));
  return (
    <span className={styles["message-text"]}>
      {parts.map((part, index) =>
        typeof part === "string" ? <Fragment key={index}>{part}</Fragment> : part,
      )}
    </span>
  );
};

export default MessageText;

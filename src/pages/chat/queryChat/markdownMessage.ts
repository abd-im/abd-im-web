import type { MessageItem } from "@abd-im/wasm-client-sdk";

export const MARKDOWN_TEXT_MESSAGE_TYPE = 118;

type MarkdownMessageItem = MessageItem & {
  markdownTextElem?: {
    content: string;
  };
};

export const getMarkdownMessageContent = (message: MessageItem) =>
  (message as MarkdownMessageItem).markdownTextElem?.content ?? "";

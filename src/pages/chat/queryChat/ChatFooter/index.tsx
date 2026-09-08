import { MessageItem, SessionType } from "@abd-im/wasm-client-sdk";
import { CloseOutlined, RollbackOutlined, UploadOutlined } from "@ant-design/icons";
import { useLatest } from "ahooks";
import { Button } from "antd";
import { t } from "i18next";
import {
  ClipboardEvent,
  DragEvent,
  forwardRef,
  ForwardRefRenderFunction,
  memo,
  useEffect,
  useRef,
  useState,
} from "react";

import CKEditor, { CKEditorRef } from "@/components/CKEditor";
import { getCleanText } from "@/components/CKEditor/utils";
import { useUserDisplayName } from "@/hooks/useUserDisplayName";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore } from "@/store";
import { feedbackToast } from "@/utils/common";

import { getMessagePreview } from "../messagePreview";
import { createQuoteSnapshot } from "../partialQuote";
import { AttachmentType } from "./attachmentType";
import SendActionBar from "./SendActionBar";
import { useFileMessage } from "./SendActionBar/useFileMessage";
import { useSendMessage } from "./useSendMessage";

const ChatFooter: ForwardRefRenderFunction<unknown, unknown> = (_, ref) => {
  const [html, setHtml] = useState("");
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const latestHtml = useLatest(html);
  const ckEditorRef = useRef<CKEditorRef>(null);
  const fileDragDepth = useRef(0);
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const quoteMessage = useConversationStore((state) => state.quoteMessage);
  const updateQuoteMessage = useConversationStore((state) => state.updateQuoteMessage);

  const { getAttachmentMessage } = useFileMessage();
  const { sendMessage } = useSendMessage();
  const quoteAuthorSnapshot =
    quoteMessage?.message.senderNickname || quoteMessage?.message.sendID || "";
  const quoteAuthor = useUserDisplayName(
    {
      userID: quoteMessage?.message.sendID,
      nickname: quoteAuthorSnapshot,
    },
    quoteAuthorSnapshot,
  );

  useEffect(() => {
    if (!quoteMessage) return;

    if (
      currentConversation?.conversationType === SessionType.Group &&
      quoteAuthor &&
      !getCleanText(latestHtml.current ?? "")
    ) {
      const mention = `@${quoteAuthor}`;
      const escapedMention = mention.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      setHtml(`<p>${escapedMention}&nbsp;</p>`);
    }

    const focusTimer = window.setTimeout(() => ckEditorRef.current?.focus(true));
    return () => window.clearTimeout(focusTimer);
  }, [currentConversation?.conversationType, latestHtml, quoteAuthor, quoteMessage]);

  const onChange = (value: string) => {
    setHtml(value);
  };

  const onSelectEmoji = (emoji: string) => {
    ckEditorRef.current?.insertEmoji(emoji);
  };

  const sendFiles = async (files: readonly File[], requestedType?: AttachmentType) => {
    for (const file of files) {
      try {
        const message = await getAttachmentMessage(file, requestedType);
        await sendMessage({ message });
      } catch (error) {
        feedbackToast({ error });
      }
    }
  };

  const hasDraggedFiles = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;

    event.preventDefault();
    event.stopPropagation();
    void sendFiles(files);
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    fileDragDepth.current += 1;
    setIsDraggingFiles(true);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    fileDragDepth.current = Math.max(0, fileDragDepth.current - 1);
    if (!fileDragDepth.current) setIsDraggingFiles(false);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    fileDragDepth.current = 0;
    setIsDraggingFiles(false);

    const files = Array.from(event.dataTransfer.files);
    if (files.length) void sendFiles(files);
  };

  const enterToSend = async () => {
    const cleanText = getCleanText(latestHtml.current ?? "");
    if (!cleanText) return;

    try {
      const message = quoteMessage
        ? (
            await (
              IMSDK.createQuoteMessage as unknown as (params: {
                text: string;
                message: MessageItem;
                quoteText?: string;
                quoteOffset?: number;
              }) => ReturnType<typeof IMSDK.createQuoteMessage>
            )({
              text: cleanText,
              message: createQuoteSnapshot(quoteMessage),
              quoteText: quoteMessage.quoteText,
              quoteOffset: quoteMessage.quoteOffset,
            })
          ).data
        : (await IMSDK.createTextMessage(cleanText)).data;
      setHtml("");
      updateQuoteMessage();
      void sendMessage({ message });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <footer
      className="relative h-full bg-surface px-3 pb-3 pt-2 text-foreground"
      onPasteCapture={handlePaste}
      onDragEnterCapture={handleDragEnter}
      onDragOverCapture={handleDragOver}
      onDragLeaveCapture={handleDragLeave}
      onDropCapture={handleDrop}
    >
      {isDraggingFiles && (
        <div
          className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-brand bg-surface-raised"
          data-testid="file-drop-target"
          aria-hidden
        >
          <UploadOutlined className="text-3xl text-brand" />
        </div>
      )}
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-surface-border bg-surface-raised shadow-sm">
        {quoteMessage && (
          <div
            className="mx-3 flex min-h-14 items-center gap-3 border-b border-surface-border px-1 py-2"
            data-testid="composer-reply"
          >
            <RollbackOutlined className="shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-xs font-semibold text-foreground">
                {t("placeholder.reply")} {quoteAuthor}
              </strong>
              <span className="block truncate text-xs text-muted-foreground">
                {quoteMessage.quoteText || getMessagePreview(quoteMessage.message)}
              </span>
            </div>
            <Button
              type="text"
              shape="circle"
              icon={<CloseOutlined />}
              title={`${t("cancel")} ${t("placeholder.reply")}`}
              aria-label={`${t("cancel")} ${t("placeholder.reply")}`}
              onClick={() => updateQuoteMessage()}
            />
          </div>
        )}
        <SendActionBar
          sendMessage={sendMessage}
          sendFiles={sendFiles}
          onSelectEmoji={onSelectEmoji}
        />
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <CKEditor
            ref={ckEditorRef}
            value={html}
            onEnter={() => void enterToSend()}
            onChange={onChange}
          />
          <div className="flex items-center justify-end py-2 pr-3">
            <Button
              className="w-fit px-6 py-1"
              type="primary"
              onClick={() => void enterToSend()}
            >
              {t("placeholder.send")}
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default memo(forwardRef(ChatFooter));

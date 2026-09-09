import { MessageItem, SessionType } from "@abd-im/wasm-client-sdk";
import { CloseOutlined, RollbackOutlined, UploadOutlined } from "@ant-design/icons";
import { useLatest } from "ahooks";
import { t } from "i18next";
import { ArrowUp } from "lucide-react";
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
import { Button } from "@/components/ui";
import { useDesktopDraft } from "@/hooks/useDesktopDraft";
import { useUserDisplayName } from "@/hooks/useUserDisplayName";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";
import { beginDesktopTask, canStartDesktopTask } from "@/utils/desktopTasks";

import { getMessagePreview } from "../messagePreview";
import { createQuoteSnapshot } from "../partialQuote";
import { AttachmentType } from "./attachmentType";
import SendActionBar from "./SendActionBar";
import { useFileMessage } from "./SendActionBar/useFileMessage";
import { useSendMessage } from "./useSendMessage";

const ChatFooter: ForwardRefRenderFunction<unknown, unknown> = (_, ref) => {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const ckEditorRef = useRef<CKEditorRef>(null);
  const fileDragDepth = useRef(0);
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const selfID = useUserStore((state) => state.selfInfo.userID);
  const [html, setHtml] = useDesktopDraft(
    `desktop-draft:${selfID}:chat:${currentConversation?.conversationID || ""}`,
  );
  const latestHtml = useLatest(html);
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
    if (!files.length || !canStartDesktopTask()) return;
    const finishTask = beginDesktopTask();
    try {
      for (const file of files) {
        try {
          const message = await getAttachmentMessage(file, requestedType);
          await sendMessage({ message });
        } catch (error) {
          feedbackToast({ error });
        }
      }
    } finally {
      finishTask();
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
    if (!cleanText || !canStartDesktopTask()) return;
    const finishTask = beginDesktopTask();
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
      await sendMessage({ message });
    } catch (e) {
      console.error(e);
    } finally {
      finishTask();
    }
  };

  return (
    <footer
      className="chat-composer"
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
      <div className="chat-composer-box">
        {quoteMessage && (
          <div className="chat-composer-reply" data-testid="composer-reply">
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
              variant="ghost"
              size="icon"
              title={`${t("cancel")} ${t("placeholder.reply")}`}
              aria-label={`${t("cancel")} ${t("placeholder.reply")}`}
              onClick={() => updateQuoteMessage()}
            >
              <CloseOutlined />
            </Button>
          </div>
        )}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <CKEditor
            ref={ckEditorRef}
            value={html}
            onEnter={() => void enterToSend()}
            onChange={onChange}
          />
          <div className="chat-composer-bottom">
            <SendActionBar
              sendMessage={sendMessage}
              sendFiles={sendFiles}
              onSelectEmoji={onSelectEmoji}
            />
            <Button
              variant="primary"
              size="small"
              disabled={!getCleanText(html || "")}
              onClick={() => void enterToSend()}
            >
              {t("placeholder.send")}
              <ArrowUp />
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default memo(forwardRef(ChatFooter));

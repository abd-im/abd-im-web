import { SessionType } from "@abd-im/wasm-client-sdk";
import { CloseOutlined, RollbackOutlined } from "@ant-design/icons";
import { useLatest } from "ahooks";
import { Button } from "antd";
import { t } from "i18next";
import {
  forwardRef,
  ForwardRefRenderFunction,
  memo,
  useEffect,
  useRef,
  useState,
} from "react";

import CKEditor, { CKEditorRef } from "@/components/CKEditor";
import { getCleanText } from "@/components/CKEditor/utils";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore } from "@/store";

import { getMessagePreview } from "../messagePreview";
import SendActionBar from "./SendActionBar";
import { useFileMessage } from "./SendActionBar/useFileMessage";
import { useSendMessage } from "./useSendMessage";

const ChatFooter: ForwardRefRenderFunction<unknown, unknown> = (_, ref) => {
  const [html, setHtml] = useState("");
  const latestHtml = useLatest(html);
  const ckEditorRef = useRef<CKEditorRef>(null);
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const quoteMessage = useConversationStore((state) => state.quoteMessage);
  const updateQuoteMessage = useConversationStore((state) => state.updateQuoteMessage);

  const { getImageMessage, getVideoMessage, getFileMessage } = useFileMessage();
  const { sendMessage } = useSendMessage();
  const quoteAuthor = quoteMessage?.senderNickname || quoteMessage?.sendID || "";

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

  const enterToSend = async () => {
    const cleanText = getCleanText(latestHtml.current ?? "");
    if (!cleanText) return;
    setHtml("");

    try {
      const message = quoteMessage
        ? (
            await IMSDK.createQuoteMessage({
              text: cleanText,
              message: JSON.stringify(quoteMessage),
            })
          ).data
        : (await IMSDK.createTextMessage(cleanText)).data;
      void sendMessage({ message });
      updateQuoteMessage();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <footer className="relative h-full bg-surface px-3 pb-3 pt-2 text-foreground">
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
                {getMessagePreview(quoteMessage)}
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
          getImageMessage={getImageMessage}
          getVideoMessage={getVideoMessage}
          getFileMessage={getFileMessage}
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

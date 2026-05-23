import { useLatest } from "ahooks";
import { Button } from "antd";
import { t } from "i18next";
import { forwardRef, ForwardRefRenderFunction, memo, useRef, useState } from "react";

import CKEditor, { CKEditorRef } from "@/components/CKEditor";
import { getCleanText } from "@/components/CKEditor/utils";
import i18n from "@/i18n";
import { IMSDK } from "@/layout/MainContentWrap";

import SendActionBar from "./SendActionBar";
import { useFileMessage } from "./SendActionBar/useFileMessage";
import { useSendMessage } from "./useSendMessage";

const ChatFooter: ForwardRefRenderFunction<unknown, unknown> = (_, ref) => {
  const [html, setHtml] = useState("");
  const latestHtml = useLatest(html);
  const ckEditorRef = useRef<CKEditorRef>(null);

  const { getImageMessage, getVideoMessage, getFileMessage } = useFileMessage();
  const { sendMessage } = useSendMessage();

  const onChange = (value: string) => {
    setHtml(value);
  };

  const onSelectEmoji = (emoji: string) => {
    ckEditorRef.current?.insertEmoji(emoji);
  };

  const enterToSend = async () => {
    const cleanText = getCleanText(latestHtml.current);
    if (!cleanText) return;
    setHtml("");

    try {
      const message = (await IMSDK.createTextMessage(cleanText)).data;
      sendMessage({ message });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <footer className="relative h-full bg-white py-px">
      <div className="flex h-full flex-col border-t border-t-[var(--gap-text)]">
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
            onEnter={enterToSend}
            onChange={onChange}
          />
          <div className="flex items-center justify-end py-2 pr-3">
            <Button className="w-fit px-6 py-1" type="primary" onClick={enterToSend}>
              {t("placeholder.send")}
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default memo(forwardRef(ChatFooter));

import { InfoCircleOutlined } from "@ant-design/icons";
import { SessionType } from "@abd-im/wasm-client-sdk";
import { useUnmount } from "ahooks";
import { Layout } from "antd";
import { t } from "i18next";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { GroupCallBar } from "@/features/call/CallProvider";

import { useConversationStore } from "@/store";

import ChatContent from "./ChatContent";
import ChatFooter from "./ChatFooter";
import ChatHeader from "./ChatHeader";
import useConversationState from "./useConversationState";

export const QueryChat = () => {
  const updateCurrentConversation = useConversationStore(
    (state) => state.updateCurrentConversation,
  );

  useConversationState();

  useUnmount(() => {
    updateCurrentConversation();
  });

  return (
    <Layout
      id="chat-container"
      className="relative h-full overflow-hidden bg-page-canvas"
    >
      <ChatHeader />
      <GroupCallBar />
      <PanelGroup direction="vertical">
        <Panel id="chat-main" order={0} className="relative">
          <ChatContent />
        </Panel>
        <PanelResizeHandle className="chat-resize-handle" />
        <Panel
          id="chat-footer"
          order={1}
          defaultSize={22}
          maxSize={60}
          className="min-h-[144px]"
        >
          <ChatFooter />
        </Panel>
      </PanelGroup>
    </Layout>
  );
};

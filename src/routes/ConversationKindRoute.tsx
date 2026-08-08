import { Spin } from "antd";
import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";

import { useConversationStore } from "@/store";
import { isGroupSession } from "@/utils/imCommon";

export const ConversationKindRoute = ({
  kind,
  children,
}: {
  kind: "chat" | "agent_workspace";
  children: React.ReactNode;
}) => {
  const { conversationID = "" } = useParams();
  const conversationList = useConversationStore((state) => state.conversationList);
  const conversationListLoaded = useConversationStore(
    (state) => state.conversationListLoaded,
  );
  const conversationKinds = useConversationStore((state) => state.conversationKinds);
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const updateCurrentConversation = useConversationStore(
    (state) => state.updateCurrentConversation,
  );
  const loadConversationKinds = useConversationStore(
    (state) => state.loadConversationKinds,
  );
  const conversation = conversationList.find(
    (item) => item.conversationID === conversationID,
  );
  const resolvedKind = conversation
    ? isGroupSession(conversation.conversationType)
      ? conversationKinds[conversation.groupID]
      : "chat"
    : undefined;

  useEffect(() => {
    if (conversation && resolvedKind === undefined) {
      void loadConversationKinds([conversation]);
    }
  }, [conversation, loadConversationKinds, resolvedKind]);

  useEffect(() => {
    if (
      conversation &&
      resolvedKind === kind &&
      currentConversation?.conversationID !== conversation.conversationID
    ) {
      void updateCurrentConversation(conversation);
    }
  }, [
    conversation,
    currentConversation?.conversationID,
    kind,
    resolvedKind,
    updateCurrentConversation,
  ]);

  if (!conversation) {
    return conversationListLoaded ? (
      <Navigate to={kind === "chat" ? "/chat" : "/agent"} replace />
    ) : (
      <Spin className="m-auto" />
    );
  }
  if (!resolvedKind) return <Spin className="m-auto" />;
  if (resolvedKind !== kind) {
    return (
      <Navigate
        to={`/${resolvedKind === "chat" ? "chat" : "agent"}/${conversationID}`}
        replace
      />
    );
  }
  if (currentConversation?.conversationID !== conversationID) {
    return <Spin className="m-auto" />;
  }
  return <>{children}</>;
};

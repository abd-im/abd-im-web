import { Layout } from "antd";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useParams } from "react-router-dom";

import AgentSidebar from "./AgentSidebar";
import AgentWorkspaceContent, { AgentWorkspaceDraft } from "./AgentWorkspaceContent";

const isAgentWorkspaceDraft = (value: unknown): value is AgentWorkspaceDraft =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as AgentWorkspaceDraft).agentUserID === "string";

export const Agent = () => (
  <Layout className="flex-row">
    <AgentSidebar />
    <Outlet />
  </Layout>
);

export const EmptyAgent = () => {
  const { t } = useTranslation();
  const { conversationID } = useParams();
  const location = useLocation();
  const state: unknown = location.state;
  const draftState =
    typeof state === "object" && state !== null
      ? (state as { agentWorkspaceDraft?: unknown }).agentWorkspaceDraft
      : undefined;
  const draft = isAgentWorkspaceDraft(draftState) ? draftState : undefined;
  if (conversationID) return null;
  if (draft?.agentUserID) return <AgentWorkspaceContent draft={draft} />;

  return (
    <main className="flex flex-1 items-center justify-center bg-page-canvas text-sm text-muted-foreground">
      {t("agentWorkspace.selectConversation")}
    </main>
  );
};

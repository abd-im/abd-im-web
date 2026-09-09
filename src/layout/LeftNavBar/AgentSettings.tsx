import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui";
import { agentUserEx, agentUserIDFromEx } from "@/features/agent/config";
import { IMSDK } from "@/layout/MainContentWrap";
import type { CheckListItem } from "@/pages/common/ChooseModal/ChooseBox/CheckItem";
import { useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";
import emitter, { emit } from "@/utils/events";

import SecretaryAccessSettings from "./SecretaryAccessSettings";

export default function AgentSettings() {
  const { t } = useTranslation();
  const selfInfo = useUserStore((state) => state.selfInfo);
  const updateSelfInfo = useUserStore((state) => state.updateSelfInfo);
  const agentUserID = agentUserIDFromEx(selfInfo.ex);
  const updateAgentUser = useCallback(
    async (agent: CheckListItem) => {
      if (!agent.userID) return;
      try {
        const ex = agentUserEx(selfInfo.ex, agent.userID);
        await IMSDK.setSelfInfo({ ex });
        updateSelfInfo({ ex });
      } catch (error) {
        feedbackToast({ error });
      }
    },
    [selfInfo.ex, updateSelfInfo],
  );
  useEffect(() => {
    const handler = (agent: CheckListItem) => void updateAgentUser(agent);
    emitter.on("AGENT_USER_SELECTED", handler);
    return () => emitter.off("AGENT_USER_SELECTED", handler);
  }, [updateAgentUser]);
  return (
    <div className="agent-settings-body" data-testid="agent-settings">
      <div className="settings-row agent-user-setting">
        <div className="min-w-0">
          <div>{t("agent.settings.user")}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {agentUserID || t("agent.settings.notSelected")}
          </div>
        </div>
        <Button
          variant="ghost"
          size="small"
          onClick={() => emit("OPEN_CHOOSE_MODAL", { type: "SELECT_AGENT_USER" })}
        >
          {t(agentUserID ? "agent.settings.changeUser" : "agent.settings.selectUser")}
        </Button>
      </div>
      <SecretaryAccessSettings />
    </div>
  );
}

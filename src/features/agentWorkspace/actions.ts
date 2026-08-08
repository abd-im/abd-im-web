import { GroupType } from "@abd-im/wasm-client-sdk";
import type { GroupItem } from "@abd-im/wasm-client-sdk/lib/types/entity";

import { IMSDK } from "@/layout/MainContentWrap";

import { agentWorkspaceEx } from "./metadata";

const AGENT_WORKSPACE_TITLE_LIMIT = 36;

export const agentWorkspaceTitleFromPrompt = (prompt: string, fallback: string) => {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  if (!normalized) return fallback;
  const characters = Array.from(normalized);
  if (characters.length <= AGENT_WORKSPACE_TITLE_LIMIT) return normalized;
  return `${characters.slice(0, AGENT_WORKSPACE_TITLE_LIMIT - 3).join("")}...`;
};

export const createAgentWorkspace = async (
  agentUserID: string,
  groupName = "新对话",
): Promise<GroupItem> => {
  const { data } = await IMSDK.createGroup({
    groupInfo: {
      groupType: GroupType.WorkingGroup,
      groupName,
      ex: agentWorkspaceEx(),
    },
    memberUserIDs: [agentUserID],
    adminUserIDs: [],
  });
  return data;
};

export const renameAgentWorkspace = async (
  group: Pick<GroupItem, "groupID" | "ex">,
  groupName: string,
) => {
  await IMSDK.setGroupInfo({
    groupID: group.groupID,
    groupName,
    ex: agentWorkspaceEx(group.ex),
  });
};

export const setAgentWorkspacePinned = async (
  conversationID: string,
  isPinned: boolean,
) => {
  await IMSDK.setConversation({ conversationID, isPinned });
};

export const shareAgentWorkspace = async (groupID: string, userIDList: string[]) => {
  await IMSDK.inviteUserToGroup({ groupID, userIDList, reason: "" });
};

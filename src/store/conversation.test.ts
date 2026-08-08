import { SessionType } from "@abd-im/wasm-client-sdk";
import type {
  ConversationItem,
  GroupItem,
} from "@abd-im/wasm-client-sdk/lib/types/entity";
import { describe, expect, it } from "vitest";

import { splitConversationList } from "@/features/agentWorkspace/conversationLists";
import { workspaceKindUpdates } from "@/features/agentWorkspace/metadata";

const conversation = (
  conversationID: string,
  conversationType: SessionType,
  groupID = "",
) => ({ conversationID, conversationType, groupID } as ConversationItem);

describe("conversation workspace classification", () => {
  const direct = conversation("si_user", SessionType.Single);
  const workspace = conversation("sg_agent", SessionType.WorkingGroup, "agent");
  const ordinary = conversation("sg_chat", SessionType.WorkingGroup, "chat");

  it("keeps unresolved groups out of both sidebars", () => {
    expect(splitConversationList([direct, workspace, ordinary], {})).toEqual({
      chat: [direct],
      agent: [],
    });
  });

  it("splits ordinary and workspace groups without changing their values", () => {
    expect(
      splitConversationList([direct, workspace, ordinary], {
        agent: "agent_workspace",
        chat: "chat",
      }),
    ).toEqual({ chat: [direct, ordinary], agent: [workspace] });
  });

  it("turns group metadata events into cache updates", () => {
    const groups = [
      {
        groupID: "agent",
        ex: '{"abd":{"kind":"agent_workspace","version":1}}',
      },
      { groupID: "chat", ex: "invalid" },
    ] as GroupItem[];

    expect(workspaceKindUpdates(groups)).toEqual({
      agent: "agent_workspace",
      chat: "chat",
    });
  });
});

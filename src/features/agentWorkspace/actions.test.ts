import { GroupType } from "@abd-im/wasm-client-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createGroup } = vi.hoisted(() => ({
  createGroup: vi.fn(),
}));

vi.mock("@/layout/MainContentWrap", () => ({
  IMSDK: { createGroup },
}));

import { agentWorkspaceTitleFromPrompt, createAgentWorkspace } from "./actions";

describe("Agent workspace actions", () => {
  beforeEach(() => {
    createGroup.mockReset();
    createGroup.mockResolvedValue({ data: { groupID: "agent-group" } });
  });

  it("creates a working group with the selected Agent friend", async () => {
    await createAgentWorkspace("agent-user", "New conversation");

    expect(createGroup).toHaveBeenCalledWith({
      groupInfo: {
        groupType: GroupType.WorkingGroup,
        groupName: "New conversation",
        ex: '{"abd":{"kind":"agent_workspace","version":1}}',
      },
      memberUserIDs: ["agent-user"],
      adminUserIDs: [],
    });
  });

  it("uses a compact first prompt as the conversation title", () => {
    expect(
      agentWorkspaceTitleFromPrompt("  设计  一个\nAgent 工作区  ", "新对话"),
    ).toBe("设计 一个 Agent 工作区");
    expect(agentWorkspaceTitleFromPrompt("a".repeat(40), "新对话")).toBe(
      `${"a".repeat(33)}...`,
    );
  });
});

import { describe, expect, it } from "vitest";

import { agentWorkspaceEx, conversationKind, parseGroupEx } from "./metadata";

describe("Agent workspace group metadata", () => {
  it.each([undefined, "", "not-json", "[]", "null"])(
    "treats %s as an ordinary chat",
    (ex) => {
      expect(conversationKind(ex)).toBe("chat");
    },
  );

  it("recognizes only the supported workspace marker", () => {
    expect(conversationKind('{"abd":{"kind":"agent_workspace","version":1}}')).toBe(
      "agent_workspace",
    );
    expect(conversationKind('{"abd":{"kind":"agent_workspace","version":2}}')).toBe(
      "chat",
    );
    expect(conversationKind('{"abd":{"kind":"other","version":1}}')).toBe("chat");
  });

  it("preserves unrelated extension fields when adding the marker", () => {
    const ex = agentWorkspaceEx('{"other":{"enabled":true},"abd":{"old":1}}');

    expect(parseGroupEx(ex)).toEqual({
      other: { enabled: true },
      abd: { old: 1, kind: "agent_workspace", version: 1 },
    });
  });

  it("starts from an empty object when the existing extension is invalid", () => {
    expect(parseGroupEx(agentWorkspaceEx("invalid"))).toEqual({
      abd: { kind: "agent_workspace", version: 1 },
    });
  });
});

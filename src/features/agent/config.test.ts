import { describe, expect, it } from "vitest";

import { agentUserEx, agentUserIDFromEx } from "./config";

describe("Agent configuration", () => {
  it("stores the configured agent under the generic agent namespace", () => {
    const ex = agentUserEx(
      '{"other":{"enabled":true},"agent":{"mode":"codex"}}',
      "agent-1",
    );

    expect(JSON.parse(ex)).toEqual({
      other: { enabled: true },
      agent: { mode: "codex", userID: "agent-1" },
    });
    expect(agentUserIDFromEx(ex)).toBe("agent-1");
  });

  it("ignores invalid extensions", () => {
    expect(agentUserIDFromEx("not json")).toBeUndefined();
  });
});

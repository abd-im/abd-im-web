import { describe, expect, it } from "vitest";

import { createUserDisplayNameResolver } from "./userDisplayName";

describe("createUserDisplayNameResolver", () => {
  const resolve = createUserDisplayNameResolver([
    { userID: "friend", remark: "Saved remark" },
    { userID: "without-remark", remark: "" },
  ]);

  it("uses the current friend remark for a stale message preview snapshot", () => {
    expect(resolve({ userID: "friend", nickname: "Old nickname" })).toBe(
      "Saved remark",
    );
  });

  it("falls back through the contextual nickname and user ID", () => {
    expect(resolve({ userID: "without-remark", nickname: "Group nickname" })).toBe(
      "Group nickname",
    );
    expect(resolve({ userID: "unknown" })).toBe("unknown");
  });

  it("does not reuse a stale remark after the current remark is cleared", () => {
    expect(
      resolve({
        userID: "without-remark",
        nickname: "Nickname",
        remark: "Stale remark",
      }),
    ).toBe("Nickname");
  });
});

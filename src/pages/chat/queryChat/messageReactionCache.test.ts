import { describe, expect, test, vi } from "vitest";

vi.mock("localforage", () => {
  const values = new Map<string, unknown>();
  return {
    createInstance: () => ({
      getItem: (key: string) => Promise.resolve(values.get(key) ?? null),
      setItem: (key: string, value: unknown) => {
        values.set(key, value);
        return Promise.resolve(value);
      },
    }),
  };
});

import {
  getCachedReactionSummaries,
  setCachedReactionSummaries,
} from "./messageReactionCache";

describe("message reaction cache", () => {
  test("persists summaries by user and conversation", async () => {
    const summaries = {
      "msg-1": {
        clientMsgID: "msg-1",
        version: 3,
        reactions: [{ emoji: "👍", count: 2, reactedByMe: true }],
      },
    };

    await setCachedReactionSummaries("user-a", "conversation-a", summaries);

    await expect(
      getCachedReactionSummaries("user-a", "conversation-a"),
    ).resolves.toEqual(summaries);
    await expect(
      getCachedReactionSummaries("user-b", "conversation-a"),
    ).resolves.toEqual({});
    await expect(
      getCachedReactionSummaries("user-a", "conversation-b"),
    ).resolves.toEqual({});
  });
});

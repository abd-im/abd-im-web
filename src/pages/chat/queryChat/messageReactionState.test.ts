import { describe, expect, it } from "vitest";

import {
  parseReactionUpdatedEvent,
  reduceMessageReactionEvent,
  selectReactionSummaryMessageSeqs,
} from "./messageReactionState";

describe("message reaction state", () => {
  it("selects unloaded persisted message sequences", () => {
    expect(
      selectReactionSummaryMessageSeqs([1, 2, 3], new Set([1]), true, false),
    ).toEqual([2, 3]);
    expect(
      selectReactionSummaryMessageSeqs([1, 2], new Set([1]), false, false),
    ).toEqual([]);
    expect(selectReactionSummaryMessageSeqs([1, 2], new Set([1]), true, true)).toEqual([
      1, 2,
    ]);
  });

  it("parses a seq-based business event", () => {
    expect(
      parseReactionUpdatedEvent({
        key: "message.reaction.updated",
        data: {
          conversationID: "si_a_b",
          seq: 42,
          emoji: "👍",
          action: "added",
          actorUserID: "a",
          count: 2,
          version: 3,
        },
      }),
    ).toMatchObject({ seq: 42, count: 2, version: 3 });
  });

  it("rejects legacy, non-persisted, and unsafe sequence identities", () => {
    const event = {
      key: "message.reaction.updated",
      data: {
        conversationID: "si_a_b",
        emoji: "👍",
        action: "added",
        actorUserID: "a",
        count: 1,
        version: 1,
      },
    };

    expect(
      parseReactionUpdatedEvent({ ...event, data: { ...event.data, seq: 0 } }),
    ).toBeUndefined();
    expect(
      parseReactionUpdatedEvent({
        ...event,
        data: { ...event.data, seq: Number.MAX_SAFE_INTEGER + 1 },
      }),
    ).toBeUndefined();
    expect(
      parseReactionUpdatedEvent({
        ...event,
        data: { ...event.data, clientMsgID: "legacy-message" },
      }),
    ).toBeUndefined();
  });

  it("applies only the next version for the matching summary", () => {
    const current = {
      seq: 42,
      version: 2,
      reactions: [{ emoji: "👍", count: 1, reactedByMe: false, userIDs: ["b"] }],
    };
    const result = reduceMessageReactionEvent(
      current,
      {
        conversationID: "si_a_b",
        seq: 42,
        emoji: "👍",
        action: "added",
        actorUserID: "a",
        count: 2,
        version: 3,
      },
      "a",
    );

    expect(result.requiresRefresh).toBe(false);
    expect(result.summary).toEqual({
      seq: 42,
      version: 3,
      reactions: [{ emoji: "👍", count: 2, reactedByMe: true, userIDs: ["b", "a"] }],
    });
  });

  it("refreshes when the event count does not match cached members", () => {
    const current = {
      seq: 42,
      version: 2,
      reactions: [{ emoji: "👍", count: 1, reactedByMe: false, userIDs: ["b"] }],
    };
    const result = reduceMessageReactionEvent(
      current,
      {
        conversationID: "si_a_b",
        seq: 42,
        emoji: "👍",
        action: "added",
        actorUserID: "a",
        count: 3,
        version: 3,
      },
      "a",
    );

    expect(result.requiresRefresh).toBe(true);
    expect(result.summary).toBe(current);
  });
});

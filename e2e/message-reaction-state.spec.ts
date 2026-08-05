import { expect, test } from "@playwright/test";

import type {
  MessageReactionSummary,
  MessageReactionUpdatedEvent,
} from "../src/api/messageReactionTypes";
import { normalizeMessageReactionSummary } from "../src/api/messageReactionTypes";
import {
  parseReactionUpdatedEvent,
  reduceMessageReactionEvent,
  selectReactionSummaryMessageIDs,
} from "../src/pages/chat/queryChat/messageReactionState";

const summary = (): MessageReactionSummary => ({
  clientMsgID: "msg-1",
  version: 3,
  reactions: [{ emoji: "👍", count: 2, reactedByMe: false }],
});

const event = (
  overrides: Partial<MessageReactionUpdatedEvent> = {},
): MessageReactionUpdatedEvent => ({
  conversationID: "si_a_b",
  clientMsgID: "msg-1",
  emoji: "👍",
  action: "added",
  actorUserID: "user-b",
  count: 3,
  version: 4,
  ...overrides,
});

test("applies only the next reaction version", () => {
  const next = reduceMessageReactionEvent(summary(), event(), "user-a");
  expect(next.requiresRefresh).toBe(false);
  expect(next.summary).toEqual({
    clientMsgID: "msg-1",
    version: 4,
    reactions: [{ emoji: "👍", count: 3, reactedByMe: false }],
  });
});

test("normalizes empty reaction summaries returned as null", () => {
  expect(
    normalizeMessageReactionSummary({
      clientMsgID: "msg-empty",
      version: 4,
      reactions: null,
    }),
  ).toEqual({
    clientMsgID: "msg-empty",
    version: 4,
    reactions: [],
  });
});

test("ignores duplicate and stale reaction events", () => {
  const current = summary();
  const result = reduceMessageReactionEvent(
    current,
    event({ version: 3, count: 99 }),
    "user-a",
  );
  expect(result).toEqual({ summary: current, requiresRefresh: false });
});

test("requests a refresh for missing state or a version gap", () => {
  expect(reduceMessageReactionEvent(undefined, event(), "user-a")).toEqual({
    summary: undefined,
    requiresRefresh: true,
  });
  expect(
    reduceMessageReactionEvent(summary(), event({ version: 5 }), "user-a"),
  ).toEqual({ summary: summary(), requiresRefresh: true });
});

test("derives the current user's selected state", () => {
  const added = reduceMessageReactionEvent(
    summary(),
    event({ actorUserID: "user-a" }),
    "user-a",
  );
  expect(added.summary?.reactions[0].reactedByMe).toBe(true);

  const removed = reduceMessageReactionEvent(
    { ...added.summary!, version: 4 },
    event({ action: "removed", actorUserID: "user-a", count: 0, version: 5 }),
    "user-a",
  );
  expect(removed.summary?.reactions).toEqual([]);
});

test("parses SDK business events delivered as strings or objects", () => {
  const envelope = {
    key: "message.reaction.updated",
    data: event(),
  };

  expect(parseReactionUpdatedEvent(envelope)).toEqual(event());
  expect(parseReactionUpdatedEvent(JSON.stringify(envelope))).toEqual(event());
  expect(
    parseReactionUpdatedEvent({ ...envelope, key: "other.event" }),
  ).toBeUndefined();
  expect(
    parseReactionUpdatedEvent({
      ...envelope,
      data: event({ emoji: "not-allowed" }),
    }),
  ).toBeUndefined();
});

test("reloads every visible summary after reconnect", () => {
  const messageIDs = ["msg-1", "msg-2"];
  const loaded = new Set(messageIDs);

  expect(selectReactionSummaryMessageIDs(messageIDs, loaded, false, true)).toEqual([]);
  expect(
    selectReactionSummaryMessageIDs(messageIDs, new Set(["msg-1"]), false, true),
  ).toEqual(["msg-2"]);
  expect(selectReactionSummaryMessageIDs(messageIDs, loaded, true, false)).toEqual([]);
  expect(selectReactionSummaryMessageIDs(messageIDs, loaded, true, true)).toEqual(
    messageIDs,
  );
});

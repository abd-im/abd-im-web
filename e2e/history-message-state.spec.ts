import { expect, test } from "@playwright/test";

import { mergeHistoryMessages } from "../src/pages/chat/queryChat/historyMessageState";

const message = (clientMsgID: string, content = clientMsgID) => ({
  clientMsgID,
  content,
});

test("deduplicates overlapping history pages", () => {
  const result = mergeHistoryMessages(
    [message("msg-2", "current"), message("msg-3")],
    [message("msg-1"), message("msg-2", "stale"), message("msg-1")],
    true,
  );

  expect(result).toEqual({
    messageList: [message("msg-1"), message("msg-2", "current"), message("msg-3")],
    prependedCount: 1,
  });
});

test("resets and deduplicates the initial history page", () => {
  const result = mergeHistoryMessages(
    [message("stale")],
    [message("msg-1"), message("msg-1"), message("msg-2")],
    false,
  );

  expect(result).toEqual({
    messageList: [message("msg-1"), message("msg-2")],
    prependedCount: 2,
  });
});

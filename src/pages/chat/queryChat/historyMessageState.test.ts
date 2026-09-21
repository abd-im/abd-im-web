import { describe, expect, it } from "vitest";

import {
  appendHistoryMessages,
  applyFriendRemarks,
  getFirstUnreadMessageIndex,
  getLatestUnreadMessageSeq,
  mergeMessageBurnTime,
  updateHistoryMessageSender,
} from "./historyMessageState";

describe("history message state", () => {
  it("merges burn timestamps without replacing edited content or adding unloaded messages", () => {
    const list = [
      {
        clientMsgID: "one",
        content: "edited",
        attachedInfoElem: { hasReadTime: 0, burnDuration: 60 },
      },
      {
        clientMsgID: "two",
        content: "unchanged",
        attachedInfoElem: { hasReadTime: 0, burnDuration: 30 },
      },
    ];
    const updates = [
      {
        ...list[0],
        content: "old content",
        attachedInfoElem: { hasReadTime: 123, burnDuration: 30 },
      },
      { ...list[0], clientMsgID: "outside-page" },
    ];
    const next = mergeMessageBurnTime(list, updates);
    expect(next).toEqual([
      { ...list[0], attachedInfoElem: { hasReadTime: 123, burnDuration: 60 } },
      list[1],
    ]);
    expect(next[1]).toBe(list[1]);
    expect(mergeMessageBurnTime(next, updates)).toBe(next);
    expect(mergeMessageBurnTime(next, list)).toBe(next);
  });

  it("does not invent or reset a burn timestamp", () => {
    const message = { clientMsgID: "one", attachedInfoElem: { hasReadTime: 123 } };
    expect(
      mergeMessageBurnTime(
        [message],
        [{ ...message, attachedInfoElem: { hasReadTime: 456 } }],
      )[0],
    ).toBe(message);
    const pending = { clientMsgID: "two" };
    expect(mergeMessageBurnTime([pending], [pending])[0]).toBe(pending);
  });

  const messages = [
    {
      clientMsgID: "message-1",
      sendID: "user-1",
      senderNickname: "Old name",
      senderFaceUrl: "old-face",
    },
    {
      clientMsgID: "message-2",
      sendID: "user-1",
      senderNickname: "Old name",
      senderFaceUrl: "old-face",
    },
    {
      clientMsgID: "message-3",
      sendID: "user-2",
      senderNickname: "Other user",
      senderFaceUrl: "other-face",
    },
  ];

  it("updates every loaded message from the changed sender", () => {
    const result = updateHistoryMessageSender(messages, {
      userID: "user-1",
      nickname: "New name",
      faceURL: "new-face",
    });

    expect(result[0]).toEqual({
      ...messages[0],
      senderNickname: "New name",
      senderFaceUrl: "new-face",
    });
    expect(result[1]).toEqual({
      ...messages[1],
      senderNickname: "New name",
      senderFaceUrl: "new-face",
    });
    expect(result[2]).toBe(messages[2]);
  });

  it("preserves the list when the displayed profile is already current", () => {
    const result = updateHistoryMessageSender(messages, {
      userID: "user-2",
      nickname: "Other user",
      faceURL: "other-face",
    });

    expect(result).toBe(messages);
  });

  it("applies saved remarks to messages loaded after the friend changed", () => {
    const result = applyFriendRemarks(messages, [
      { userID: "user-1", remark: "Saved remark" },
      { userID: "user-2", remark: "" },
    ]);

    expect(result[0]).toEqual({
      ...messages[0],
      senderNickname: "Saved remark",
    });
    expect(result[0].senderFaceUrl).toBe("old-face");
    expect(result[2]).toBe(messages[2]);
  });

  it("waits for a stream message to receive a sequence before submitting read", () => {
    const streamMessage = { sendID: "user-1", seq: 0 };
    const laterMessage = { sendID: "user-1", seq: 11 };

    expect(getLatestUnreadMessageSeq([streamMessage], "self-user", 0)).toBe(0);
    expect(
      getLatestUnreadMessageSeq([streamMessage, laterMessage], "self-user", 0),
    ).toBe(11);
    expect(
      getLatestUnreadMessageSeq(
        [{ ...streamMessage, seq: 12 }, laterMessage],
        "self-user",
        0,
      ),
    ).toBe(12);
  });

  it("uses the conversation cursor across gaps and excludes outgoing messages", () => {
    const list = [
      { clientMsgID: "pending", sendID: "peer", seq: 0 },
      { clientMsgID: "read", sendID: "peer", seq: 10 },
      { clientMsgID: "self", sendID: "self", seq: 12 },
      { clientMsgID: "unread", sendID: "peer", seq: 20 },
    ];
    expect(getFirstUnreadMessageIndex(list, "self", 10)).toBe(3);
    expect(getFirstUnreadMessageIndex(list, "self", 20)).toBe(-1);
    expect(getLatestUnreadMessageSeq(list, "self", 10)).toBe(20);
    expect(getLatestUnreadMessageSeq(list, "self", 20)).toBe(0);
  });

  it("appends newer history without duplicating the anchor", () => {
    const current = [{ clientMsgID: "10" }, { clientMsgID: "11" }];
    const result = appendHistoryMessages(current, [
      { clientMsgID: "11" },
      { clientMsgID: "12" },
      { clientMsgID: "13" },
    ]);

    expect(result.messageList.map((message) => message.clientMsgID)).toEqual([
      "10",
      "11",
      "12",
      "13",
    ]);
    expect(result.appendedCount).toBe(2);
  });
});

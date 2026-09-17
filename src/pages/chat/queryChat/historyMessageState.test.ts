import { describe, expect, it } from "vitest";

import {
  appendHistoryMessages,
  applyFriendRemarks,
  applySingleReadCursor,
  getFirstUnreadMessageIndex,
  getLatestUnreadMessageSeq,
  updateHistoryMessageSender,
} from "./historyMessageState";

describe("history message state", () => {
  it("applies a peer cursor only to successful positions in own outgoing messages", () => {
    const outgoing = (seq: number) => ({
      sendID: "self",
      recvID: "peer",
      seq,
      isRead: false,
    });
    const list = [
      outgoing(1),
      outgoing(5),
      outgoing(6),
      outgoing(0),
      { ...outgoing(2), sendID: "peer", recvID: "self" },
    ];
    const next = applySingleReadCursor(list, "self", "peer", 5, 0);
    expect(next.map((message) => message.isRead)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(applySingleReadCursor(next, "self", "peer", 3, 0)).toBe(next);
    expect(applySingleReadCursor(next, "self", "another", 100, 0)).toBe(next);
  });

  it("reconnect calibration does not invent a burn timestamp", () => {
    const list = [
      {
        sendID: "self",
        recvID: "peer",
        seq: 1,
        isRead: false,
        attachedInfoElem: { isPrivateChat: true, hasReadTime: 0 },
      },
    ];
    expect(
      applySingleReadCursor(list, "self", "peer", 1, 0)[0].attachedInfoElem.hasReadTime,
    ).toBe(0);
    expect(
      applySingleReadCursor(list, "self", "peer", 1, 123)[0].attachedInfoElem
        .hasReadTime,
    ).toBe(123);
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
    const streamMessage = { sendID: "user-1", seq: 0, isRead: false };
    const laterMessage = { sendID: "user-1", seq: 11, isRead: false };

    expect(getLatestUnreadMessageSeq([streamMessage], "self-user")).toBe(0);
    expect(getLatestUnreadMessageSeq([streamMessage, laterMessage], "self-user")).toBe(
      11,
    );
    expect(
      getLatestUnreadMessageSeq(
        [{ ...streamMessage, seq: 12 }, laterMessage],
        "self-user",
      ),
    ).toBe(12);
  });

  it("locates the first unread incoming message and falls back to the unread count", () => {
    const list = [
      { clientMsgID: "read", sendID: "peer", seq: 1, isRead: true },
      { clientMsgID: "self", sendID: "self", seq: 2, isRead: false },
      { clientMsgID: "unread", sendID: "peer", seq: 3, isRead: false },
    ];

    expect(getFirstUnreadMessageIndex(list, "self", 2)).toBe(2);
    expect(
      getFirstUnreadMessageIndex(
        list.map((message) => ({ ...message, isRead: true })),
        "self",
        2,
      ),
    ).toBe(1);
    expect(getFirstUnreadMessageIndex(list, "self", 0)).toBe(2);
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

import { describe, expect, it } from "vitest";

import {
  applyFriendRemarks,
  getLatestUnreadMessageSeq,
  updateHistoryMessageSender,
} from "./historyMessageState";

describe("history message state", () => {
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
});

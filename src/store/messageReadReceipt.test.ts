import type { MessageReadInfo, MessageReceiptInfo } from "@abd-im/wasm-client-sdk";
import { beforeEach, expect, it } from "vitest";

import { useMessageReadReceiptStore } from "./messageReadReceipt";

beforeEach(() => useMessageReadReceiptStore.getState().clear());

it("replaces a conversation read snapshot", () => {
  const item = (seq: number, hasReadCount = 0) =>
    ({ seq, hasReadCount } as MessageReadInfo);
  const receipt: MessageReceiptInfo = {
    conversationID: "sg_test",
    enabled: true,
    status: "ready",
    reason: "",
    messageReadInfo: [item(1), item(2)],
  };
  const store = useMessageReadReceiptStore.getState();
  store.update(receipt);
  store.update({ ...receipt, messageReadInfo: [item(2, 1)] });
  expect(
    useMessageReadReceiptStore
      .getState()
      .conversations.sg_test.messageReadInfo.map((message) => message.hasReadCount),
  ).toEqual([1]);
  store.update({
    ...receipt,
    enabled: false,
    reason: "MEMBER_LIMIT_EXCEEDED",
    messageReadInfo: [],
  });
  expect(
    useMessageReadReceiptStore.getState().conversations.sg_test.messageReadInfo,
  ).toEqual([]);
});

import type {
  GroupMessageReadInfo,
  GroupMessageReceiptInfo,
} from "@abd-im/wasm-client-sdk";
import { beforeEach, expect, it } from "vitest";

import { useGroupReadReceiptStore } from "./groupReadReceipt";

beforeEach(() => useGroupReadReceiptStore.getState().clear());

it("replaces a conversation read snapshot", () => {
  const item = (seq: number, hasReadCount = 0) =>
    ({ clientMsgID: String(seq), seq, hasReadCount } as GroupMessageReadInfo);
  const receipt: GroupMessageReceiptInfo = {
    conversationID: "sg_test",
    enabled: true,
    status: "ready",
    reason: "",
    groupMessageReadInfo: [item(1), item(2)],
  };
  const store = useGroupReadReceiptStore.getState();
  store.update(receipt);
  store.update({ ...receipt, groupMessageReadInfo: [item(2, 1)] });
  expect(
    useGroupReadReceiptStore
      .getState()
      .groups.sg_test.groupMessageReadInfo.map((message) => message.hasReadCount),
  ).toEqual([1]);
  store.update({
    ...receipt,
    enabled: false,
    reason: "MEMBER_LIMIT_EXCEEDED",
    groupMessageReadInfo: [],
  });
  expect(
    useGroupReadReceiptStore.getState().groups.sg_test.groupMessageReadInfo,
  ).toEqual([]);
});

import { MessageItem, MessageType } from "@abd-im/wasm-client-sdk";
import { describe, expect, it } from "vitest";

import { COMPOSITE_MESSAGE_EX, getCompositeParts } from "./compositeMessage";
import { getMessagePreview } from "./messagePreview";

const text = {
  contentType: MessageType.TextMessage,
  textElem: { content: "Caption" },
} as MessageItem;
const image = { contentType: MessageType.PictureMessage } as MessageItem;
const composite = {
  contentType: MessageType.MergeMessage,
  ex: COMPOSITE_MESSAGE_EX,
  mergeElem: { multiMessage: [text, image] },
} as MessageItem;

describe("composite message compatibility", () => {
  it("preserves inline parts after serialization and forwarding", () => {
    const forwarded = JSON.parse(
      JSON.stringify({ ...composite, clientMsgID: "forwarded" }),
    ) as MessageItem;
    expect(getCompositeParts(forwarded)).toEqual([text, image]);
    expect(getMessagePreview(forwarded)).toContain("Caption");
  });

  it("leaves ordinary merged chat records and unknown protocol versions alone", () => {
    for (const ex of [
      "",
      "invalid",
      "null",
      JSON.stringify({ abdComposite: { version: 2 } }),
    ]) {
      expect(getCompositeParts({ ...composite, ex })).toBeUndefined();
    }
  });

  it("rejects malformed or recursively nested parts", () => {
    for (const multiMessage of [[], [null], [composite], "invalid"]) {
      expect(
        getCompositeParts({ ...composite, mergeElem: { multiMessage } } as MessageItem),
      ).toBeUndefined();
    }
  });
});

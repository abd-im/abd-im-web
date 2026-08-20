import { MessageItem, MessageType } from "@abd-im/wasm-client-sdk";
import { describe, expect, it } from "vitest";

import { createQuoteSnapshot } from "./partialQuote";

describe("partial quote snapshot", () => {
  it("replaces stream payloads with the visible canonical text", () => {
    const message = {
      clientMsgID: "message-1",
      serverMsgID: "server-1",
      contentType: MessageType.StreamMessage,
      streamElem: {
        type: "agent_run_v1",
        content: "metadata",
        packets: ["large tool packet"],
      },
    } as MessageItem;

    const snapshot = createQuoteSnapshot({
      message,
      quoteText: "answer",
      quoteOffset: 0,
      sourceText: "answer text",
    });

    expect(snapshot.clientMsgID).toBe("message-1");
    expect(snapshot.contentType).toBe(MessageType.TextMessage);
    expect(snapshot.textElem?.content).toBe("answer text");
    expect(snapshot.streamElem).toBeUndefined();
  });
});

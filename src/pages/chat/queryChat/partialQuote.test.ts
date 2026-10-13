import { MessageItem, MessageType } from "@abd-im/wasm-client-sdk";
import { describe, expect, it } from "vitest";

import { createQuoteSnapshot } from "./partialQuote";

describe("partial quote snapshot", () => {
  it("drops the component body from the text-only quote snapshot", () => {
    const original = {
      clientMsgID: "v2",
      contentType: MessageType.ComponentMessage,
      message: { flags: 32768, components: [{ type: 10, content: "**answer**" }] },
    } as MessageItem;
    const snapshot = createQuoteSnapshot({
      message: original,
      quoteText: "answer",
      quoteOffset: 0,
      sourceText: "answer",
    });
    expect(snapshot.message).toBeUndefined();
    expect(snapshot.textElem?.content).toBe("answer");
    expect(original.message).toBeDefined();
  });
  it("replaces stream payloads with the visible canonical text", () => {
    const message = {
      clientMsgID: "message-1",
      serverMsgID: "server-1",
      contentType: MessageType.StreamMessage,
      streamElem: {
        type: "agent_run_v2",
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

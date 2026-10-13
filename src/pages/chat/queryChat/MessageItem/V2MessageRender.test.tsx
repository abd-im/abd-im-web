import type { MessageItem, MessageV2 } from "@abd-im/wasm-client-sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getV2Preview, resolveV2Media } from "../messageV2";
import V2MessageRender from "./V2MessageRender";

vi.mock("./MediaMessageRender", () => ({
  default: () => <span>existing picture</span>,
}));
vi.mock("./VideoMessageRender", () => ({ default: () => <span>existing video</span> }));
vi.mock("./FileMessageRender", () => ({
  default: ({ message }: { message: MessageItem }) => (
    <button data-file-url={message.fileElem?.sourceUrl}>
      {message.fileElem?.fileName || "existing file"}
    </button>
  ),
}));
vi.mock("@/components/AudioPlayer", () => ({
  AudioPlayer: () => <span>audio player</span>,
}));
vi.mock("@/hooks/useCachedMedia", async () => {
  const { createContext } = await import("react");
  return { MediaCacheEnabledContext: createContext(true) };
});

const body: MessageV2 = {
  flags: 32768,
  components: [
    {
      type: 17,
      components: [
        { type: 10, content: "**Report**" },
        { type: 13, file: { url: "attachment://report.txt" } },
        { type: 10, content: "Finished" },
      ],
    },
  ],
  attachments: [
    {
      id: "file",
      filename: "report.txt",
      size: 10,
      url: "https://example.org/report.txt",
      content_type: "text/plain",
    },
  ],
};

describe("V2 message body", () => {
  it("renders nested text and attachment references in order", () => {
    const markup = renderToStaticMarkup(
      <V2MessageRender message={{ message: body } as MessageItem} />,
    );
    expect(markup).toContain("<strong>Report</strong>");
    expect(markup).toContain('data-file-url="https://example.org/report.txt"');
    expect(markup).not.toContain("download=");
    expect(markup.indexOf("report.txt")).toBeLessThan(markup.indexOf("Finished"));
    expect(getV2Preview(body)).toBe("**Report**\nFinished");
  });

  it("resolves each file in a combined message to its own preview", () => {
    const message = {
      message: {
        ...body,
        components: [
          { type: 13, file: { url: "attachment://report.txt" } },
          { type: 13, file: { url: "attachment://design.pdf" } },
        ],
        attachments: [
          ...body.attachments!,
          {
            id: "pdf",
            filename: "design.pdf",
            size: 100,
            url: "https://example.org/design.pdf",
          },
        ],
      },
    } as MessageItem;
    const markup = renderToStaticMarkup(<V2MessageRender message={message} />);
    expect(markup).toContain('data-file-url="https://example.org/report.txt"');
    expect(markup).toContain('data-file-url="https://example.org/design.pdf"');
    expect(markup).not.toContain("<a");
  });

  it("does not turn file references into executable links", () => {
    expect(resolveV2Media({ url: "javascript:alert(1)" }).url).toBe("");
    expect(
      resolveV2Media({ url: "attachment://report.txt" }, body.attachments).url,
    ).toBe("https://example.org/report.txt");
  });

  it("renders mentions from the Discord component body", () => {
    const mention = {
      contentType: 144,
      message: {
        flags: 32768,
        components: [{ type: 10, content: "**<@bob>** @Bob" }],
        mentions: [{ id: "bob", username: "Bob" }],
      },
    } as unknown as MessageItem;
    const mentionMarkup = renderToStaticMarkup(<V2MessageRender message={mention} />);
    expect(mentionMarkup).toContain("@Bob");
    expect(mentionMarkup).toContain('data-v2-mention-user-id="bob"');
    const file = {
      contentType: 144,
      fileElem: {},
      message: {
        flags: 32768,
        components: [{ type: 13, file: { url: "https://example.org/a.txt" } }],
      },
    } as unknown as MessageItem;
    expect(renderToStaticMarkup(<V2MessageRender message={file} />)).toContain(
      'data-file-url="https://example.org/a.txt"',
    );
    const imageFile = {
      contentType: 144,
      fileElem: { fileName: "photo.png" },
      message: {
        flags: 32768,
        components: [{ type: 13, file: { url: "https://example.org/photo.png" } }],
        attachments: [
          {
            id: "photo",
            filename: "photo.png",
            content_type: "image/png",
            url: "https://example.org/photo.png",
          },
        ],
      },
    } as unknown as MessageItem;
    expect(renderToStaticMarkup(<V2MessageRender message={imageFile} />)).toContain(
      "existing picture",
    );
  });

  it("renders video attachments with the video renderer", () => {
    const video = {
      contentType: 144,
      message: {
        flags: 32768,
        components: [
          { type: 12, items: [{ media: { url: "attachment://clip.mp4" } }] },
        ],
        attachments: [
          {
            id: "video",
            filename: "clip.mp4",
            content_type: "video/mp4",
            url: "https://example.org/clip.mp4",
          },
        ],
      },
    } as unknown as MessageItem;
    expect(renderToStaticMarkup(<V2MessageRender message={video} />)).toContain(
      "existing video",
    );
  });

  it("renders upload card instead of attachment preview when sending a single file", () => {
    const sendingMessage = {
      contentType: 144,
      status: 1, // MessageStatus.Sending
      message: {
        flags: 32768,
        components: [
          { type: 10, content: "123456" },
          { type: 12, items: [{ media: { url: "attachment://image.png" } }] },
        ],
        attachments: [
          {
            id: "img1",
            filename: "image.png",
            size: 1024,
            url: "attachment://image.png",
            content_type: "image/png",
          },
        ],
      },
    } as unknown as MessageItem;
    const markup = renderToStaticMarkup(<V2MessageRender message={sendingMessage} />);
    expect(markup).toContain("123456");
    expect(markup).toContain("data-upload-card");
    expect(markup).toContain("image.png");
    expect(markup).not.toContain("existing picture");
  });

  it("renders single multi-file upload card when sending multiple files", () => {
    const multiSendingMessage = {
      contentType: 144,
      status: 1, // MessageStatus.Sending
      message: {
        flags: 32768,
        components: [
          { type: 10, content: "hello" },
          {
            type: 12,
            items: [
              { media: { url: "attachment://f1.png" } },
              { media: { url: "attachment://f2.png" } },
              { media: { url: "attachment://f3.png" } },
            ],
          },
        ],
        attachments: [
          { id: "1", filename: "f1.png", size: 100000, url: "attachment://f1.png" },
          { id: "2", filename: "f2.png", size: 200000, url: "attachment://f2.png" },
          { id: "3", filename: "f3.png", size: 223370, url: "attachment://f3.png" },
        ],
      },
    } as unknown as MessageItem;
    const markup = renderToStaticMarkup(
      <V2MessageRender message={multiSendingMessage} />,
    );
    expect(markup).toContain("hello");
    expect(markup).toContain("data-upload-card");
    expect(markup).toContain("正在上传 3 个文件 — 511.10 KB");
    expect(markup).not.toContain("existing picture");
  });
});

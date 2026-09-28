import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";
import StreamMessageRender from "./StreamMessageRender";

describe("StreamMessageRender", () => {
  it("renders Markdown streams without rendering raw HTML", () => {
    const message = {
      streamElem: {
        type: "markdown",
        content: "**Bold** ",
        packets: ["and `code` <script>alert('x')</script>"],
      },
    } as unknown as IMessageItemProps["message"];

    const markup = renderToStaticMarkup(<StreamMessageRender message={message} />);

    expect(markup).toContain(`class="${styles["markdown-content"]}"`);
    expect(markup).toContain("<strong>Bold</strong>");
    expect(markup).toContain("<code>code</code>");
    expect(markup).not.toContain("<script>");
  });

  it("keeps text streams as plain text", () => {
    const message = {
      streamElem: {
        type: "text",
        content: "**Bold**",
        packets: [],
      },
    } as unknown as IMessageItemProps["message"];

    const markup = renderToStaticMarkup(<StreamMessageRender message={message} />);

    expect(markup).toContain("**Bold**");
    expect(markup).not.toContain("<strong>");
  });
});

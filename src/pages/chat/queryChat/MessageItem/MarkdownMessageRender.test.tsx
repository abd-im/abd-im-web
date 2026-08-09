import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { IMessageItemProps } from ".";
import MarkdownMessageRender from "./MarkdownMessageRender";
import styles from "./message-item.module.scss";

describe("MarkdownMessageRender", () => {
  it("renders Markdown without rendering raw HTML", () => {
    const message = {
      markdownTextElem: {
        content: "**Bold** and `code` <script>alert('x')</script>",
      },
    } as unknown as IMessageItemProps["message"];

    const markup = renderToStaticMarkup(<MarkdownMessageRender message={message} />);

    expect(markup).toContain(`class="${styles["markdown-content"]}"`);
    expect(markup).toContain("<strong>Bold</strong>");
    expect(markup).toContain("<code>code</code>");
    expect(markup).not.toContain("<script>");
  });
});

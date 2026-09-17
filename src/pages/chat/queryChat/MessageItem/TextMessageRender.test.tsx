import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { IMessageItemProps } from ".";
import TextMessageRender from "./TextMessageRender";

describe("TextMessageRender", () => {
  it("renders remote message content as text", () => {
    const message = {
      textElem: {
        content: '<img src=x onerror="alert(1)">\n<script>alert(2)</script>',
      },
    } as unknown as IMessageItemProps["message"];

    const markup = renderToStaticMarkup(<TextMessageRender message={message} />);

    expect(markup).toContain("&lt;img");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<script>");
  });

  it("turns HTTP and www URLs into safe external links", () => {
    const message = {
      textElem: {
        content: "文档 https://example.com/a?q=1，备用 www.example.org/test.",
      },
    } as unknown as IMessageItemProps["message"];

    const markup = renderToStaticMarkup(<TextMessageRender message={message} />);

    expect(markup).toContain('href="https://example.com/a?q=1"');
    expect(markup).toContain('href="https://www.example.org/test"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("备用 ");
    expect(markup).toContain("</a>.");
  });
});

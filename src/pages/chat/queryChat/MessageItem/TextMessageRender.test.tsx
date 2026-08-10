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
});

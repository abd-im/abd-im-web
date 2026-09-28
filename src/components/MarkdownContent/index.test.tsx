import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import MarkdownContent from ".";

describe("MarkdownContent", () => {
  it("renders tables, task lists, strikethrough and external links", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>
        {
          "| Name | Status |\n| --- | --- |\n| Preview | Done |\n\n- [x] ready\n\n~~old~~ [docs](https://example.com)"
        }
      </MarkdownContent>,
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<td>Done</td>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<del>old</del>");
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
  });

  it("does not execute HTML or expose local and executable links", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>
        {
          "<script>alert(1)</script>\n\n[run](javascript:alert%281%29) [local](file:///etc/passwd) [relative](../settings) ![bad](data:image/svg+xml,test)"
        }
      </MarkdownContent>,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("file://");
    expect(html).not.toContain("../settings");
    expect(html).not.toContain("data:image");
  });
});

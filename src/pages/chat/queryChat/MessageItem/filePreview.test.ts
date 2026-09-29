import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getFilePreviewType,
  getSafeFileUrl,
  loadFilePreview,
  PreviewTooLargeError,
} from "./filePreview";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("file previews", () => {
  it("recognizes common previews and leaves binary formats for download", () => {
    expect(getFilePreviewType("README.MD")).toBe("markdown");
    expect(getFilePreviewType("data.json")).toBe("text");
    expect(getFilePreviewType("page.html")).toBe("text");
    expect(getFilePreviewType("scan.PDF")).toBe("pdf");
    expect(getFilePreviewType("photo.jpg")).toBe("image");
    expect(getFilePreviewType("archive.zip")).toBeUndefined();
    expect(getFilePreviewType("document.docx")).toBeUndefined();
  });

  it("rejects executable, relative and local file URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///etc/passwd",
      "../secret",
    ])
      expect(getSafeFileUrl(url)).toBeUndefined();
    expect(getSafeFileUrl("https://files.example/a.md")).toBe(
      "https://files.example/a.md",
    );
    expect(getSafeFileUrl("blob:https://example.com/id")).toBe(
      "blob:https://example.com/id",
    );
  });

  it("reads UTF-8 content and passes cancellation without sending credentials", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("你好", { headers: { "content-type": "text/plain" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    const result = await loadFilePreview("https://files.example/a.txt", 10, signal);
    expect(await result.text()).toBe("你好");
    expect(fetchMock).toHaveBeenCalledWith("https://files.example/a.txt", {
      signal,
      credentials: "omit",
    });
  });

  it("caps streamed bytes even when Content-Length is missing or incorrect", async () => {
    for (const headers of [new Headers(), new Headers({ "content-length": "1" })]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("oversized", { headers })),
      );
      await expect(
        loadFilePreview("https://files.example/a.txt", 4, new AbortController().signal),
      ).rejects.toBeInstanceOf(PreviewTooLargeError);
    }
  });

  it("rejects oversized responses before reading and reports failed requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("data", { headers: { "content-length": "9999" } }),
        )
        .mockResolvedValueOnce(new Response("missing", { status: 404 })),
    );
    await expect(
      loadFilePreview("https://files.example/a.txt", 4, new AbortController().signal),
    ).rejects.toBeInstanceOf(PreviewTooLargeError);
    await expect(
      loadFilePreview("https://files.example/a.txt", 4, new AbortController().signal),
    ).rejects.toThrow("404");
  });
});

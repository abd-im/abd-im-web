import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getFilePreviewType,
  getSafeFileUrl,
  loadFilePreview,
  PreviewTooLargeError,
} from "./filePreview";

vi.mock("@/config", () => ({ RUNTIME_API_URL: "https://alissa.xin/api" }));

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
    expect(getFilePreviewType("recording.mp3")).toBe("audio");
    expect(getFilePreviewType("demo.WEBM")).toBe("video");
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

  it("fetches legacy API object links over HTTPS when previewing on an HTTPS page", async () => {
    vi.stubGlobal("window", { location: new URL("https://chat.alissa.xin") });
    const fetchMock = vi.fn().mockResolvedValue(new Response("# Storage"));
    vi.stubGlobal("fetch", fetchMock);
    const url = "http://alissa.xin/object/user/file/storage%20notes.md?download=1";
    const secureUrl =
      "https://alissa.xin/object/user/file/storage%20notes.md?download=1";
    const signal = new AbortController().signal;

    expect(getSafeFileUrl(url)).toBe(secureUrl);
    const result = await loadFilePreview(url, 100, signal);
    expect(await result.text()).toBe("# Storage");
    expect(fetchMock).toHaveBeenCalledWith(secureUrl, {
      signal,
      credentials: "omit",
    });
  });

  it("preserves external HTTP links, other paths and explicit service ports", () => {
    vi.stubGlobal("window", { location: new URL("https://alissa.xin") });
    for (const url of [
      "http://files.example/object/a.md",
      "http://alissa.xin.example/object/a.md",
      "http://alissa.xin/downloads/a.md",
      "http://alissa.xin:10005/object/a.md",
    ]) {
      expect(getSafeFileUrl(url)).toBe(url);
    }
  });

  it("preserves HTTP object links outside HTTPS pages", () => {
    const url = "http://alissa.xin/object/user/file/storage.md";
    for (const pageUrl of ["http://alissa.xin", "file:///app/index.html"]) {
      vi.stubGlobal("window", { location: new URL(pageUrl) });
      expect(getSafeFileUrl(url)).toBe(url);
    }
  });

  it("accepts only capability URLs for desktop cache previews", () => {
    const local = "abd-media://cache/f9a5b3f7-27ce-4b87-a461-9c2134950fbd";
    expect(getSafeFileUrl(local)).toBe(local);
    for (const url of [
      "abd-media://cache/etc/passwd",
      "abd-media://other/token",
      `${local}?path=/etc/passwd`,
    ]) {
      expect(getSafeFileUrl(url)).toBeUndefined();
    }
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

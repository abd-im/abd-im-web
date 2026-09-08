import { describe, expect, it } from "vitest";

import { getAttachmentType } from "./attachmentType";

describe("getAttachmentType", () => {
  it("recognizes pasted images and videos by MIME type", () => {
    expect(getAttachmentType({ name: "image.png", type: "image/png" })).toBe("image");
    expect(getAttachmentType({ name: "clip.mp4", type: "video/mp4" })).toBe("video");
  });

  it("falls back to the extension for dragged files without a MIME type", () => {
    expect(getAttachmentType({ name: "photo.HEIC", type: "" })).toBe("image");
    expect(getAttachmentType({ name: "movie.mov", type: "" })).toBe("video");
  });

  it("treats all other attachments as files", () => {
    expect(getAttachmentType({ name: "report.pdf", type: "application/pdf" })).toBe(
      "file",
    );
  });
});

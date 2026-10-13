import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ComposerAttachments from "./ComposerAttachments";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("composer attachments", () => {
  it("uses the video icon for pending video files", () => {
    const file = {
      name: "recording.mp4",
      size: 1024,
      type: "video/mp4",
    } as File;
    const markup = renderToStaticMarkup(
      <ComposerAttachments
        attachments={[{ id: "video", file, type: "video" }]}
        disabled={false}
        onRemove={vi.fn()}
      />,
    );

    expect(markup).toContain('data-attachment-type="video"');
    expect(markup).toContain("lucide-file-video");
  });
});

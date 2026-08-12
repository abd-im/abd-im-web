import { afterEach, describe, expect, it, vi } from "vitest";

import { checkRtcMediaAccess } from "./rtcMedia";

describe("checkRtcMediaAccess", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires audio and video for a video call", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }, { stop }],
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    await checkRtcMediaAccess("video");

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it("requires only audio for an audio call", async () => {
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    await checkRtcMediaAccess("audio");

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  });

  it("fails outside a media-capable browser context", async () => {
    vi.stubGlobal("navigator", {});

    await expect(checkRtcMediaAccess("video")).rejects.toThrow(
      "Media devices are unavailable",
    );
  });
});

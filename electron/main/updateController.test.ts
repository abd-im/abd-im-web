import { describe, expect, it, vi } from "vitest";
import {
  UpdateController,
  validateRelease,
  selectUpdate,
  validateUpdateManifest,
  trustedUpdaterRequest,
  type UpdateDependencies,
} from "./updateController";
import type { DesktopRelease } from "../../src/types/desktopUpdate";

const release: DesktopRelease = {
  id: "0123456789abcdef01234567",
  platform: "windows",
  arch: "x64",
  version: "1.0.1",
  url: "https://downloads.example.com/1.0.1/ABD_1.0.1_x64.exe",
  feedUrl: "https://downloads.example.com/1.0.1/",
  text: "Fix notifications",
  force: false,
};
const setup = (overrides: Partial<UpdateDependencies> = {}) => {
  const deps: UpdateDependencies = {
    enabled: true,
    version: "1.0.0",
    platform: "windows",
    arch: "x64",
    origins: ["https://downloads.example.com"],
    query: vi.fn(async () => ({ version: { ...release, hot: false } })),
    download: vi.fn(async () => {}),
    publish: vi.fn(),
    log: vi.fn(),
    ...overrides,
  };
  return { deps, controller: new UpdateController(deps) };
};

describe("desktop update orchestration", () => {
  it("accepts the library's cache-busting manifest query while rejecting untrusted requests", () => {
    const origins = ["https://downloads.example.com"];
    expect(() =>
      trustedUpdaterRequest(
        "https://downloads.example.com/1.0.1/latest.yml?noCache=1nabc234",
        origins,
      ),
    ).not.toThrow();
    for (const url of [
      "https://evil.com/latest.yml?noCache=123",
      "https://downloads.example.com/latest.yml?token=secret",
      "https://downloads.example.com/latest.yml?noCache=123&token=secret",
      "https://downloads.example.com/app.exe?noCache=123",
    ])
      expect(() => trustedUpdaterRequest(url, origins)).toThrow();
  });
  it("deduplicates checks and becomes installable only when verification completes", async () => {
    let finish!: () => void;
    const { deps, controller } = setup({
      download: vi.fn((_, progress) => {
        progress(100, 100, 100);
        return new Promise((resolve) => {
          finish = resolve;
        });
      }),
    });
    const first = controller.check();
    const second = controller.check();
    expect(first).toBe(second);
    await vi.waitFor(() => expect(controller.state.phase).toBe("verifying"));
    expect(controller.state.phase).toBe("verifying");
    finish();
    await first;
    expect(deps.download).toHaveBeenCalledTimes(1);
    expect(controller.state.phase).toBe("downloaded");
  });
  it("keeps a verified candidate without querying or replacing it", async () => {
    const { controller, deps } = setup();
    await controller.check();
    await controller.check();
    expect(controller.state.phase).toBe("downloaded");
    expect(controller.state.release?.version).toBe("1.0.1");
    expect(deps.query).toHaveBeenCalledTimes(1);
    expect(deps.download).toHaveBeenCalledTimes(1);
  });
  it("derives the generic feed from the existing version record", () => {
    const { deps } = setup();
    const { arch: _, feedUrl: __, ...record } = release;
    expect(selectUpdate({ ...record, hot: false }, deps)).toMatchObject(release);
    expect(
      selectUpdate(
        {
          ...record,
          platform: "mac",
          hot: false,
          url: "https://downloads.example.com/mac/arm64/1.0.1/ABD_1.0.1_arm64.dmg",
        },
        { ...deps, platform: "mac", arch: "arm64" },
      ),
    ).toMatchObject({
      arch: "arm64",
      feedUrl: "https://downloads.example.com/mac/arm64/1.0.1/",
    });
  });
  it.each([
    { version: "1.0.0" },
    { version: "0.9.0" },
    { version: "1.1.0-beta.1" },
    { hot: true },
  ])("does not download ineligible legacy records: %o", async (patch) => {
    const { controller, deps } = setup({
      query: vi.fn(async () => ({ version: { ...release, hot: false, ...patch } })),
    });
    await controller.check();
    expect(controller.state.phase).toBe("upToDate");
    expect(deps.download).not.toHaveBeenCalled();
  });
  it("rejects invalid or wrong-target legacy records before downloading", async () => {
    for (const patch of [
      { version: "invalid" },
      { platform: "mac" as const },
      { url: "https://downloads.example.com/app_arm64.exe" },
      { url: "https://evil.example.com/app_x64.exe" },
    ]) {
      const { controller, deps } = setup({
        query: vi.fn(async () => ({ version: { ...release, hot: false, ...patch } })),
      });
      await controller.check();
      expect(controller.state).toMatchObject({ phase: "error", error: "validation" });
      expect(deps.download).not.toHaveBeenCalled();
    }
  });
  it("retries failed downloads, and never offers them for installation", async () => {
    const { controller, deps } = setup();
    vi.mocked(deps.download).mockRejectedValueOnce(new Error("checksum mismatch"));
    await controller.check();
    expect(controller.state).toMatchObject({ phase: "error", error: "download" });
    await controller.check();
    expect(controller.state.phase).toBe("downloaded");
  });
  it("ignores checks when unsupported or while installing", async () => {
    const { controller, deps } = setup({ enabled: false });
    await controller.check();
    expect(deps.query).not.toHaveBeenCalled();
    controller.set({ phase: "installing" });
    await controller.check();
    expect(deps.query).not.toHaveBeenCalled();
  });
  it("rejects wrong architectures, downgrades, prereleases and untrusted origins", () => {
    const { deps } = setup();
    for (const patch of [
      { arch: "arm64" },
      { version: "1.0.0" },
      { version: "1.1.0-beta.1" },
      { feedUrl: "https://evil.com/" },
      { url: "http://downloads.example.com/a.exe" },
    ]) {
      expect(() =>
        validateRelease({ ...release, ...patch } as DesktopRelease, deps),
      ).toThrow();
    }
  });
  it("requires matching manifests, safe filenames, hash and architecture", () => {
    const hash = Buffer.alloc(64).toString("base64");
    const info = {
      version: release.version,
      files: [{ url: "ABD_1.0.1_x64.exe", sha512: hash, size: 100 }],
    };
    expect(() =>
      validateUpdateManifest(info, release, ["https://downloads.example.com"]),
    ).not.toThrow();
    expect(() =>
      validateUpdateManifest(
        {
          ...info,
          files: [{ ...info.files[0], url: "ABD_1.0.1_arm64.exe" }, ...info.files],
        },
        release,
        ["https://downloads.example.com"],
      ),
    ).toThrow();
    for (const url of [
      "../escape_x64.exe",
      "https://evil.com/a_x64.exe",
      "a_arm64.exe",
      "%2e%2e%2fescape_x64.exe",
    ]) {
      expect(() =>
        validateUpdateManifest(
          { ...info, files: [{ ...info.files[0], url }] },
          release,
          ["https://downloads.example.com"],
        ),
      ).toThrow();
    }
    expect(() =>
      validateUpdateManifest({ ...info, version: "2.0.0" }, release, [
        "https://downloads.example.com",
      ]),
    ).toThrow();
  });
});

import { Platform } from "@abd-im/wasm-client-sdk";
import { describe, expect, it } from "vitest";

import { getApplicationPlatform, isNewerVersion } from "@/utils/applicationUpdate";

describe("application updates", () => {
  it("maps desktop SDK platforms to application platforms", () => {
    expect(getApplicationPlatform(Platform.Windows)).toBe("windows");
    expect(getApplicationPlatform(Platform.MacOSX)).toBe("mac");
    expect(getApplicationPlatform(Platform.Linux)).toBe("linux");
    expect(getApplicationPlatform(Platform.Web)).toBeUndefined();
  });

  it("compares numeric version segments", () => {
    expect(isNewerVersion("v1.10.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("1.0.1", "v1.0.0")).toBe(true);
    expect(isNewerVersion("1.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(false);
    expect(isNewerVersion("invalid", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "1.0.0-beta.1")).toBe(true);
    expect(isNewerVersion("1.0.0-beta.1", "1.0.0")).toBe(false);
  });
});

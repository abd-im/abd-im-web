const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { build, Platform, Arch } = require("electron-builder");
const { verifyDesktopRelease } = require("./verifyDesktopRelease.cjs");
const pkg = require("../package.json");

async function main() {
  const platform = process.argv[2];
  if (!["windows", "mac"].includes(platform))
    throw new Error("Expected windows or mac");
  if (process.platform !== (platform === "mac" ? "darwin" : "win32"))
    throw new Error("Build desktop releases on their target operating system");
  const { loadEnv } = await import("vite");
  Object.assign(process.env, loadEnv("production", process.cwd(), ""));
  const base = new URL(process.env.DESKTOP_UPDATE_BASE_URL);
  const arch = platform === "mac" ? "arm64" : "x64";
  if (platform === "mac") {
    const hasAppleId = [
      "APPLE_ID",
      "APPLE_APP_SPECIFIC_PASSWORD",
      "APPLE_TEAM_ID",
    ].every((key) => process.env[key]);
    const hasApiKey = ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"].every(
      (key) => process.env[key],
    );
    if (!hasAppleId && !hasApiKey && !process.env.APPLE_KEYCHAIN_PROFILE)
      throw new Error(
        "Apple notarization credentials are required for desktop releases",
      );
  }
  process.env.DESKTOP_RELEASE = "1";
  process.env.BUILD_TARGET = "electron";
  execFileSync(
    process.execPath,
    [path.resolve("node_modules/vite/bin/vite.js"), "build"],
    { stdio: "inherit" },
  );
  await build({
    targets: (platform === "mac" ? Platform.MAC : Platform.WINDOWS).createTarget(
      platform === "mac" ? ["dmg", "zip"] : ["nsis"],
      platform === "mac" ? Arch.arm64 : Arch.x64,
    ),
    config: {
      extends: path.resolve("electron-builder.json5"),
      forceCodeSigning: platform === "mac",
      publish: {
        provider: "generic",
        url: new URL(`${platform}/${arch}/${pkg.version}/`, base).href,
      },
      ...(platform === "mac" ? { mac: { notarize: true, hardenedRuntime: true } } : {}),
    },
    publish: "never",
  });
  await verifyDesktopRelease(
    path.resolve(`release/ABD-IM/${pkg.version}`),
    platform,
    arch,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

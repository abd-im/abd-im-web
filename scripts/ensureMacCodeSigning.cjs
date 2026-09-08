const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");

module.exports = async function ensureMacCodeSigning(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  if (process.env.DESKTOP_RELEASE === "1") {
    execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], {
      stdio: "inherit",
    });
    const signature = spawnSync("codesign", ["--display", "--verbose=4", appPath], {
      encoding: "utf8",
    });
    if (
      signature.status !== 0 ||
      !signature.stderr.includes("Authority=Developer ID Application:")
    )
      throw new Error("Desktop release requires a Developer ID Application signature");
    execFileSync("xcrun", ["stapler", "validate", appPath], { stdio: "inherit" });
    execFileSync("spctl", ["--assess", "--type", "execute", "--verbose=2", appPath], {
      stdio: "inherit",
    });
    return;
  }

  try {
    execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], {
      stdio: "ignore",
    });
    return;
  } catch {
    console.log(`[sign] Applying deep ad-hoc signature to ${appName}`);
  }

  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });
  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], {
    stdio: "inherit",
  });
};

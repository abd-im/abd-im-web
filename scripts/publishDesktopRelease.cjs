const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { verifyDesktopRelease } = require("./verifyDesktopRelease.cjs");

async function main() {
  const [directory, platform, arch] = process.argv.slice(2);
  const release = await verifyDesktopRelease(directory, platform, arch);
  const host = process.env.DESKTOP_UPLOAD_HOST || "";
  const root = process.env.DESKTOP_UPLOAD_ROOT || "/var/www/downloads/abd-im";
  if (
    !/^[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+$/.test(host) ||
    !/^\/[a-zA-Z0-9/_-]+$/.test(root)
  )
    throw new Error(
      "Configure DESKTOP_UPLOAD_HOST=user@host and a safe absolute DESKTOP_UPLOAD_ROOT",
    );
  const base = new URL(process.env.DESKTOP_UPDATE_BASE_URL || "");
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !base.pathname.endsWith("/")
  )
    throw new Error("Release base URL must be an HTTPS directory");
  const parent = `${root}/${platform}/${arch}`;
  const destination = `${parent}/${release.version}`;
  const staging = `${parent}/.upload-${randomUUID()}`;
  const ssh = (command) =>
    execFileSync(
      "ssh",
      ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", host, command],
      { stdio: "inherit" },
    );
  ssh(`test ! -e '${destination}' && mkdir -p '${staging}'`);
  execFileSync(
    "rsync",
    [
      "-a",
      "--protect-args",
      "-e",
      "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes",
      "--",
      ...release.files.map((file) => path.resolve(directory, file)),
      `${host}:${staging}/`,
    ],
    { stdio: "inherit" },
  );
  ssh(`test ! -e '${destination}' && mv -T '${staging}' '${destination}'`);
  const feedUrl = new URL(`${platform}/${arch}/${release.version}/`, base).href;
  console.log(
    `Uploaded ${platform}/${arch} ${
      release.version
    }. Register the version in the existing admin UI when ready to release. Installer URL: ${
      new URL(encodeURIComponent(release.installer), feedUrl).href
    }`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

const { createReadStream } = require("node:fs");
const { readFile, stat } = require("node:fs/promises");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { parse } = require("yaml");
const { valid, prerelease } = require("semver");

async function verifyDesktopRelease(directory, platform, arch) {
  if (
    !(
      (platform === "windows" && arch === "x64") ||
      (platform === "mac" && arch === "arm64")
    )
  )
    throw new Error("Unsupported release target");
  const manifestName = platform === "mac" ? "latest-mac.yml" : "latest.yml";
  const manifest = parse(await readFile(path.join(directory, manifestName), "utf8"));
  if (
    !valid(manifest.version) ||
    prerelease(manifest.version) ||
    !manifest.files?.length
  )
    throw new Error("Invalid release manifest");
  const files = [manifestName];
  let installer;
  for (const file of manifest.files) {
    const name = decodeURIComponent(file.url);
    if (path.basename(name) !== name || name.includes("\\") || name === "..")
      throw new Error("Artifact is outside the version directory");
    if (
      !(platform === "mac" ? [".zip", ".dmg"] : [".exe"]).some((extension) =>
        name.endsWith(`_${arch}${extension}`),
      )
    )
      throw new Error("Artifact does not match the release target");
    const filename = path.join(directory, name);
    const info = await stat(filename);
    if (!info.isFile() || info.size !== file.size)
      throw new Error(`Artifact size mismatch: ${name}`);
    const hash = createHash("sha512");
    for await (const chunk of createReadStream(filename)) hash.update(chunk);
    if (hash.digest("base64") !== file.sha512)
      throw new Error(`Artifact checksum mismatch: ${name}`);
    files.push(name);
    if (name.endsWith(`_${arch}${platform === "mac" ? ".dmg" : ".exe"}`))
      installer = name;
    try {
      if ((await stat(filename + ".blockmap")).isFile()) files.push(name + ".blockmap");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (
    !installer ||
    (platform === "mac" && !files.some((name) => name.endsWith("_arm64.zip")))
  )
    throw new Error("Missing architecture-specific installer");
  return { version: manifest.version, files, installer };
}
module.exports = { verifyDesktopRelease };
if (require.main === module) {
  verifyDesktopRelease(process.argv[2], process.argv[3], process.argv[4])
    .then((result) =>
      console.log(`Verified ${result.version}: ${result.files.length} release files`),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

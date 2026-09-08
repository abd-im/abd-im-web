const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { stringify } = require("yaml");
const { verifyDesktopRelease } = require("./verifyDesktopRelease.cjs");

test("release verification detects corrupt artifacts and wrong architectures", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "abd-release-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = "ABD_1.0.1_x64.exe";
  const data = Buffer.from("test installation artifact");
  const feed = {
    version: "1.0.1",
    files: [
      {
        url: filename,
        size: data.length,
        sha512: createHash("sha512").update(data).digest("base64"),
      },
    ],
  };
  await writeFile(path.join(dir, filename), data);
  await writeFile(path.join(dir, "latest.yml"), stringify(feed));
  assert.equal((await verifyDesktopRelease(dir, "windows", "x64")).installer, filename);
  await writeFile(path.join(dir, filename), Buffer.alloc(data.length));
  await assert.rejects(
    verifyDesktopRelease(dir, "windows", "x64"),
    /checksum mismatch/,
  );
  await assert.rejects(verifyDesktopRelease(dir, "windows", "arm64"), /Unsupported/);
});

test("release verification refuses traversal and missing Mac ZIP", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "abd-release-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(
    path.join(dir, "latest-mac.yml"),
    stringify({ version: "1.0.1", files: [{ url: "../a_arm64.zip" }] }),
  );
  await assert.rejects(verifyDesktopRelease(dir, "mac", "arm64"), /outside/);
  const data = Buffer.from("test disk image");
  const filename = "ABD_1.0.1_arm64.dmg";
  await writeFile(path.join(dir, filename), data);
  await writeFile(
    path.join(dir, "latest-mac.yml"),
    stringify({
      version: "1.0.1",
      files: [
        {
          url: filename,
          size: data.length,
          sha512: createHash("sha512").update(data).digest("base64"),
        },
      ],
    }),
  );
  await assert.rejects(
    verifyDesktopRelease(dir, "mac", "arm64"),
    /Missing architecture-specific installer/,
  );
});

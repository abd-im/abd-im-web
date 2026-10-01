import { _electron as electron, expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

test("real WASM caches cross-origin attachments once, reads after offline restart and isolates accounts", async () => {
  test.setTimeout(90000);
  const directory = await mkdtemp(join(tmpdir(), "abd-media-e2e-"));
  const profile = join(directory, "profile");
  await mkdir(profile);
  const sdk = resolve(dirname(require.resolve("@abd-im/wasm-client-sdk")), "..");
  const fixture = resolve("e2e/fixtures/media-cache/main.cjs");
  const host = join(directory, "storage.cjs");
  await build({
    entryPoints: ["electron/main/mediaStorage.ts"],
    outfile: host,
    platform: "node",
    format: "cjs",
    bundle: true,
  });
  const html = join(directory, "index.html");
  await writeFile(
    html,
    `<script src="${pathToFileURL(join(sdk, "assets/wasm_exec.js"))}"></script>
    <script type="module">
      import { getSDK } from ${JSON.stringify(
        pathToFileURL(join(sdk, "lib/index.es.js")).href,
      )};
      window.sdk = getSDK({ coreWasmPath: ${JSON.stringify(
        pathToFileURL(join(sdk, "assets/openIM.wasm")).href,
      )}, sqlWasmPath: ${JSON.stringify(
      pathToFileURL(join(sdk, "assets/sql-wasm.wasm")).href,
    )}, mediaStorage: window.mediaStorageHost, debug: false });
    </script>`,
  );
  const videoBytes = await readFile(resolve("e2e/fixtures/media-cache/clip.webm"));
  const imageBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=",
    "base64",
  );
  const partSize = 1 << 20;
  const streamBytes = Buffer.alloc(3 * partSize + 33);
  for (let i = 0; i < streamBytes.length; i++) streamBytes[i] = i % 251;
  const parts = new Map<number, number>();
  let releaseBackground!: () => void;
  const heldBackground = new Promise<void>((resolve) => {
    releaseBackground = resolve;
  });
  let backgroundStarted = false;
  let requests = 0;
  let slowRequests = 0;
  let thumbnails = 0;
  let originals = 0;
  const server = createServer(async (request, response) => {
    if (request.url === "/object/stream") {
      response.writeHead(302, { Location: "/signed/stream?token=test" }).end();
      return;
    }
    if (request.url === "/signed/stream?token=test") {
      const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range || "");
      if (!match) {
        response.writeHead(400).end();
        return;
      }
      const start = Number(match[1]),
        end = Number(match[2]);
      parts.set(start, (parts.get(start) || 0) + 1);
      if (start !== 0 && request.headers["if-match"] !== '"stream-version"') {
        response.writeHead(412).end();
        return;
      }
      if (start === partSize) {
        backgroundStarted = true;
        await heldBackground;
      }
      response
        .writeHead(206, {
          "Content-Type": "video/webm",
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${streamBytes.length}`,
          ETag: '"stream-version"',
        })
        .end(streamBytes.subarray(start, end + 1));
      return;
    }
    if (request.url?.startsWith("/object/")) {
      requests++;
      if (request.url.startsWith("/object/image")) {
        if (request.url === "/object/image?height=640&type=image&width=640")
          thumbnails++;
        else originals++;
        response.setHeader("Content-Type", "image/png");
        response.setHeader("Content-Length", String(imageBytes.length));
        response.end(imageBytes);
        return;
      }
      if (request.url.endsWith("/slow")) {
        slowRequests++;
        response.setHeader("Content-Length", "4096");
        response.write("partial");
        return;
      }
      if (request.url.endsWith("/video")) {
        response.setHeader("Content-Type", "video/webm");
        const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range || "");
        if (!match) {
          response.writeHead(400).end();
          return;
        }
        const start = Number(match[1]),
          end = Number(match[2]);
        response.setHeader("Content-Length", String(end - start + 1));
        response.setHeader(
          "Content-Range",
          `bytes ${start}-${end}/${videoBytes.length}`,
        );
        response.setHeader("ETag", '"video-version"');
        response.writeHead(206).end(videoBytes.subarray(start, end + 1));
        return;
      }
      response.setHeader("Content-Length", "11");
      response.end("hello cache");
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const apiAddr = `http://127.0.0.1:${address.port}`;
  const launch = async (account = "alice") => {
    const application = await electron.launch({
      args: ["--no-sandbox", fixture],
      env: {
        ...process.env,
        MEDIA_TEST_HOST: host,
        MEDIA_TEST_PROFILE: profile,
        MEDIA_TEST_HTML: html,
      },
    });
    const page = await application.firstWindow();
    page.on("pageerror", (error) => console.error(error));
    await page.waitForFunction(() => Boolean(Reflect.get(window, "sdk")));
    await page.evaluate(
      async ({ apiAddr, account }) => {
        const sdk = Reflect.get(window, "sdk");
        await sdk.login({
          userID: account,
          token: "test-token",
          platformID: 7,
          apiAddr,
          wsAddr: apiAddr.replace("http", "ws"),
          isLogStandardOutput: false,
        });
      },
      { apiAddr: apiAddr.replace("http:", "https:"), account },
    );
    return { application, page };
  };
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    running = await launch();
    const result = await running.page.evaluate(async (apiAddr) => {
      const sdk = Reflect.get(window, "sdk");
      const invoke = (name: string, ...args: string[]) =>
        Reflect.get(
          window,
          name,
        )(...args).then((raw: string) => {
          const result = JSON.parse(raw);
          if (result.errCode) throw new Error(raw);
          return result.data;
        });
      await invoke(
        "insertConversation",
        JSON.stringify({
          conversationID: "si_alice_bob",
          conversationType: 1,
          userID: "bob",
          showName: "Bob",
        }),
      );
      const message = {
        clientMsgID: "file",
        status: 2,
        contentType: 105,
        sessionType: 1,
        sendID: "bob",
        recvID: "alice",
        seq: 1,
        sendTime: 1,
        content: JSON.stringify({
          uuid: "attachment",
          fileName: "hello.txt",
          fileSize: 11,
          sourceUrl: apiAddr + "/object/attachment",
        }),
        attachedInfo: "{}",
      };
      await invoke(
        "batchInsertMessageList",
        "si_alice_bob",
        JSON.stringify([
          message,
          {
            ...message,
            clientMsgID: "private",
            seq: 2,
            attachedInfo: JSON.stringify({ isPrivateChat: true }),
          },
        ]),
      );
      const ref = {
        conversationID: "si_alice_bob",
        clientMsgID: "file",
        variant: "source",
      };
      const completed = await Promise.all([sdk.cacheMedia(ref), sdk.cacheMedia(ref)]);
      const file = (await sdk.openMedia(ref)).data;
      const response = await fetch(file.location, { headers: { Range: "bytes=6-10" } });
      const text = await response.text();
      const rejected = await sdk.cacheMedia({ ...ref, clientMsgID: "private" }).then(
        () => false,
        () => true,
      );
      await sdk.closeMedia(file.ref);
      return {
        states: completed.map(
          (result: { data: { state: string } }) => result.data.state,
        ),
        text,
        status: response.status,
        rejected,
      };
    }, apiAddr);
    expect(result).toEqual({
      states: ["completed", "completed"],
      text: "cache",
      status: 206,
      rejected: true,
    });
    expect(requests).toBe(1);
    const image = await running.page.evaluate(
      async ({ apiAddr, size }) => {
        const sdk = Reflect.get(window, "sdk");
        await Reflect.get(window, "batchInsertMessageList")(
          "si_alice_bob",
          JSON.stringify([
            {
              clientMsgID: "image",
              status: 2,
              contentType: 102,
              sessionType: 1,
              sendID: "bob",
              recvID: "alice",
              seq: 5,
              sendTime: 1,
              attachedInfo: "{}",
              content: JSON.stringify({
                sourcePicture: {
                  uuid: "image",
                  size,
                  width: 1,
                  height: 1,
                  type: "image/png",
                  url: apiAddr + "/object/image",
                },
                snapshotPicture: { width: 640, height: 640 },
              }),
            },
          ]),
        );
        const ref = {
          conversationID: "si_alice_bob",
          clientMsgID: "image",
          variant: "snapshot",
        };
        const thumbnail = (await sdk.cacheMedia(ref)).data;
        const original = (await sdk.getMedia({ ...ref, variant: "source" })).data;
        return {
          size: thumbnail.size,
          state: original.state,
          shared: thumbnail.key === original.key,
        };
      },
      { apiAddr, size: imageBytes.length },
    );
    expect(image).toEqual({ size: imageBytes.length, state: "idle", shared: false });
    expect(thumbnails).toBe(1);
    expect(originals).toBe(0);
    await running.page.evaluate(async () => {
      await Reflect.get(window, "sdk").cacheMedia({
        conversationID: "si_alice_bob",
        clientMsgID: "image",
        variant: "source",
      });
    });
    expect(originals).toBe(1);
    await running.page.evaluate(
      async ({ apiAddr, videoSize }) => {
        const sdk = Reflect.get(window, "sdk");
        const base = {
          status: 2,
          sessionType: 1,
          sendID: "bob",
          recvID: "alice",
          sendTime: 1,
          attachedInfo: "{}",
        };
        await Reflect.get(window, "batchInsertMessageList")(
          "si_alice_bob",
          JSON.stringify([
            {
              ...base,
              clientMsgID: "video",
              contentType: 104,
              seq: 3,
              content: JSON.stringify({
                videoUUID: "video",
                videoSize,
                videoType: "video/webm",
                videoUrl: apiAddr + "/object/video",
              }),
            },
            {
              ...base,
              clientMsgID: "slow",
              contentType: 105,
              seq: 4,
              content: JSON.stringify({
                uuid: "slow",
                fileSize: 4096,
                sourceUrl: apiAddr + "/object/slow",
              }),
            },
          ]),
        );
        const ref = {
          conversationID: "si_alice_bob",
          clientMsgID: "video",
          variant: "video",
        };
        await sdk.cacheMedia(ref);
        Reflect.set(
          window,
          "slowTransfer",
          sdk.cacheMedia({ ...ref, clientMsgID: "slow", variant: "source" }).then(
            () => "completed",
            () => "cancelled",
          ),
        );
      },
      { apiAddr, videoSize: videoBytes.length },
    );
    const streamed = await running.page.evaluate(
      async ({ apiAddr, size }) => {
        const sdk = Reflect.get(window, "sdk");
        await Reflect.get(window, "batchInsertMessageList")(
          "si_alice_bob",
          JSON.stringify([
            {
              clientMsgID: "stream",
              status: 2,
              contentType: 104,
              sessionType: 1,
              sendID: "bob",
              recvID: "alice",
              seq: 6,
              sendTime: 1,
              attachedInfo: "{}",
              content: JSON.stringify({
                videoUUID: "stream",
                videoSize: size,
                videoType: "video/webm",
                videoUrl: apiAddr + "/object/stream",
              }),
            },
          ]),
        );
        const ref = {
          conversationID: "si_alice_bob",
          clientMsgID: "stream",
          variant: "video",
        };
        const file = (
          await sdk.openMedia(ref).catch((reason: unknown) => {
            throw new Error(JSON.stringify(reason));
          })
        ).data;
        Reflect.set(window, "streamFile", file);
        Reflect.set(window, "streamTransfer", sdk.cacheMedia(ref));
        const response = await fetch(file.location, {
          headers: { Range: "bytes=19-41" },
        });
        return {
          status: response.status,
          bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
        };
      },
      { apiAddr, size: streamBytes.length },
    );
    expect(streamed).toEqual({
      status: 206,
      bytes: Array.from(streamBytes.subarray(19, 42)),
    });
    await expect.poll(() => backgroundStarted).toBe(true);
    // Seek must finish while background still waits for the middle part.
    const tails = await running.page.evaluate(async (offset) => {
      const file = Reflect.get(window, "streamFile");
      return Promise.all(
        [1, 2].map(async () => {
          const response = await fetch(file.location, {
            headers: { Range: `bytes=${offset}-` },
          });
          return {
            status: response.status,
            bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
          };
        }),
      );
    }, 3 * partSize);
    for (const tail of tails)
      expect(tail).toEqual({
        status: 206,
        bytes: Array.from(streamBytes.subarray(3 * partSize)),
      });
    expect(
      await running.page.evaluate(async () => {
        return Reflect.get(
          window,
          "mediaSaveForTest",
        )(Reflect.get(window, "streamFile").ref).then(
          () => false,
          () => true,
        );
      }),
    ).toBe(true);
    expect(parts.get(3 * partSize)).toBe(1);
    expect(parts.has(2 * partSize)).toBe(false);
    releaseBackground();
    await running.page.evaluate(async () => {
      const result = await Reflect.get(window, "streamTransfer");
      if (result.data.state !== "completed") throw new Error("Stream did not complete");
      await Reflect.get(
        window,
        "mediaSaveForTest",
      )(Reflect.get(window, "streamFile").ref);
      await Reflect.get(window, "sdk").closeMedia(
        Reflect.get(window, "streamFile").ref,
      );
    });
    expect([...parts.values()]).toEqual([1, 1, 1, 1]);
    expect(await readFile(join(profile, "saved-video"))).toEqual(streamBytes);
    await expect.poll(() => slowRequests).toBe(1);
    expect(
      await running.page.evaluate(async () => {
        const sdk = Reflect.get(window, "sdk");
        const ref = {
          conversationID: "si_alice_bob",
          clientMsgID: "slow",
          variant: "source",
        };
        const snapshot = (await sdk.getMedia(ref)).data;
        await sdk.cancelMedia(snapshot.key);
        return [
          await Reflect.get(window, "slowTransfer"),
          (await sdk.getMedia(ref)).data.state,
        ];
      }),
    ).toEqual(["cancelled", "cancelled"]);
    await running.application.close();
    running = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    running = await launch();
    const offlineTail = await running.page.evaluate(async (offset) => {
      const sdk = Reflect.get(window, "sdk");
      const file = (
        await sdk.openMedia({
          conversationID: "si_alice_bob",
          clientMsgID: "stream",
          variant: "video",
        })
      ).data;
      const response = await fetch(file.location, {
        headers: { Range: `bytes=${offset}-` },
      });
      const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
      await sdk.closeMedia(file.ref);
      return bytes;
    }, 3 * partSize);
    expect(offlineTail).toEqual(Array.from(streamBytes.subarray(3 * partSize)));
    const offlineImages = await running.page.evaluate(async () => {
      const sdk = Reflect.get(window, "sdk");
      const widths: number[] = [];
      for (const variant of ["snapshot", "source"]) {
        const ref = { conversationID: "si_alice_bob", clientMsgID: "image", variant };
        await sdk.cacheMedia(ref);
        const file = (await sdk.openMedia(ref)).data;
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Offline image decoding failed"));
          image.src = file.location;
        });
        widths.push(image.naturalWidth);
        await sdk.closeMedia(file.ref);
      }
      return widths;
    });
    expect(offlineImages).toEqual([1, 1]);
    const offline = await running.page.evaluate(async () => {
      const sdk = Reflect.get(window, "sdk");
      const ref = {
        conversationID: "si_alice_bob",
        clientMsgID: "file",
        variant: "source",
      };
      const state = (await sdk.cacheMedia(ref)).data.state;
      const file = (await sdk.openMedia(ref)).data;
      const text = await (await fetch(file.location)).text();
      const history = await sdk.findMessageList([
        { conversationID: ref.conversationID, clientMsgIDList: ["file"] },
      ]);
      const videoFile = (
        await sdk.openMedia({ ...ref, clientMsgID: "video", variant: "video" })
      ).data;
      const video = document.createElement("video");
      document.body.append(video);
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Local video decoding failed"));
        video.src = videoFile.location;
      });
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = 0.5;
      });
      const videoTime = video.currentTime;
      const retained = (await sdk.clearMediaCache()).data.bytes;
      video.removeAttribute("src");
      video.load();
      video.remove();
      await sdk.closeMedia(videoFile.ref);
      await sdk.closeMedia(file.ref);
      const revokedStatus = (await fetch(file.location)).status;
      return {
        state,
        text,
        retained,
        revokedStatus,
        videoTime,
        history: JSON.stringify(history.data),
      };
    });
    expect(offline).toMatchObject({
      state: "completed",
      text: "hello cache",
      retained: 11 + videoBytes.length,
      revokedStatus: 404,
      videoTime: 0.5,
    });
    expect(offline.history).toContain("hello.txt");
    await running.application.close();
    running = undefined;
    running = await launch("charlie");
    expect(
      await running.page.evaluate(
        async () => (await Reflect.get(window, "sdk").getMediaCacheUsage()).data.bytes,
      ),
    ).toBe(0);
  } finally {
    releaseBackground();
    await running?.application.close();
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const previewURL = `${
  process.env.ABD_UI_BASE_URL || "http://localhost:5180"
}/ui-preview.html`;
const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=";

for (const forwarded of [false, true]) {
  test(`desktop ${
    forwarded ? "forwarded " : ""
  }composite attachments load their existing URLs`, async ({ page }) => {
    const video = await readFile("e2e/fixtures/media-cache/clip.webm");
    await page.route("**/__fixtures/composite-compat/**", (route) => {
      const name = new URL(route.request().url()).pathname.split("/").pop();
      const body =
        name === "video"
          ? video
          : name === "image"
          ? Buffer.from(pixel, "base64")
          : Buffer.from("composite file preview");
      const range = route
        .request()
        .headers()
        .range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2]
        ? Math.min(Number(range[2]), body.length - 1)
        : body.length - 1;
      return route.fulfill({
        status: range ? 206 : 200,
        contentType:
          name === "video"
            ? "video/webm"
            : name === "image"
            ? "image/png"
            : "text/plain",
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
          ...(range ? { "Content-Range": `bytes ${start}-${end}/${body.length}` } : {}),
        },
        body: body.subarray(start, end + 1),
      });
    });
    await page.evaluate(
      async ({ forwarded, videoSize }) => {
        const sdkURL = "/src/layout/MainContentWrap.tsx";
        const storeURL = "/src/store/index.ts";
        const historyURL = "/src/pages/chat/queryChat/useHistoryMessageList.tsx";
        const { IMSDK } = await import(sdkURL);
        const { useConversationStore } = await import(storeURL);
        const { pushNewMessage } = await import(historyURL);
        const base = JSON.parse(
          useConversationStore.getState().conversationList[0].latestMsg,
        );
        Reflect.set(window, "electronAPI", { ipcInvoke: async () => null });
        const state = { cacheCalls: 0 };
        Reflect.set(window, "compositeCompatTest", state);
        const unavailable = async () => {
          state.cacheCalls++;
          throw new Error("Embedded attachment is not an independent database message");
        };
        IMSDK.getMedia = unavailable;
        IMSDK.cacheMedia = unavailable;
        IMSDK.openMedia = unavailable;
        const child = {
          ...base,
          status: 2,
          sessionType: forwarded ? 1 : 0,
          sendID: forwarded ? "original-sender" : "",
          recvID: forwarded ? "original-recipient" : "",
        };
        const url = (name: string) =>
          `${location.origin}/__fixtures/composite-compat/${name}`;
        const composite = {
          ...child,
          clientMsgID: "embedded-composite",
          contentType: 107,
          ex: JSON.stringify({ abdComposite: { version: 1 } }),
          mergeElem: {
            multiMessage: [
              {
                ...child,
                clientMsgID: "caption",
                contentType: 101,
                textElem: { content: "URL compatibility caption" },
              },
              {
                ...child,
                clientMsgID: "image",
                contentType: 102,
                pictureElem: {
                  sourcePicture: { width: 160, height: 120, url: url("image") },
                },
              },
              {
                ...child,
                clientMsgID: "video",
                contentType: 104,
                videoElem: {
                  videoUrl: url("video"),
                  videoSize,
                  videoType: "video/webm",
                  duration: 6,
                  snapshotUrl: url("image"),
                  snapshotWidth: 160,
                  snapshotHeight: 120,
                },
              },
              {
                ...child,
                clientMsgID: "file",
                contentType: 105,
                fileElem: {
                  fileName: "compat-notes.txt",
                  fileSize: 22,
                  sourceUrl: url("file"),
                },
              },
            ],
          },
        };
        pushNewMessage({
          ...base,
          clientMsgID: "composite-compat",
          contentType: 107,
          status: 2,
          ex: forwarded ? "" : composite.ex,
          mergeElem: forwarded
            ? { title: "Forwarded URL compatibility", multiMessage: [composite] }
            : composite.mergeElem,
        });
      },
      { forwarded, videoSize: video.length },
    );
    if (forwarded)
      await page.getByText("Forwarded URL compatibility", { exact: true }).click();
    const composite = page.getByTestId("composite-message");
    await expect(composite.getByText("URL compatibility caption")).toBeVisible();
    const thumbnail = composite.locator(".message-image img");
    await expect(thumbnail).toBeVisible();
    await expect
      .poll(() => thumbnail.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBe(1);
    await composite.locator(".message-image").click();
    const imageDialog = page.getByRole("dialog", { name: "图片", exact: true });
    const image = imageDialog.getByRole("img", { name: "图片", exact: true });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBe(1);
    await page.keyboard.press("Escape");
    await expect(imageDialog).toBeHidden();
    await composite.getByRole("button", { name: "视频", exact: true }).click();
    const player = page.locator(".video-preview-dialog video");
    await expect
      .poll(() => player.evaluate((node: HTMLVideoElement) => node.duration))
      .toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(player).toBeHidden();
    await composite.getByRole("button", { name: /compat-notes.txt/ }).click();
    const fileDialog = page.getByRole("dialog", {
      name: "compat-notes.txt",
      exact: true,
    });
    await expect(
      fileDialog.getByText("composite file preview", { exact: true }),
    ).toBeVisible();
    await expect(
      fileDialog.getByRole("link", { name: "下载文件", exact: true }),
    ).toHaveAttribute("href", /composite-compat\/file$/);
    expect(
      await page.evaluate(() => Reflect.get(window, "compositeCompatTest").cacheCalls),
    ).toBe(0);
  });
}

test("desktop image bubbles cache thumbnails and fetch originals only on preview", async ({
  page,
}) => {
  let thumbnails = 0;
  let originals = 0;
  let releaseOriginal = () => {};
  const originalReady = new Promise<void>((resolve) => {
    releaseOriginal = resolve;
  });
  await page.route("**/__fixtures/thumbnail", async (route) => {
    thumbnails++;
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(pixel, "base64"),
    });
  });
  await page.route("**/__fixtures/original", async (route) => {
    originals++;
    await originalReady;
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(pixel, "base64"),
    });
  });
  await page.evaluate(async () => {
    const sdkURL = "/src/layout/MainContentWrap.tsx";
    const storeURL = "/src/store/index.ts";
    const historyURL = "/src/pages/chat/queryChat/useHistoryMessageList.tsx";
    const { IMSDK } = await import(sdkURL);
    const { useConversationStore } = await import(storeURL);
    const { pushNewMessage } = await import(historyURL);
    const cached = new Map<string, Blob>();
    Reflect.set(window, "electronAPI", { ipcInvoke: async () => null });
    const snapshot = (variant: string) => ({
      key: variant,
      kind: "image",
      name: "image",
      size: -1,
      downloaded: 0,
      state: cached.has(variant) ? "completed" : "idle",
    });
    IMSDK.getMedia = async ({ variant }: { variant: string }) => ({
      data: snapshot(variant),
    });
    IMSDK.cacheMedia = async ({ variant }: { variant: string }) => {
      const response = await fetch(
        `/__fixtures/${variant === "snapshot" ? "thumbnail" : "original"}`,
      );
      cached.set(variant, await response.blob());
      return { data: snapshot(variant) };
    };
    IMSDK.openMedia = async ({ variant }: { variant: string }) => {
      const blob = cached.get(variant)!;
      const location = URL.createObjectURL(blob);
      return { data: { ref: location, location, size: blob.size, name: "image" } };
    };
    IMSDK.closeMedia = async (ref: string) => URL.revokeObjectURL(ref);
    const base = JSON.parse(
      useConversationStore.getState().conversationList[0].latestMsg,
    );
    pushNewMessage({
      ...base,
      clientMsgID: "thumbnail-test",
      contentType: 102,
      status: 2,
      seq: 100,
      sendTime: Date.now(),
      pictureElem: {
        sourcePicture: {
          uuid: "image",
          width: 640,
          height: 480,
          url: "/__fixtures/original",
        },
        snapshotPicture: { width: 640, height: 480 },
      },
    });
  });
  const bubble = page.locator("#chat_thumbnail-test .message-image img");
  await expect(bubble).toBeVisible();
  expect(await bubble.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(
    1,
  );
  expect(thumbnails).toBe(1);
  expect(originals).toBe(0);
  const thumbnailURL = await bubble.getAttribute("src");
  await page.locator("#chat_thumbnail-test .message-image").click();
  const dialog = page.getByRole("dialog", { name: "图片", exact: true });
  const preview = dialog.getByRole("img", { name: "图片", exact: true });
  await expect(preview).toBeVisible();
  await expect.poll(() => originals).toBe(1);
  await expect(preview).toHaveAttribute("src", thumbnailURL!);
  releaseOriginal();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(preview).not.toHaveAttribute("src", thumbnailURL!);
  await dialog.getByRole("button", { name: "放大", exact: true }).click();
  const canvas = dialog.locator(".image-viewer-transform");
  await expect
    .poll(() =>
      canvas.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a),
    )
    .toBeGreaterThan(1);
  await dialog.getByRole("button", { name: "向右旋转", exact: true }).click();
  await expect
    .poll(() =>
      preview.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).b),
    )
    .toBe(1);
  await page.screenshot({ path: test.info().outputPath("radix-image-preview.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#chat_thumbnail-test .message-image")).toBeFocused();
  await page.locator("#chat_thumbnail-test .message-image").click();
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).b),
    )
    .toBe(0);
  await expect
    .poll(() =>
      canvas.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a),
    )
    .toBe(1);
  expect(thumbnails).toBe(1);
  expect(originals).toBe(1);
});

test("image viewer keeps its viewport while loading and supports wheel, drag and double click", async ({
  page,
}) => {
  let dialogSize: { width: number; height: number } | undefined;
  for (const [name, width, height] of [
    ["wide", 2400, 600],
    ["tall", 400, 1800],
  ] as const) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#d8e8f6"/><path d="M0 0 L${width} ${height} M${width} 0 L0 ${height}" stroke="#426280" stroke-width="12"/><text x="50%" y="50%" text-anchor="middle" font-size="60" fill="#203b53">${name}</text></svg>`;
    let release = () => {};
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/__fixtures/${name}-thumbnail`, (route) =>
      route.fulfill({ contentType: "image/svg+xml", body: svg }),
    );
    await page.route(`**/__fixtures/${name}-original`, async (route) => {
      await ready;
      await route.fulfill({ contentType: "image/svg+xml", body: svg });
    });
    await page.evaluate(
      async ({ name, width, height }) => {
        const storeURL = "/src/store/index.ts";
        const historyURL = "/src/pages/chat/queryChat/useHistoryMessageList.tsx";
        const { useConversationStore } = await import(storeURL);
        const { pushNewMessage } = await import(historyURL);
        const base = JSON.parse(
          useConversationStore.getState().conversationList[0].latestMsg,
        );
        pushNewMessage({
          ...base,
          clientMsgID: `viewer-${name}`,
          contentType: 102,
          status: 2,
          seq: 100,
          sendTime: Date.now(),
          pictureElem: {
            sourcePicture: { width, height, url: `/__fixtures/${name}-original` },
            snapshotPicture: { width, height, url: `/__fixtures/${name}-thumbnail` },
          },
        });
      },
      { name, width, height },
    );
    const bubble = page.locator(`#chat_viewer-${name} .message-image`);
    await expect(bubble.locator("img")).toBeVisible();
    await bubble.click();
    const dialog = page.getByRole("dialog", { name: "图片", exact: true });
    await expect(dialog).toBeVisible();
    const before = await dialog.boundingBox();
    expect(before!.height).toBe(Math.min(900, page.viewportSize()!.height - 32));
    if (dialogSize) {
      expect(before!.width).toBe(dialogSize.width);
      expect(before!.height).toBe(dialogSize.height);
    }
    dialogSize = { width: before!.width, height: before!.height };
    await dialog.screenshot({ path: test.info().outputPath(`${name}-loading.png`) });
    release();
    const image = dialog.getByRole("img", { name: "图片", exact: true });
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate(
          (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
        ),
      )
      .toBe(true);
    expect(await dialog.boundingBox()).toEqual(before);
    const viewport = dialog.getByRole("region", { name: /图片查看区域/ });
    const canvas = dialog.locator(".image-viewer-transform");
    const transform = () =>
      canvas.evaluate((node) => {
        const matrix = new DOMMatrix(getComputedStyle(node).transform);
        return { scale: matrix.a, x: matrix.e, y: matrix.f };
      });
    const frame = (await viewport.boundingBox())!;
    const fitted = (await image.boundingBox())!;
    expect(fitted.width).toBeLessThanOrEqual(frame.width);
    expect(fitted.height).toBeLessThanOrEqual(frame.height);
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => (await transform()).scale).toBeGreaterThan(1);
    expect((await transform()).scale).toBeLessThanOrEqual(1.2);
    await page.mouse.wheel(0, -240);
    await expect.poll(async () => (await transform()).scale).toBeGreaterThan(1);
    const zoomed = await transform();
    await page.mouse.down();
    await page.mouse.move(
      frame.x + frame.width / 2 + 80,
      frame.y + frame.height / 2 + 40,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        name === "wide" ? (await transform()).x : (await transform()).y,
      )
      .not.toBe(name === "wide" ? zoomed.x : zoomed.y);
    for (let index = 0; index < 5; index++) {
      const previous = (await transform()).scale;
      await dialog.getByRole("button", { name: "放大", exact: true }).click();
      await expect
        .poll(async () => (await transform()).scale)
        .toBeGreaterThan(previous);
      expect((await transform()).scale).toBeLessThanOrEqual(8);
    }
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.mouse.down();
    await page.mouse.move(-1000, -1000, { steps: 8 });
    await page.mouse.up();
    const bounded = (await image.boundingBox())!;
    expect(bounded.x + bounded.width).toBeGreaterThan(frame.x);
    expect(bounded.y + bounded.height).toBeGreaterThan(frame.y);
    expect(bounded.x).toBeLessThan(frame.x + frame.width);
    expect(bounded.y).toBeLessThan(frame.y + frame.height);
    await dialog.getByRole("button", { name: "适应窗口", exact: true }).click();
    await expect.poll(async () => (await transform()).scale).toBe(1);
    await viewport.dblclick();
    await expect.poll(async () => (await transform()).scale).toBeGreaterThan(1);
    await dialog.getByRole("button", { name: "适应窗口", exact: true }).click();
    await expect.poll(async () => (await transform()).scale).toBe(1);
    await viewport.focus();
    await page.keyboard.press("+");
    await expect.poll(async () => (await transform()).scale).toBeGreaterThan(1);
    await page.keyboard.press("0");
    await expect.poll(async () => (await transform()).scale).toBe(1);
    await dialog.getByRole("button", { name: "向右旋转", exact: true }).click();
    const rotated = (await image.boundingBox())!;
    expect(rotated.width).toBeLessThanOrEqual(frame.width);
    expect(rotated.height).toBeLessThanOrEqual(frame.height);
    await expect
      .poll(async () => {
        const box = (await image.boundingBox())!;
        return (
          Math.abs(box.x + box.width / 2 - frame.x - frame.width / 2) +
          Math.abs(box.y + box.height / 2 - frame.y - frame.height / 2)
        );
      })
      .toBeLessThan(1);
    expect(await dialog.boundingBox()).toEqual(before);
    await dialog.screenshot({ path: test.info().outputPath(`${name}-rotated.png`) });
    if (name === "tall") {
      await dialog.getByRole("button", { name: "适应窗口", exact: true }).click();
      await page.setViewportSize({ width: 390, height: 640 });
      await expect.poll(async () => (await dialog.boundingBox())!.height).toBe(608);
      const mobile = (await viewport.boundingBox())!;
      const centerX = mobile.x + mobile.width / 2;
      const centerY = mobile.y + mobile.height / 2;
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 2,
      });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: centerX - 40, y: centerY, id: 1 },
          { x: centerX + 40, y: centerY, id: 2 },
        ],
      });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: centerX - 80, y: centerY, id: 1 },
          { x: centerX + 80, y: centerY, id: 2 },
        ],
      });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect.poll(async () => (await transform()).scale).toBeGreaterThan(1);
      await session.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await session.detach();
      await dialog.getByRole("button", { name: "适应窗口", exact: true }).click();
      await expect.poll(async () => (await transform()).scale).toBe(1);
      await dialog.screenshot({ path: test.info().outputPath("tall-mobile.png") });
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(bubble).toBeFocused();
  }
});

test("desktop video starts before caching completes and keeps the same playback source", async ({
  page,
}) => {
  const bytes = await readFile("e2e/fixtures/media-cache/clip.webm");
  let remoteRequests = 0;
  await page.route("**/__fixtures/local-video", (route) => {
    const range = route
      .request()
      .headers()
      .range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Number(range[2]) : bytes.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: "video/webm",
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` } : {}),
      },
      body: bytes.subarray(start, end + 1),
    });
  });
  await page.route("**/__fixtures/remote-video", (route) => {
    remoteRequests++;
    return route.abort();
  });
  await page.evaluate(async (pixel) => {
    const sdkURL = "/src/layout/MainContentWrap.tsx";
    const storeURL = "/src/store/index.ts";
    const historyURL = "/src/pages/chat/queryChat/useHistoryMessageList.tsx";
    const { IMSDK } = await import(sdkURL);
    const { useConversationStore } = await import(storeURL);
    const { pushNewMessage } = await import(historyURL);
    Reflect.set(window, "electronAPI", { ipcInvoke: async () => null });
    const state = {
      complete: false,
      opened: 0,
      cached: 0,
      closed: 0,
      open: () => {},
      finish: () => {},
    };
    Reflect.set(window, "videoCacheTest", state);
    const snapshot = (variant: string) => ({
      key: variant,
      kind: "video",
      name: "video",
      size: 100,
      downloaded: state.complete ? 100 : 20,
      state: variant === "snapshot" || state.complete ? "completed" : "idle",
    });
    IMSDK.getMedia = async ({ variant }: { variant: string }) => ({
      data: snapshot(variant),
    });
    IMSDK.openMedia = async ({ variant }: { variant: string }) => {
      if (variant === "video") {
        state.opened++;
        await new Promise<void>((resolve) => {
          state.open = resolve;
        });
      }
      return {
        data: {
          ref: variant,
          location:
            variant === "video"
              ? "/__fixtures/local-video"
              : `data:image/png;base64,${pixel}`,
          size: 100,
          name: "video",
        },
      };
    };
    IMSDK.cacheMedia = async ({ variant }: { variant: string }) => {
      state.cached++;
      await new Promise<void>((resolve) => {
        state.finish = resolve;
      });
      state.complete = true;
      return { data: snapshot(variant) };
    };
    IMSDK.closeMedia = async (ref: string) => {
      if (ref === "video") state.closed++;
    };
    const base = JSON.parse(
      useConversationStore.getState().conversationList[0].latestMsg,
    );
    pushNewMessage({
      ...base,
      clientMsgID: "stream-test",
      contentType: 104,
      status: 2,
      seq: 100,
      sendTime: Date.now(),
      videoElem: {
        videoUrl: "/__fixtures/remote-video",
        videoType: "video/webm",
        duration: 1,
        snapshotWidth: 320,
        snapshotHeight: 240,
      },
    });
  }, pixel);
  await page
    .locator("#chat_stream-test")
    .getByRole("button", { name: "视频", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "视频", exact: true });
  await expect(dialog).toBeVisible();
  const loadingFrame = await dialog.boundingBox();
  expect(loadingFrame!.height).toBe(Math.min(900, page.viewportSize()!.height - 32));
  await page.evaluate(() => Reflect.get(window, "videoCacheTest").open());
  const video = dialog.locator("video");
  await expect(video).toHaveAttribute("src", "/__fixtures/local-video");
  await expect(dialog.locator("media-controller")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("status")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState))
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.seekable.length))
    .toBeGreaterThan(0);
  await video.evaluate((element: HTMLVideoElement) => {
    element.pause();
  });
  const seek = dialog.locator("media-time-range").getByRole("slider");
  await seek.fill("0.5");
  await expect(video).toHaveJSProperty("currentTime", 0.5);
  expect(await dialog.boundingBox()).toEqual(loadingFrame);
  await dialog.locator("media-controller").hover();
  const play = dialog.locator("media-play-button");
  await play.click();
  await expect(video).toHaveJSProperty("paused", false);
  await play.click();
  await expect(video).toHaveJSProperty("paused", true);
  const mute = dialog.locator("media-mute-button");
  await mute.click();
  await expect(video).toHaveJSProperty("muted", true);
  await mute.click();
  await expect(video).toHaveJSProperty("muted", false);
  const volume = dialog.locator("media-volume-range").getByRole("slider");
  await volume.fill("0.5");
  await expect(video).toHaveJSProperty("volume", 0.5);
  await dialog.getByRole("button", { name: "进入全屏", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.tagName))
    .toBe("MEDIA-CONTROLLER");
  await dialog.getByRole("button", { name: "退出全屏", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  const playingElement = (await video.elementHandle())!;
  await page.evaluate(() => Reflect.get(window, "videoCacheTest").finish());
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "另存为" }),
  ).toBeVisible();
  expect(await dialog.boundingBox()).toEqual(loadingFrame);
  expect(await playingElement.evaluate((element) => element.isConnected)).toBe(true);
  await expect(video).toHaveAttribute("src", "/__fixtures/local-video");
  await dialog.screenshot({ path: test.info().outputPath("video-player.png") });
  await page.setViewportSize({ width: 390, height: 640 });
  await expect.poll(async () => (await dialog.boundingBox())!.height).toBe(608);
  await expect(volume).toBeHidden();
  const mobileFrame = (await dialog.boundingBox())!;
  const controls = (await dialog.locator("media-control-bar").boundingBox())!;
  expect(controls.x + controls.width).toBeLessThan(mobileFrame.x + mobileFrame.width);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const background = await dialog
    .locator("media-controller")
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  await expect(play).toHaveCSS("background-color", background);
  await dialog.screenshot({ path: test.info().outputPath("video-player-mobile.png") });
  expect(
    await page.evaluate(() => {
      const { opened, cached } = Reflect.get(window, "videoCacheTest");
      return { opened, cached };
    }),
  ).toEqual({ opened: 1, cached: 1 });
  expect(remoteRequests).toBe(0);
  await play.click();
  await expect(video).toHaveJSProperty("paused", false);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "videoCacheTest").closed))
    .toBe(1);
  await expect(dialog).toBeHidden();
  expect(await playingElement.evaluate((element) => element.paused)).toBe(true);
});

test.beforeEach(async ({ page }) => {
  await page.route("**/__fixtures/uploaded/**", async (route) => {
    const name = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").pop()!,
    );
    const bytes = await page.evaluate(
      (name) => Reflect.get(window, "attachmentTest").uploadedBodies[name],
      name,
    );
    await route.fulfill({
      contentType: name.endsWith(".png") ? "image/png" : "text/plain",
      body: Buffer.from(bytes),
    });
  });
  await page.goto(previewURL);
  await expect(page.locator(".ck-editor__editable")).toBeVisible();
  await page.evaluate(async () => {
    const sdkURL = "/src/layout/MainContentWrap.tsx";
    const storeURL = "/src/store/index.ts";
    const { IMSDK } = await import(sdkURL);
    const { useConversationStore } = await import(storeURL);
    const base = JSON.parse(
      useConversationStore.getState().conversationList[0].latestMsg,
    );
    const state = {
      prepared: [] as string[],
      uploaded: [] as string[],
      uploadedBodies: {} as Record<string, number[]>,
      failSend: false,
      sent: [] as Array<{ recvID: string; message: { clientMsgID: string } }>,
      fail: "",
      hold: false,
      release: () => {},
    };
    Reflect.set(window, "attachmentTest", state);
    let sequence = 0;
    const prepare = async (
      options: { file: File; sourceUrl: string; sourcePicture: object },
      image: boolean,
    ) => {
      state.prepared.push(options.file.name);
      if (state.fail === options.file.name) throw new Error("Preparation failed");
      if (state.hold)
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
      return {
        data: {
          ...base,
          clientMsgID: `attachment-${++sequence}`,
          contentType: image ? 102 : 105,
          ...(image
            ? { pictureElem: { sourcePicture: options.sourcePicture } }
            : {
                fileElem: {
                  fileName: options.file.name,
                  fileSize: options.file.size,
                  sourceUrl: options.sourceUrl,
                },
              }),
        },
      };
    };
    IMSDK.createFileMessageByFile = (options: Parameters<typeof prepare>[0]) =>
      prepare(options, false);
    IMSDK.createImageMessageByFile = (options: Parameters<typeof prepare>[0]) =>
      prepare(options, true);
    IMSDK.uploadFile = async ({ file, name }: { file: File; name: string }) => {
      state.uploaded.push(file.name);
      state.uploadedBodies[name] = Array.from(new Uint8Array(await file.arrayBuffer()));
      if (state.fail === file.name) throw new Error("Upload failed");
      if (state.hold)
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
      return {
        data: {
          url: `${location.origin}/__fixtures/uploaded/${encodeURIComponent(name)}`,
        },
      };
    };
    IMSDK.createImageMessageByURL = (options: {
      sourcePicture: object;
      bigPicture: object;
      snapshotPicture: object;
    }) =>
      Promise.resolve({
        data: {
          ...base,
          clientMsgID: `attachment-${++sequence}`,
          contentType: 102,
          pictureElem: options,
        },
      });
    IMSDK.createFileMessageByURL = (options: object) =>
      Promise.resolve({
        data: {
          ...base,
          clientMsgID: `attachment-${++sequence}`,
          contentType: 105,
          fileElem: options,
        },
      });
    IMSDK.createMergerMessage = (options: {
      messageList: object[];
      title: string;
      summaryList: string[];
    }) =>
      Promise.resolve({
        data: {
          ...base,
          clientMsgID: `combined-${++sequence}`,
          contentType: 107,
          mergeElem: {
            multiMessage: options.messageList,
            title: options.title,
            abstractList: options.summaryList,
          },
        },
      });
    IMSDK.createForwardMessage = (message: object) =>
      Promise.resolve({
        data: {
          ...message,
          clientMsgID: `forward-${++sequence}`,
        },
      });
    IMSDK.sendMessage = (params: {
      recvID: string;
      message: { clientMsgID: string };
    }) => {
      state.sent.push(params);
      if (state.failSend) return Promise.reject(new Error("Send failed"));
      return Promise.resolve({ data: { ...params.message, status: 2 } });
    };
  });
});

async function attach(page: Page, names: string[], event = "paste") {
  await page.locator(".ck-editor__editable").evaluate(
    (element, { names, event }) => {
      const transfer = new DataTransfer();
      for (const name of names) {
        const image = name.endsWith(".png");
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#d8e8f6";
        context.fillRect(0, 0, 320, 180);
        context.fillStyle = "#426280";
        context.font = "24px sans-serif";
        context.fillText("ABD IM", 110, 98);
        const content = image
          ? Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]), (char) =>
              char.charCodeAt(0),
            )
          : "local test file";
        transfer.items.add(
          new File([content], name, { type: image ? "image/png" : "text/plain" }),
        );
      }
      element.dispatchEvent(
        event === "paste"
          ? new ClipboardEvent("paste", {
              bubbles: true,
              cancelable: true,
              clipboardData: transfer,
            })
          : new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer: transfer,
            }),
      );
    },
    { names, event },
  );
}

async function sentCount(page: Page) {
  return page.evaluate(
    () => Reflect.get(window, "attachmentTest").sent.length as number,
  );
}

test("paste, drop and upload append inside the composer without sending or losing text", async ({
  page,
}) => {
  const editor = page.locator(".ck-editor__editable");
  await editor.fill("这是一起发送的说明文字");
  await attach(page, ["screenshot.png", "notes.txt"]);
  await attach(page, ["dropped.txt"], "drop");
  await page.locator('input[type="file"][accept="*"]').setInputFiles({
    name: "picked.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("picked"),
  });
  const attachments = page.getByRole("list", { name: "待发送附件" });
  await expect(attachments.getByRole("listitem")).toHaveCount(4);
  await expect(attachments.getByRole("img", { name: "screenshot.png" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, "attachmentTest").prepared),
  ).toEqual([]);
  expect(
    await page.evaluate(() => Reflect.get(window, "attachmentTest").uploaded),
  ).toEqual([]);
  expect(await sentCount(page)).toBe(0);
  await attachments.getByRole("button", { name: "移除 dropped.txt" }).click();
  await expect(attachments.getByRole("listitem")).toHaveCount(3);
  await expect(editor).toHaveText("这是一起发送的说明文字");
  await expect(page.getByRole("combobox", { name: "发送方式" })).toHaveValue(
    "combined",
  );
  await page.screenshot({
    path: test.info().outputPath("abd-37-inline-composer.png"),
    animations: "disabled",
  });
  for (const name of ["screenshot.png", "notes.txt", "picked.txt"]) {
    await attachments.getByRole("button", { name: `移除 ${name}` }).click();
  }
  await expect(attachments).toHaveCount(0);
  await expect(editor).toHaveText("这是一起发送的说明文字");
});

test("combined mode uploads all attachments then sends one message with one reply target", async ({
  page,
}) => {
  await page.locator(".ck-editor__editable").fill("一条图文消息");
  await attach(page, ["photo.png", "notes.txt"]);
  await page
    .getByRole("button", { name: "发送", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect.poll(() => sentCount(page)).toBe(1);
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
  await expect(page.locator(".ck-editor__editable")).toHaveText("");
  const sent = await page.evaluate(
    () => Reflect.get(window, "attachmentTest").sent[0].message,
  );
  expect(sent.contentType).toBe(107);
  expect(JSON.parse(sent.ex)).toEqual({ abdComposite: { version: 1 } });
  expect(sent.mergeElem.multiMessage).toHaveLength(3);
  expect(sent.mergeElem.multiMessage[0].textElem.content).toBe("一条图文消息");
  expect(sent.mergeElem.multiMessage[1].pictureElem.sourcePicture.url).toMatch(/^http/);
  expect(sent.mergeElem.multiMessage[2].fileElem.sourceUrl).toMatch(/^http/);
  const row = page.locator(`#chat_${sent.clientMsgID}`);
  await expect(row.getByTestId("composite-message")).toContainText("一条图文消息");
  await expect(row.getByTestId("composite-message")).toContainText("notes.txt");
  await expect(row.locator(".message-image img")).toBeVisible();
  await expect(row).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: test.info().outputPath("abd-37-combined-message.png"),
    animations: "disabled",
  });
  await row.getByTestId("composite-message").hover();
  await row.getByRole("button", { name: "回复", exact: true }).click();
  await expect(page.getByTestId("composer-reply")).toContainText("一条图文消息");
  const quote = await page.evaluate(async () => {
    const url = "/src/store/index.ts";
    return (await import(url)).useConversationStore.getState().quoteMessage.message;
  });
  expect(quote.clientMsgID).toBe(sent.clientMsgID);
  expect(quote.mergeElem.multiMessage).toHaveLength(3);
  await page.getByRole("button", { name: "取消 回复", exact: true }).click();
  await row.getByTestId("composite-message").hover();
  await row.getByRole("button", { name: "查看更多", exact: true }).click();
  await page.getByRole("menuitem", { name: "转发", exact: true }).click();
  const forwardDialog = page.getByRole("dialog", { name: "转发给" });
  await expect(forwardDialog).toContainText("1 条消息");
  await forwardDialog.getByRole("button", { name: /陈亦舟/ }).click();
  await forwardDialog.getByRole("button", { name: /确\s*认/ }).click();
  await expect.poll(() => sentCount(page)).toBe(2);
  const forwarded = await page.evaluate(
    () => Reflect.get(window, "attachmentTest").sent[1],
  );
  expect(forwarded.recvID).toBe("preview-chen");
  expect(forwarded.message.ex).toBe(sent.ex);
  expect(forwarded.message.mergeElem.multiMessage).toHaveLength(3);
});

test("consecutive combined images with the same file name use distinct URLs", async ({
  page,
}) => {
  const editor = page.locator(".ck-editor__editable");
  for (const text of ["第一张", "第二张"]) {
    await editor.fill(text);
    await attach(page, ["image.png"]);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect.poll(() => sentCount(page)).toBe(text === "第一张" ? 1 : 2);
  }

  const messages = await page.evaluate(() =>
    Reflect.get(window, "attachmentTest").sent.map(
      (item: {
        message: {
          clientMsgID: string;
          mergeElem: {
            multiMessage: Array<{
              contentType: number;
              pictureElem?: { sourcePicture: { url: string } };
            }>;
          };
        };
      }) => ({
        id: item.message.clientMsgID,
        url: item.message.mergeElem.multiMessage.find(
          (part) => part.contentType === 102,
        )?.pictureElem?.sourcePicture.url,
      }),
    ),
  );
  expect(messages[0].url).toBeTruthy();
  expect(messages[1].url).toBeTruthy();
  expect(messages[1].url).not.toBe(messages[0].url);
  await expect(
    page.locator(`#chat_${messages[0].id} .message-image img`),
  ).toHaveAttribute("src", messages[0].url!);
  await expect(
    page.locator(`#chat_${messages[1].id} .message-image img`),
  ).toHaveAttribute("src", messages[1].url!);
});

test("separate mode sends text and each attachment individually", async ({ page }) => {
  await page.locator(".ck-editor__editable").fill("分别发送的说明");
  await attach(page, ["first.txt", "second.png"]);
  await page.getByRole("combobox", { name: "发送方式" }).selectOption("separate");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => sentCount(page)).toBe(3);
  const types = await page.evaluate(() =>
    Reflect.get(window, "attachmentTest").sent.map(
      (item: { message: { contentType: number } }) => item.message.contentType,
    ),
  );
  expect(types).toEqual([101, 105, 102]);
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
  await expect(page.locator(".ck-editor__editable")).toHaveText("");
});

test("mentions clearly use separate sending and keep the native mention notification", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const sdkURL = "/src/layout/MainContentWrap.tsx";
    const storeURL = "/src/store/index.ts";
    const { IMSDK } = await import(sdkURL);
    const { useConversationStore } = await import(storeURL);
    const state = useConversationStore.getState();
    const member = {
      userID: "preview-lin",
      nickname: "林知夏",
      groupID: "preview-group",
      roleLevel: 20,
    };
    IMSDK.getGroupMemberList = IMSDK.searchGroupMembers = () =>
      Promise.resolve({ data: [member] });
    IMSDK.getSpecifiedGroupMembersInfo = () => Promise.resolve({ data: [member] });
    const base = JSON.parse(state.conversationList[0].latestMsg);
    IMSDK.createTextAtMessage = (params: {
      text: string;
      atUserIDList: string[];
      atUsersInfo: unknown[];
    }) =>
      Promise.resolve({
        data: {
          ...base,
          clientMsgID: "mention-with-attachment",
          contentType: 106,
          atTextElem: {
            text: params.text,
            atUserList: params.atUserIDList,
            atUsersInfo: params.atUsersInfo,
          },
        },
      });
    const conversation = {
      ...state.currentConversation,
      conversationType: 3,
      groupID: "preview-group",
    };
    useConversationStore.setState({
      currentConversation: conversation,
      conversationList: state.conversationList.map((item: { conversationID: string }) =>
        item.conversationID === conversation.conversationID ? conversation : item,
      ),
      conversationKinds: { ...state.conversationKinds, "preview-group": "chat" },
      currentGroupInfo: {
        groupID: "preview-group",
        groupName: "测试群",
        memberCount: 2,
      },
    });
  });
  await page.locator(".ck-editor__editable").pressSequentially("@林");
  await page
    .locator("[data-mention-picker]")
    .getByRole("option", { name: "林知夏" })
    .click();
  await attach(page, ["mention.txt"]);
  const mode = page.getByRole("combobox", { name: "发送方式" });
  await expect(mode).toHaveValue("separate");
  await expect(mode).toBeDisabled();
  await expect(page.locator(".composer-mention-hint")).toContainText(
    "确保对方收到提醒",
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => sentCount(page)).toBe(2);
  const sent = await page.evaluate(() => Reflect.get(window, "attachmentTest").sent);
  expect(sent[0].message.contentType).toBe(106);
  expect(sent[0].message.atTextElem.atUserList).toEqual(["preview-lin"]);
  expect(sent[1].message.contentType).toBe(105);
});

test("switching conversations preserves each attachment draft", async ({ page }) => {
  await page.locator(".ck-editor__editable").fill("原会话草稿");
  await attach(page, ["original.txt"], "drop");
  await page.evaluate(() => {
    location.hash = "/chat/preview-chat-1";
  });
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
  await attach(page, ["other.txt"]);
  await page.evaluate(() => {
    location.hash = "/chat/preview-chat-0";
  });
  await expect(page.getByRole("list", { name: "待发送附件" })).toContainText(
    "original.txt",
  );
  await expect(page.getByRole("list", { name: "待发送附件" })).not.toContainText(
    "other.txt",
  );
  await expect(page.locator(".ck-editor__editable")).toHaveText("原会话草稿");
  expect(await sentCount(page)).toBe(0);
});

test("an in-flight group keeps its recipient and does not clear the new conversation draft", async ({
  page,
}) => {
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").hold = true;
  });
  await page.locator(".ck-editor__editable").fill("原会话说明");
  await attach(page, ["original-recipient.txt"]);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "attachmentTest").uploaded.length),
    )
    .toBe(1);
  await page.evaluate(() => {
    location.hash = "/chat/preview-chat-1";
  });
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
  await page.locator(".ck-editor__editable").fill("新会话说明");
  await attach(page, ["new-conversation.txt"]);
  await page.evaluate(() => Reflect.get(window, "attachmentTest").release());
  await expect.poll(() => sentCount(page)).toBe(1);
  expect(
    await page.evaluate(() => Reflect.get(window, "attachmentTest").sent[0].recvID),
  ).toBe("preview-lin");
  await expect(page.locator("#chat-list")).not.toContainText("original-recipient.txt");
  await expect(page.getByRole("list", { name: "待发送附件" })).toContainText(
    "new-conversation.txt",
  );
  await expect(page.locator(".ck-editor__editable")).toHaveText("新会话说明");
});

test("returning to an uploading conversation clears its remounted editor when sent", async ({
  page,
}) => {
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").hold = true;
  });
  await page.locator(".ck-editor__editable").fill("上传中切换会话");
  await attach(page, ["pending.txt"]);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "attachmentTest").uploaded.length),
    )
    .toBe(1);
  await page.evaluate(() => {
    location.hash = "/chat/preview-chat-1";
  });
  await expect(page.locator(".ck-editor__editable")).toHaveText("");
  await page.evaluate(() => {
    location.hash = "/chat/preview-chat-0";
  });
  await expect(page.locator(".ck-editor__editable")).toHaveText("上传中切换会话");
  await expect(page.locator(".ck-editor__editable")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await page.evaluate(() => Reflect.get(window, "attachmentTest").release());
  await expect.poll(() => sentCount(page)).toBe(1);
  await expect(page.locator(".ck-editor__editable")).toHaveText("");
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
});

test("failed grouped transmission retries the same message without uploading again", async ({
  page,
}) => {
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").failSend = true;
  });
  await page.locator(".ck-editor__editable").fill("图文消息重试");
  await attach(page, ["retry-group.txt"]);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => sentCount(page)).toBe(1);
  const id = await page.evaluate(
    () => Reflect.get(window, "attachmentTest").sent[0].message.clientMsgID,
  );
  const retry = page
    .locator(`#chat_${id}`)
    .getByRole("button", { name: "重试", exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").failSend = false;
  });
  await retry.click();
  await expect.poll(() => sentCount(page)).toBe(2);
  await expect(retry).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, "attachmentTest").uploaded),
  ).toEqual(["retry-group.txt"]);
  expect(
    await page.evaluate(
      () => Reflect.get(window, "attachmentTest").sent[1].message.clientMsgID,
    ),
  ).toBe(id);
});

test("group preparation failure retains the full draft and reuses completed uploads on retry", async ({
  page,
}) => {
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").fail = "retry.txt";
  });
  await page.locator(".ck-editor__editable").fill("失败时保留文字");
  await attach(page, ["success.txt", "retry.txt"]);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "attachmentTest").uploaded.length),
    )
    .toBe(2);
  await expect(page.getByRole("button", { name: "发送", exact: true })).toBeEnabled();
  await expect(
    page.getByRole("list", { name: "待发送附件" }).getByRole("listitem"),
  ).toHaveCount(2);
  await expect(page.locator(".ck-editor__editable")).toHaveText("失败时保留文字");
  expect(await sentCount(page)).toBe(0);
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").fail = "";
  });
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => sentCount(page)).toBe(1);
  expect(
    await page.evaluate(() => Reflect.get(window, "attachmentTest").uploaded),
  ).toEqual(["success.txt", "retry.txt", "retry.txt"]);
});

test("separate preparation failure keeps unattempted files and never repeats successful messages", async ({
  page,
}) => {
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").fail = "retry.txt";
  });
  await attach(page, ["success.txt", "retry.txt", "last.txt"]);
  await page.getByRole("combobox", { name: "发送方式" }).selectOption("separate");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "待发送附件" }).getByRole("listitem"),
  ).toHaveCount(2);
  expect(await sentCount(page)).toBe(1);
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").fail = "";
  });
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => sentCount(page)).toBe(3);
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
});

test("pending attachments and uploads block desktop update installation", async ({
  page,
}) => {
  await attach(page, ["pending.txt"]);
  const exitStatus = () =>
    page.evaluate(async () => {
      const url = "/src/utils/desktopTasks.ts";
      return (await import(url)).prepareDesktopExit();
    });
  expect(await exitStatus()).toBe("busy");
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").hold = true;
  });
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "attachmentTest").prepared.length),
    )
    .toBe(1);
  expect(await exitStatus()).toBe("busy");
  await page.evaluate(() => Reflect.get(window, "attachmentTest").release());
  await expect.poll(() => sentCount(page)).toBe(1);
  await expect.poll(exitStatus).toBe("ready");
});

async function addFileMessage(page: Page, name: string, size = 128) {
  await page.evaluate(
    async ({ name, size }) => {
      const storeURL = "/src/store/index.ts";
      const historyURL = "/src/pages/chat/queryChat/useHistoryMessageList.tsx";
      const { useConversationStore } = await import(storeURL);
      const { pushNewMessage } = await import(historyURL);
      const base = JSON.parse(
        useConversationStore.getState().conversationList[0].latestMsg,
      );
      pushNewMessage({
        ...base,
        clientMsgID: "file-preview-test",
        contentType: 105,
        seq: 100,
        sendTime: Date.now(),
        fileElem: {
          fileName: name,
          fileSize: size,
          sourceUrl: `${location.origin}/__fixtures/preview`,
        },
      });
    },
    { name, size },
  );
  await page
    .locator("#chat_file-preview-test")
    .getByRole("button", { name: new RegExp(name.replace(/\./g, "\\.")) })
    .click();
}

test("Radix history supports keyboard tabs and returns from nested file previews", async ({
  page,
}) => {
  await page.route("**/__fixtures/history-file", (route) =>
    route.fulfill({ contentType: "text/markdown", body: "# 历史文件" }),
  );
  await page.evaluate(async () => {
    const sdkURL = "/src/layout/MainContentWrap.tsx";
    const storeURL = "/src/store/index.ts";
    const { IMSDK } = await import(sdkURL);
    const { useConversationStore } = await import(storeURL);
    const base = JSON.parse(
      useConversationStore.getState().conversationList[0].latestMsg,
    );
    const state = { types: [] as number[], release: () => {} };
    const ready = new Promise<void>((resolve) => {
      state.release = resolve;
    });
    Reflect.set(window, "historyMigration", state);
    IMSDK.searchLocalMessages = async ({
      messageTypeList,
    }: {
      messageTypeList: number[];
    }) => {
      const type = messageTypeList[0];
      state.types.push(type);
      await ready;
      const messageList =
        type === 101
          ? [
              { ...base, textElem: { content: "Radix 历史消息" } },
              {
                ...base,
                clientMsgID: "private",
                textElem: { content: "private history" },
                attachedInfoElem: { isPrivateChat: true },
              },
            ]
          : type === 105
          ? [
              {
                ...base,
                clientMsgID: "history-file",
                contentType: type,
                fileElem: {
                  fileName: "README.md",
                  fileSize: 100,
                  sourceUrl: `${location.origin}/__fixtures/history-file`,
                },
              },
            ]
          : [];
      return { data: { searchResultItems: [{ messageList }] } };
    };
  });
  const opener = page.getByRole("button", { name: "聊天记录", exact: true });
  await opener.click();
  const history = page.getByRole("dialog", { name: "聊天记录", exact: true });
  await expect(history.getByRole("status")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "historyMigration").types))
    .toEqual([101, 102, 104, 105]);
  await page.evaluate(() => Reflect.get(window, "historyMigration").release());
  await expect(history.getByText("Radix 历史消息", { exact: true })).toBeVisible();
  await expect(history.getByText("private history")).toHaveCount(0);
  await history.getByRole("tab").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(history.getByRole("tab").nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(history.getByText("暂无结果", { exact: true })).toBeVisible();
  await history.getByRole("tab", { name: "文件", exact: true }).click();
  const file = history.getByRole("button", { name: /README\.md/ });
  await file.click();
  const preview = page.getByRole("dialog", { name: "README.md", exact: true });
  await expect(
    preview.getByRole("heading", { name: "历史文件", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await expect(history).toBeVisible();
  await expect(file).toBeFocused();
  await page.setViewportSize({ width: 390, height: 640 });
  const box = await history.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await history.screenshot({
    path: test.info().outputPath("radix-history-mobile.png"),
  });
  await page.keyboard.press("Escape");
  await expect(history).toBeHidden();
  await expect(opener).toBeFocused();
});

test("Markdown files preview formatted content and safe links inside the app", async ({
  page,
}) => {
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/__fixtures/preview", async (route) => {
    await ready;
    await route.fulfill({
      contentType: "text/markdown",
      body: [
        "# 文件预览",
        "| 项目 | 状态 | 路径 |\n| --- | --- | --- |\n| ABD-35 | 完成 | src/pages/chat/queryChat/MessageItem/FilePreviewModal.tsx |",
        "- [x] 已预览",
        "~~旧内容~~ [链接](https://example.com)",
        "> Markdown 文件预览",
        "```ts\nconst answer = 42;\n```",
        "[run](javascript:alert%281%29) [local](file:///etc/passwd) [relative](../settings) ![bad](data:image/svg+xml,test)",
        "<script>window.previewInjected = true</script>",
        "\n\n## 后续内容\n\n这是较长的 Markdown 文档，滚动只发生在正文区域。".repeat(
          12,
        ),
      ].join("\n\n"),
    });
  });
  await addFileMessage(page, "README.md");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("status")).toBeVisible();
  const loadingFrame = await dialog.boundingBox();
  expect(loadingFrame!.height).toBe(Math.min(900, page.viewportSize()!.height - 32));
  const download = dialog.getByRole("link", { name: "下载文件" });
  const footerFrame = await download.boundingBox();
  release();
  await expect(dialog.getByRole("heading", { name: "文件预览" })).toBeVisible();
  expect(await dialog.boundingBox()).toEqual(loadingFrame);
  expect(await download.boundingBox()).toEqual(footerFrame);
  const viewport = dialog.getByTestId("file-preview-content");
  expect(await viewport.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(
    true,
  );
  await viewport.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  expect(await download.boundingBox()).toEqual(footerFrame);
  expect(await dialog.boundingBox()).toEqual(loadingFrame);
  await viewport.evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(dialog.getByRole("table")).toContainText("ABD-35");
  await expect(dialog.getByRole("checkbox")).toBeChecked();
  await expect(dialog.locator("del")).toHaveText("旧内容");
  const markdown = dialog.locator(".typeset");
  const headingSize = await dialog
    .getByRole("heading", { name: "文件预览" })
    .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  const bodySize = await markdown.evaluate((node) =>
    parseFloat(getComputedStyle(node).fontSize),
  );
  expect(headingSize).toBeGreaterThan(bodySize);
  const code = markdown.locator("pre");
  await expect(code).toContainText("const answer = 42;");
  await expect(code).toHaveCSS("overflow-x", "auto");
  await expect(code).toHaveCSS("font-family", /monospace/);
  await expect(markdown.locator("blockquote")).toHaveCSS(
    "border-inline-start-width",
    "2px",
  );
  await expect(
    dialog.locator(
      'a[href^="javascript:"], a[href^="file:"], a[href="../settings"], img[src^="data:"]',
    ),
  ).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "链接", exact: true })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  await expect(dialog.getByRole("link", { name: "链接", exact: true })).toHaveAttribute(
    "target",
    "_blank",
  );
  expect(
    await page.evaluate(() => Reflect.get(window, "previewInjected")),
  ).toBeUndefined();
  await expect(dialog.getByRole("link", { name: "下载文件" })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("abd-35-markdown-preview.png"),
    animations: "disabled",
  });
  const lightText = await markdown.evaluate((node) => getComputedStyle(node).color);
  const lightCode = await code.evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  );
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(markdown).not.toHaveCSS("color", lightText);
  await expect(code).not.toHaveCSS("background-color", lightCode);
  await page.setViewportSize({ width: 390, height: 700 });
  await expect.poll(async () => (await dialog.boundingBox())!.height).toBe(668);
  const tableScroll = markdown.locator(".typeset-scroll");
  await expect(tableScroll).toHaveCSS("overflow-x", "auto");
  await expect
    .poll(() => tableScroll.evaluate((node) => node.scrollWidth > node.clientWidth))
    .toBe(true);
  const frame = (await dialog.boundingBox())!;
  const content = (await markdown.boundingBox())!;
  expect(content.x + content.width).toBeLessThan(frame.x + frame.width);
  await dialog.screenshot({
    path: test.info().outputPath("markdown-preview-dark-mobile.png"),
    animations: "disabled",
  });
});

test("HTML files are displayed as text and never executed", async ({ page }) => {
  await page.route("**/__fixtures/preview", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Untrusted HTML</h1><script>window.previewInjected = true</script>",
    }),
  );
  await addFileMessage(page, "example.html");
  await expect(page.getByRole("dialog").locator("pre")).toContainText(
    "<h1>Untrusted HTML</h1>",
  );
  expect(
    await page.evaluate(() => Reflect.get(window, "previewInjected")),
  ).toBeUndefined();
});

test("failed previews can retry, while unsupported and oversized files offer downloads", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/__fixtures/preview", (route) =>
    route.fulfill(
      ++attempts === 1
        ? { status: 500, body: "failed" }
        : { contentType: "text/plain", body: "预览已恢复" },
    ),
  );
  await addFileMessage(page, "retry.txt");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("预览加载失败");
  const errorFrame = await dialog.boundingBox();
  expect(errorFrame!.height).toBe(Math.min(900, page.viewportSize()!.height - 32));
  await dialog.getByRole("button", { name: "重新加载" }).click();
  await expect(dialog.locator("pre")).toHaveText("预览已恢复");
  expect(await dialog.boundingBox()).toEqual(errorFrame);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
});

for (const [name, size, expected] of [
  ["archive.zip", 1024, "暂不支持"],
  ["huge.md", 3 * 1024 * 1024, "文件超过 2 MB"],
] as const) {
  test(`${name} shows a download fallback without fetching content`, async ({
    page,
  }) => {
    let requests = 0;
    await page.route("**/__fixtures/preview", (route) => {
      requests++;
      return route.abort();
    });
    await addFileMessage(page, name, size);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(expected);
    await expect(dialog.getByRole("link", { name: "下载文件" })).toBeVisible();
    expect(requests).toBe(0);
  });
}

test("image files preview without opening a new window", async ({ page }) => {
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/__fixtures/preview", async (route) => {
    await ready;
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(pixel, "base64"),
    });
  });
  await addFileMessage(page, "photo.png");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("status")).toBeVisible();
  const before = await dialog.boundingBox();
  expect(before!.height).toBe(Math.min(900, page.viewportSize()!.height - 32));
  release();
  const image = dialog.getByRole("img", { name: "photo.png" });
  await expect(image).toBeVisible();
  expect(await dialog.boundingBox()).toEqual(before);
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  expect(page.context().pages()).toHaveLength(1);
});

test("PDF files render a page inside the app instead of navigating away", async ({
  page,
}) => {
  const content = "BT /F1 24 Tf 50 150 Td (ABD-35 PDF preview) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 7\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await page.route("**/__fixtures/preview", (route) =>
    route.fulfill({ contentType: "application/octet-stream", body: pdf }),
  );
  await addFileMessage(page, "document.pdf", pdf.length);
  const canvas = page.getByRole("dialog").locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("dialog").locator('[aria-busy="false"]')).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("第 1 / 2 页");
  const hasInk = await canvas.evaluate((element: HTMLCanvasElement) => {
    const pixels = element
      .getContext("2d")!
      .getImageData(0, 0, element.width, element.height).data;
    return pixels.some((value, index) => index % 4 !== 3 && value < 100);
  });
  expect(hasInk).toBe(true);
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByRole("dialog")).toContainText("第 2 / 2 页");
  await expect(page.getByRole("dialog").locator('[aria-busy="false"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "下一页" })).toBeDisabled();
  await page.getByRole("button", { name: "上一页" }).click();
  await expect(page.getByRole("dialog")).toContainText("第 1 / 2 页");
  await expect(page.getByRole("dialog").locator('[aria-busy="false"]')).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("abd-35-pdf-preview.png"),
    animations: "disabled",
  });
  expect(page.url()).toContain("/ui-preview.html");
});

test("unconfirmed attachments prevent an update restart until cancelled", async ({
  page,
}) => {
  await attach(page, ["pending.txt"]);
  await expect(page.getByRole("list", { name: "待发送附件" })).toBeVisible();
  const prepare = () =>
    page.evaluate(async () => {
      const tasksURL = "/src/utils/desktopTasks.ts";
      return (await import(tasksURL)).prepareDesktopExit();
    });
  expect(await prepare()).toBe("busy");
  await page.getByRole("button", { name: "移除 pending.txt" }).click();
  expect(await prepare()).toBe("ready");
});

test("invalid PDF content shows a recoverable error and retains the download", async ({
  page,
}) => {
  await page.route("**/__fixtures/preview", (route) =>
    route.fulfill({ contentType: "application/pdf", body: "not a PDF" }),
  );
  await addFileMessage(page, "invalid.pdf");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("预览加载失败");
  await expect(dialog.getByRole("button", { name: "重新加载" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "下载文件" })).toBeVisible();
});

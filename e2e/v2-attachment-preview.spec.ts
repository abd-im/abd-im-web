import { expect, test } from "@playwright/test";

const previewURL = `${
  process.env.ABD_UI_BASE_URL || "http://localhost:7788"
}/ui-preview.html#/chat/preview-components`;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(previewURL);
  await expect(page.getByText("设计交付包", { exact: true })).toBeVisible();
});

test("combined files open distinct PDF, Markdown and text previews without downloading", async ({
  page,
}) => {
  let downloads = 0;
  page.on("download", () => {
    downloads++;
  });
  const card = page
    .locator("[data-chat-message-row]")
    .filter({ hasText: "设计交付包" });
  await card.getByRole("button", { name: /^设计交付.pdf/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("canvas")).toBeVisible();
  await expect(dialog.locator('[aria-busy="false"]')).toBeVisible();
  await expect(dialog).toContainText("第 1 / 1 页");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await card.getByRole("button", { name: /^review-notes.md/ }).click();
  await expect(
    dialog.getByRole("heading", { name: "产品评审", exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText("消息搜索");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await card.getByRole("button", { name: /^manifest.json/ }).click();
  await expect(dialog.locator("pre")).toContainText('"version": "2.4"');
  expect(downloads).toBe(0);
  expect(page.context().pages()).toHaveLength(1);
});

test("desktop combined attachments pass distinct IDs to the cache and preview cached content", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
    const { useConversationStore } = await import("/src/store/index.ts");
    const { pushNewMessage } = await import(
      "/src/pages/chat/queryChat/useHistoryMessageList.tsx"
    );
    const base = JSON.parse(
      useConversationStore.getState().conversationList[0].latestMsg,
    );
    const image =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=";
    const locations: Record<string, string> = {
      first: URL.createObjectURL(
        new Blob(["# First cached file"], { type: "text/markdown" }),
      ),
      second: URL.createObjectURL(
        new Blob(["# Second cached file"], { type: "text/markdown" }),
      ),
      image,
      "video:poster": image,
      video: `${location.origin}/e2e/fixtures/media-cache/clip.webm`,
      audio: `${location.origin}/src/assets/audio/newMsg.mp3`,
    };
    const calls: { clientMsgID: string; attachmentID?: string; variant: string }[] = [];
    Reflect.set(window, "v2CacheRefs", calls);
    Reflect.set(window, "electronAPI", { ipcInvoke: async () => null });
    const snapshot = (ref: { attachmentID?: string; variant: string }) => ({
      key: `${ref.attachmentID}:${ref.variant}`,
      kind: "file",
      name: "attachment",
      size: 1,
      downloaded: 0,
      state: "idle",
    });
    IMSDK.getMedia = async (ref) => {
      calls.push(ref);
      return { data: snapshot(ref) };
    };
    IMSDK.cacheMedia = async (ref) => ({
      data: { ...snapshot(ref), state: "completed" },
    });
    IMSDK.openMedia = async (ref) => ({
      data: {
        ref: `${ref.attachmentID}:${ref.variant}`,
        location:
          locations[
            ref.attachmentID === "video" && ref.variant === "snapshot"
              ? "video:poster"
              : ref.attachmentID!
          ],
        size: 1,
      },
    });
    IMSDK.closeMedia = async () => ({ data: null });
    const attachment = (id: string, filename: string, content_type: string) => ({
      id,
      filename,
      content_type,
      size: 1,
      url: `${location.origin}/object/${id}`,
    });
    pushNewMessage({
      ...base,
      clientMsgID: "v2-cache-integration",
      contentType: 144,
      status: 2,
      message: {
        flags: 32768,
        components: [
          { type: 10, content: "Cache integration attachments" },
          { type: 13, file: { url: "attachment://same.md", attachment_id: "first" } },
          { type: 13, file: { url: "attachment://same.md", attachment_id: "second" } },
          {
            type: 12,
            items: [
              {
                media: { url: "attachment://image.png", attachment_id: "image" },
                description: "Cached image",
              },
              {
                media: { url: "attachment://clip.webm", attachment_id: "video" },
                description: "Cached video",
              },
            ],
          },
          { type: 13, file: { url: "attachment://audio.mp3", attachment_id: "audio" } },
        ],
        attachments: [
          attachment("first", "same.md", "text/markdown"),
          attachment("second", "same.md", "text/markdown"),
          { ...attachment("image", "image.png", "image/png"), width: 1, height: 1 },
          attachment("video", "clip.webm", "video/webm"),
          {
            ...attachment("video:poster", "poster.png", "image/png"),
            width: 1,
            height: 1,
          },
          attachment("audio", "audio.mp3", "audio/mpeg"),
        ],
      },
    });
  });
  const row = page
    .locator("[data-chat-message-row]")
    .filter({ hasText: "Cache integration attachments" });
  const files = row.getByRole("button", { name: /^same.md/ });
  await files.nth(0).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "First cached file", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await files.nth(1).click();
  await expect(
    dialog.getByRole("heading", { name: "Second cached file", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: "Cached image", exact: true }).click();
  await expect(
    dialog.getByRole("img", { name: "Cached image", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const video = row.getByRole("button", { name: "Cached video", exact: true });
  await expect(video.locator("img")).toBeVisible();
  await expect(video.locator("img")).toHaveJSProperty("naturalWidth", 1);
  await video.click();
  await expect
    .poll(() => dialog.locator("video").evaluate((video) => video.readyState))
    .toBeGreaterThanOrEqual(1);
  await page.keyboard.press("Escape");
  await row.locator("media-controller[audio] media-play-button").click();
  await expect
    .poll(() => row.locator("audio").evaluate((audio) => audio.paused))
    .toBe(false);
  const refs = await page.evaluate(() =>
    Reflect.get(window, "v2CacheRefs").filter(
      (ref: { clientMsgID: string }) => ref.clientMsgID === "v2-cache-integration",
    ),
  );
  expect(
    refs.map(
      (ref: { attachmentID: string; variant: string }) =>
        `${ref.attachmentID}:${ref.variant}`,
    ),
  ).toEqual(
    expect.arrayContaining([
      "first:source",
      "second:source",
      "image:snapshot",
      "image:source",
      "video:snapshot",
      "video:video",
      "audio:source",
    ]),
  );
  expect(
    refs.every((ref: { conversationID: string }) => Boolean(ref.conversationID)),
  ).toBe(true);
});

test("video thumbnails display the attachment poster and update when it changes", async ({
  page,
}) => {
  let videoRequests = 0;
  await page.route("**/__fixtures/poster-*.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="blue"/></svg>',
    }),
  );
  await page.route("**/__fixtures/poster-video.webm", (route) => {
    videoRequests++;
    return route.abort();
  });
  const setPoster = (poster: string) =>
    page.evaluate(async (poster) => {
      const { useConversationStore } = await import("/src/store/index.ts");
      const { pushNewMessage } = await import(
        "/src/pages/chat/queryChat/useHistoryMessageList.tsx"
      );
      const base = JSON.parse(
        useConversationStore.getState().conversationList[0].latestMsg,
      );
      const url = `${location.origin}/__fixtures/poster-video.webm`;
      pushNewMessage({
        ...base,
        clientMsgID: "v2-video-poster",
        contentType: 144,
        status: 2,
        message: {
          components: [
            {
              type: 12,
              items: [
                { media: { url, attachment_id: "video" }, description: "Poster video" },
              ],
            },
          ],
          attachments: [
            {
              id: "video",
              filename: "clip.webm",
              content_type: "video/webm",
              size: 1,
              url,
            },
            {
              id: "video:poster",
              filename: "poster.svg",
              content_type: "image/svg+xml",
              size: 1,
              url: `${location.origin}/__fixtures/${poster}.svg`,
              width: 320,
              height: 180,
            },
          ],
        },
      });
    }, poster);
  await setPoster("poster-first");
  const thumbnail = page.getByRole("button", { name: "Poster video", exact: true });
  await expect(thumbnail.locator("img")).toBeVisible();
  await expect(thumbnail.locator("img")).toHaveJSProperty("naturalWidth", 320);
  await expect(thumbnail.locator("img")).toHaveAttribute("src", /poster-first\.svg$/);
  await setPoster("poster-second");
  await expect(thumbnail.locator("img")).toHaveAttribute("src", /poster-second\.svg$/);
  await expect(thumbnail.locator("img")).toHaveJSProperty("naturalWidth", 320);
  await expect(thumbnail.locator("video")).toHaveCount(0);
  expect(videoRequests).toBe(0);
});

test("video uploads wait for a decoded frame before creating the poster", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
    const { useFileMessage } = await import(
      "/src/pages/chat/queryChat/ChatFooter/SendActionBar/useFileMessage.ts"
    );
    const state = {
      frameReady: false,
      posterUploaded: false,
      complete: false,
      brightness: 0,
      error: "",
      release: () => {},
    };
    Reflect.set(window, "videoPosterTest", state);
    const requestFrame = HTMLVideoElement.prototype.requestVideoFrameCallback;
    HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
      return requestFrame.call(this, (now, metadata) => {
        state.frameReady = true;
        state.release = () => callback(now, metadata);
      });
    };
    IMSDK.uploadFile = async ({ file, uuid }) => {
      if (file.type === "image/jpeg") {
        state.posterUploaded = true;
        const image = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        let brightness = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          brightness += pixels[i] + pixels[i + 1] + pixels[i + 2];
        }
        state.brightness = brightness / ((pixels.length / 4) * 3);
        image.close();
      }
      return { data: { url: `${location.origin}/object/${uuid}/${file.name}` } };
    };
    const video = await (await fetch("/e2e/fixtures/media-cache/clip.webm")).blob();
    void useFileMessage()
      .getUploadedAttachmentBody(
        new File([video], "clip.webm", { type: "video/webm" }),
        "video",
        "poster-frame-test",
      )
      .then(() => {
        state.complete = true;
      })
      .catch((error: Error) => {
        state.error = error.message;
      });
  });
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "videoPosterTest").frameReady))
    .toBe(true);
  expect(
    await page.evaluate(() => Reflect.get(window, "videoPosterTest").posterUploaded),
  ).toBe(false);
  await page.evaluate(() => Reflect.get(window, "videoPosterTest").release());
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "videoPosterTest").complete))
    .toBe(true);
  expect(
    await page.evaluate(() => Reflect.get(window, "videoPosterTest").brightness),
  ).toBeGreaterThan(10);
  expect(await page.evaluate(() => Reflect.get(window, "videoPosterTest").error)).toBe(
    "",
  );
});

test("gallery images reuse the zoomable viewer and keep each image's source", async ({
  page,
}) => {
  const card = page
    .locator("[data-chat-message-row]")
    .filter({ hasText: "设计交付包" });
  await expect(
    card.getByRole("img", { name: "消息组件设计稿", exact: true }),
  ).toHaveCSS("object-fit", "contain");
  await card.getByRole("button", { name: "消息组件设计稿", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const first = dialog.getByRole("img", { name: "消息组件设计稿", exact: true });
  await expect(first).toBeVisible();
  const source = await first.getAttribute("src");
  await dialog.getByRole("button", { name: "放大", exact: true }).click();
  await dialog.getByRole("button", { name: "向右旋转", exact: true }).click();
  await page.keyboard.press("Escape");
  await card.getByRole("button", { name: "交互方案概念图", exact: true }).click();
  const second = dialog.getByRole("img", { name: "交互方案概念图", exact: true });
  await expect(second).toBeVisible();
  expect(await second.getAttribute("src")).not.toBe(source);
});

test("mixed media opens the existing video player and plays inline audio", async ({
  page,
}) => {
  await page.locator("#chat-list").evaluate((element) => {
    element.scrollTop = 0;
  });
  const row = page.locator("[data-chat-message-row]").filter({ hasText: "音视频组合" });
  await row.getByRole("button", { name: "测试视频", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("media-controller")).toBeVisible();
  await expect
    .poll(() => dialog.locator("video").evaluate((video) => video.readyState))
    .toBeGreaterThanOrEqual(1);
  await page.keyboard.press("Escape");
  const audioPlayer = row.locator("media-controller[audio]");
  await audioPlayer.scrollIntoViewIfNeeded();
  await audioPlayer.locator("media-play-button").click();
  await expect
    .poll(() => audioPlayer.locator("audio").evaluate((audio) => audio.paused))
    .toBe(false);
});

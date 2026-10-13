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
  // A desktop cache keyed only by the parent message must not serve the wrong file.
  await page.evaluate(async () => {
    const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
    Reflect.set(window, "electronAPI", { ipcInvoke: async () => null });
    Reflect.set(window, "v2CacheCalls", 0);
    IMSDK.getMedia = async () => {
      Reflect.set(window, "v2CacheCalls", Reflect.get(window, "v2CacheCalls") + 1);
      throw new Error("An embedded file is not an independent cached message");
    };
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
  expect(await page.evaluate(() => Reflect.get(window, "v2CacheCalls"))).toBe(0);
  expect(downloads).toBe(0);
  expect(page.context().pages()).toHaveLength(1);
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

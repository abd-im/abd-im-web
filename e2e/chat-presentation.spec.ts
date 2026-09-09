import { expect, test } from "@playwright/test";

const previewURL = `${
  process.env.ABD_UI_BASE_URL || "http://localhost:5180"
}/ui-preview.html`;

test("dates divide days and individual times appear on hover or focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(previewURL);
  const list = page.locator("#chat-list");
  await expect(list.locator("[data-chat-message-row]")).toHaveCount(7);
  await list.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(list.locator(".chat-date-divider")).toHaveCount(2);
  await expect(list.locator(".chat-date-divider").first()).toHaveText("昨天");
  await expect(list.locator(".chat-date-divider").last()).toHaveText("今天");
  const row = list.locator("[data-chat-message-row]").first();
  const time = row.locator("time");
  await expect(time).toHaveCSS("opacity", "0");
  const before = await row.boundingBox();
  await row.hover();
  await expect(time).toHaveCSS("opacity", "1");
  expect(await row.boundingBox()).toEqual(before);
  await page.mouse.move(0, 0);
  await expect(time).toHaveCSS("opacity", "0");
  await time.focus();
  await expect(time).toHaveCSS("opacity", "1");
  await time.evaluate((element) => element.blur());
  await page.locator(".workspace-brand").click();
  await expect(time).toHaveCSS("opacity", "0");
  await page.screenshot({ path: "e2e/screenshots/chat-dates.png" });
});

test("touch screens keep message times accessible", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(previewURL);
  const time = page.locator("[data-chat-message-row] time").last();
  await expect(time).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "e2e/screenshots/chat-dates-mobile.png" });
  await context.close();
});

test("conversation previews retain descenders and describe non-text messages", async ({
  page,
}) => {
  await page.goto(previewURL);
  await expect(page.locator(".conversation-row")).toHaveCount(5);
  const cases = await page.evaluate(async () => {
    const storeURL = "/src/store/index.ts";
    const commonURL = "/src/utils/imCommon.ts";
    const { useConversationStore } = await import(storeURL);
    const { getConversationContent } = await import(commonURL);
    const conversations = useConversationStore.getState().conversationList;
    const base = JSON.parse(conversations[0].latestMsg);
    const messages = [
      { ...base, textElem: { content: "ggg" } },
      { ...base, contentType: 102, pictureElem: {} },
      { ...base, contentType: 105, fileElem: { fileName: "notes.txt" } },
      { ...base, contentType: 110, customElem: { data: "{}" } },
      { ...base, contentType: 99999 },
    ];
    useConversationStore.setState({
      conversationList: conversations.map((conversation: object, index: number) => ({
        ...conversation,
        latestMsg: JSON.stringify(messages[index]),
      })),
    });
    return messages.map((message) => getConversationContent(message));
  });
  expect(cases).toEqual([
    "ggg",
    "[图片]",
    "[文件]notes.txt",
    "[自定义消息]",
    "[暂未支持的消息类型]",
  ]);
  const preview = page.locator(".conversation-preview").first();
  await expect(preview).toHaveText("ggg");
  const geometry = await preview.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(element).lineHeight),
    parentHeight: element.parentElement!.getBoundingClientRect().height,
  }));
  expect(geometry.height).toBeGreaterThanOrEqual(20);
  expect(geometry.parentHeight).toBeGreaterThanOrEqual(geometry.lineHeight);
  await page
    .locator(".conversation-list")
    .screenshot({ path: "e2e/screenshots/conversation-previews.png" });
});

test("error state uses a compact recovery action", async ({ page }) => {
  await page.goto(previewURL);
  await expect(page.locator(".conversation-row")).toHaveCount(5);
  await page.evaluate(async () => {
    const errorURL = "/src/routes/GlobalErrorElement.tsx";
    const reactURL = "/node_modules/.vite/deps/react.js";
    const domURL = "/node_modules/.vite/deps/react-dom_client.js";
    const [{ ErrorState }, { default: React }, { default: ReactDOM }] =
      await Promise.all([import(errorURL), import(reactURL), import(domURL)]);
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;inset:0;z-index:9999";
    document.body.append(container);
    ReactDOM.createRoot(container).render(
      React.createElement(ErrorState, { onRetry: () => container.remove() }),
    );
  });
  const error = page.getByRole("alert");
  await expect(error).toContainText("页面暂时无法显示，请重试");
  await expect(error.locator("img, .ant-result")).toHaveCount(0);
  await page.screenshot({ path: "e2e/screenshots/error-state.png" });
  await error.getByRole("button", { name: "重新加载" }).click();
  await expect(error).toHaveCount(0);
});

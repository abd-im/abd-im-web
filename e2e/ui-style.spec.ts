import { expect, test } from "@playwright/test";

const previewURL = `${
  process.env.ABD_UI_BASE_URL || "http://localhost:5180"
}/ui-preview.html`;

test("Agent sidebar keeps its own width beside the workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${previewURL}#/agent`);
  await expect(page.getByTestId("agent-new-conversation")).toBeVisible();
  const sidebar = page.locator(".workspace-content aside");
  const content = page.locator(".workspace-content main");
  expect((await sidebar.boundingBox())!.width).toBeCloseTo(285, 0);
  expect((await content.boundingBox())!.width).toBeGreaterThan(1000);
  await page.evaluate(async () => {
    const storeURL = "/src/store/index.ts";
    const configURL = "/src/features/agent/config.ts";
    const { useUserStore } = await import(storeURL);
    const { agentUserEx } = await import(configURL);
    useUserStore.getState().updateSelfInfo({ ex: agentUserEx("", "preview-lin") });
  });
  await page.getByTestId("agent-new-conversation").click();
  await expect(page.getByTestId("agent-conversation-share")).toBeVisible();
  expect((await sidebar.boundingBox())!.width).toBeCloseTo(285, 0);
  expect((await content.boundingBox())!.width).toBeGreaterThan(1000);
  await page.screenshot({ path: "e2e/screenshots/agent-layout.png" });
  await sidebar.locator("[class*=sider_resize]").evaluate((element) => {
    (element as HTMLElement).style.width = "340px";
  });
  expect((await sidebar.boundingBox())!.width).toBeCloseTo(341, 0);
  expect((await content.boundingBox())!.width).toBeGreaterThan(900);
});

test("compact chat keeps the profile at the top and existing actions usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(previewURL);
  await expect(page.locator(".conversation-row")).toHaveCount(5);
  await expect(
    page.locator(".conversation-heading, .conversation-search, .conversation-filters"),
  ).toHaveCount(0);
  const profile = page.locator(".workspace-rail > button");
  const profileBox = await profile.boundingBox();
  const navBox = await page.getByTestId("nav-chat").boundingBox();
  expect(profileBox!.y + profileBox!.height).toBeLessThan(navBox!.y);
  await expect(page.locator(".workspace-brand-mark")).toHaveAttribute(
    "src",
    "./icons/icon.png",
  );
  await profile.click();
  await expect(page.locator(".ui-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(profile).toBeFocused();
  const editor = page.locator(".ck-editor__editable");
  await editor.fill("评审资料已更新。");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    page.locator("#chat-list").getByText("评审资料已更新。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "发送", exact: true })).toBeDisabled();
  const emojiButton = page.locator(".chat-composer-tools button").first();
  await emojiButton.click();
  await expect(page.locator(".ui-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(emojiButton).toBeFocused();
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await expect(
    page.locator(".ui-popover").getByRole("button", { name: "创建群聊", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(
    await page
      .locator(".chat-composer-box")
      .evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe("8px");
  expect(
    await page
      .locator(".conversation-row")
      .first()
      .evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe("6px");
  expect(
    await page
      .locator(".workspace-content")
      .evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe("8px");
  await page.screenshot({ path: "e2e/screenshots/linear-desktop.png" });
  expect(errors).toEqual([]);
});

test("narrow screens show one pane without clipped controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(previewURL);
  await expect(page.locator(".ck-editor__editable")).toBeVisible();
  await expect(page.locator(".conversation-list")).toBeHidden();
  await expect(page.locator(".workspace-topbar")).toBeHidden();
  expect(
    await page
      .locator(".workspace-content")
      .evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe("0px");
  const footer = await page.locator(".chat-composer-bottom").boundingBox();
  expect(footer!.x).toBeGreaterThanOrEqual(0);
  expect(footer!.x + footer!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: "e2e/screenshots/linear-mobile.png" });
  await page.getByRole("button", { name: "返回会话列表" }).click();
  await expect(page.locator(".conversation-row").first()).toBeVisible();
  await page.locator(".conversation-row").nth(1).click();
  await expect(page.locator(".chat-header")).toContainText("陈亦舟");
  await expect(page.locator(".ck-editor__editable")).toBeVisible();
});

test("dark appearance uses the same radii and neutral chat surfaces", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("abd-im-theme", "dark"));
  await page.goto(previewURL);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator(".ck-editor__editable")).toBeVisible();
  const surface = await page
    .locator("#chat-main-content")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(surface).not.toBe("rgb(255, 255, 255)");
  await page.screenshot({ path: "e2e/screenshots/linear-dark.png" });
});

test("Agent settings have a separate page and preserve access choices on return", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(previewURL);
  await page.locator(".workspace-rail > button").click();
  await page.locator(".ui-popover").getByText("账号设置", { exact: true }).click();
  const settings = page.getByTestId("personal-settings");
  const general = page.getByTestId("general-settings");
  await expect(general).toBeVisible();
  await expect(settings.getByText("可访问聊天记录", { exact: true })).toHaveCount(0);
  expect(
    await general.evaluate((element) => element.scrollHeight <= element.clientHeight),
  ).toBe(true);
  await page.waitForTimeout(250);
  await settings.screenshot({ path: "e2e/screenshots/settings-general.png" });

  await settings.getByRole("button", { name: "Agent 设置", exact: true }).click();
  await expect(page.getByTestId("agent-settings")).toBeVisible();
  await expect(general).toHaveCount(0);
  await expect(settings.getByRole("button", { name: "返回账号设置" })).toBeFocused();
  await settings.getByRole("button", { name: "全选", exact: true }).click();
  await expect(settings.getByText("已选择 5 个会话", { exact: true })).toBeVisible();
  await expect(
    settings.locator(".agent-access-list input[type=checkbox]").first(),
  ).toBeEnabled();
  await settings.screenshot({ path: "e2e/screenshots/settings-agent.png" });
  await settings.getByRole("button", { name: "返回账号设置" }).click();
  await expect(
    settings.getByRole("button", { name: "Agent 设置", exact: true }),
  ).toBeFocused();
  await settings.getByRole("button", { name: "Agent 设置", exact: true }).click();
  await expect(settings.getByText("已选择 5 个会话", { exact: true })).toBeVisible();
  await settings.locator(".agent-access-list input[type=checkbox]").first().click();
  await expect(settings.getByText("已选择 4 个会话", { exact: true })).toBeVisible();
  await expect(
    settings.locator(".agent-access-list input[type=checkbox]").first(),
  ).not.toBeChecked();
  await settings.getByRole("button", { name: "选择 Agent 用户", exact: true }).click();
  const picker = page
    .getByRole("dialog")
    .filter({ hasText: "选择 Agent 用户" })
    .filter({ has: page.getByText("我的好友", { exact: true }) });
  await expect(picker).toBeVisible();
  await picker.getByText("我的好友", { exact: true }).click();
  await picker.getByText("林知夏", { exact: true }).click();
  await picker.getByRole("button", { name: "确认", exact: true }).click();
  await expect(settings.getByText("preview-lin", { exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "返回账号设置" }).click();
  await settings.getByRole("button", { name: "Agent 设置", exact: true }).click();
  await expect(settings.getByText("preview-lin", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const storeURL = "/src/store/index.ts";
    const { useConversationStore } = await import(storeURL);
    const [conversation] = useConversationStore.getState().conversationList;
    useConversationStore.setState({
      conversationList: Array.from({ length: 30 }, (_, index) => ({
        ...conversation,
        conversationID: `settings-scroll-${index}`,
      })),
    });
  });
  const accessList = settings.locator(".agent-access-list");
  await expect(accessList.locator("input[type=checkbox]")).toHaveCount(30);
  expect(
    await accessList.evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  expect(
    await page
      .getByTestId("agent-settings")
      .evaluate((element) => element.scrollHeight <= element.clientHeight),
  ).toBe(true);
  await accessList.locator("input[type=checkbox]").last().scrollIntoViewIfNeeded();
  await expect(settings.getByRole("button", { name: "返回账号设置" })).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 640 });
  const box = await settings.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(640);
  await settings.screenshot({ path: "e2e/screenshots/settings-agent-mobile.png" });
  await settings.getByRole("button", { name: "关闭设置" }).click();
  await expect(settings).toBeHidden();
});

import { expect, Page, test } from "@playwright/test";

const baseURL = process.env.ABD_REACTION_E2E_BASE_URL;
const conversationID = process.env.ABD_REACTION_E2E_CONVERSATION_ID;
const userAEmail = process.env.ABD_REACTION_E2E_USER_A_EMAIL;
const userAPassword = process.env.ABD_REACTION_E2E_USER_A_PASSWORD;
const userBEmail = process.env.ABD_REACTION_E2E_USER_B_EMAIL;
const userBPassword = process.env.ABD_REACTION_E2E_USER_B_PASSWORD;

const e2eConfigured = Boolean(
  baseURL &&
    conversationID &&
    userAEmail &&
    userAPassword &&
    userBEmail &&
    userBPassword,
);

const login = async (page: Page, email: string, password: string) => {
  await page.goto(`${baseURL}/#/login`);
  await page.getByRole("tab", { name: /email|邮箱/i }).click();
  await page.getByPlaceholder(/enter.*email|输入.*邮箱/i).fill(email);
  await page.getByPlaceholder(/enter.*password|输入.*密码/i).fill(password);
  await page.getByRole("button", { name: /login|登录/i, exact: true }).click();
  await page.waitForURL(/#\/chat/);
  await page.goto(`${baseURL}/#/chat/${conversationID}`);
  await expect(page.locator(".ck-editor__editable")).toBeVisible();
};

const messageItem = (page: Page, text: string) =>
  page
    .getByText(text, { exact: true })
    .locator("xpath=ancestor::div[starts-with(@id, 'chat_')]");

test.describe("message reactions", () => {
  test.skip(!e2eConfigured, "Set ABD_REACTION_E2E_* to run reaction integration tests");

  test("syncs two clients and restores the authoritative summary", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const summaryBatchSizes: number[] = [];

    pageB.on("request", (request) => {
      if (!request.url().endsWith("/msg/get_reaction_summaries")) return;
      const body = request.postDataJSON() as { clientMsgIDs?: unknown };
      if (Array.isArray(body.clientMsgIDs)) {
        summaryBatchSizes.push(body.clientMsgIDs.length);
      }
    });

    await Promise.all([
      login(pageA, userAEmail!, userAPassword!),
      login(pageB, userBEmail!, userBPassword!),
    ]);

    const text = `reaction-e2e-${Date.now()}`;
    await pageA.locator(".ck-editor__editable").fill(text);
    await pageA.getByRole("button", { name: /send|发送/i, exact: true }).click();

    const itemA = messageItem(pageA, text);
    const itemB = messageItem(pageB, text);
    await expect(itemA).toBeVisible();
    await expect(itemB).toBeVisible();

    await itemA.hover();
    await itemA.getByTestId("add-message-reaction").click();
    await pageA.locator('button[data-reaction-picker-emoji="👍"]').click();

    const reactionA = itemA.locator('button[data-reaction-emoji="👍"]');
    const reactionB = itemB.locator('button[data-reaction-emoji="👍"]');
    await expect(reactionA).toContainText("1");
    await expect(reactionB).toContainText("1");

    await reactionB.click();
    await expect(reactionA).toContainText("2");
    await expect(reactionB).toHaveAttribute("aria-pressed", "true");

    await reactionB.click();
    await expect(reactionA).toContainText("1");
    await pageB.reload();
    await expect(
      messageItem(pageB, text).locator('button[data-reaction-emoji="👍"]'),
    ).toContainText("1");

    await pageB.setViewportSize({ width: 390, height: 844 });
    const narrowItem = messageItem(pageB, text);
    await narrowItem.scrollIntoViewIfNeeded();
    await narrowItem.hover();
    const narrowPickerButton = narrowItem.getByTestId("add-message-reaction");
    await expect(narrowPickerButton).toBeInViewport();
    await narrowPickerButton.click();
    for (const emoji of ["👍", "❤️", "😂", "😮", "😢", "🙏"]) {
      await expect(
        pageB.locator(`button[data-reaction-picker-emoji="${emoji}"]`),
      ).toBeInViewport();
    }

    expect(summaryBatchSizes.length).toBeGreaterThan(0);
    expect(summaryBatchSizes.every((size) => size > 0 && size <= 100)).toBe(true);
    const loadedReactableMessages = await pageB
      .locator('[id^="chat_"]:has([data-testid="add-message-reaction"])')
      .count();
    if (loadedReactableMessages > 1) {
      expect(summaryBatchSizes.some((size) => size > 1)).toBe(true);
    }

    await reactionA.click();
    await expect(reactionA).toHaveCount(0);
    await expect(reactionB).toHaveCount(0);
    await expect(
      itemA.locator('[class*="message-bubble-wrap-reaction-shell"]'),
    ).toHaveCount(1);

    await Promise.all([contextA.close(), contextB.close()]);
  });
});

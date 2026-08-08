import { expect, Page, test } from "@playwright/test";

const baseURL = process.env.ABD_AGENT_E2E_BASE_URL;
const email = process.env.ABD_AGENT_E2E_EMAIL;
const password = process.env.ABD_AGENT_E2E_PASSWORD;
const agentContact = process.env.ABD_AGENT_E2E_AGENT_CONTACT;
const shareContact = process.env.ABD_AGENT_E2E_SHARE_CONTACT;
const e2eConfigured = Boolean(
  baseURL && email && password && agentContact && shareContact,
);

const login = async (page: Page) => {
  await page.goto(`${baseURL}/#/login`);
  await page.getByRole("tab", { name: /email|邮箱/i }).click();
  await page.getByPlaceholder(/enter.*email|输入.*邮箱/i).fill(email!);
  await page.getByPlaceholder(/enter.*password|输入.*密码/i).fill(password!);
  await page.getByRole("button", { name: /login|登录/i, exact: true }).click();
  await page.waitForURL(/#\/chat/);
};

test.describe("Agent workspace lifecycle", () => {
  test.skip(
    !e2eConfigured,
    "Set ABD_AGENT_E2E_BASE_URL, ABD_AGENT_E2E_EMAIL, ABD_AGENT_E2E_PASSWORD, ABD_AGENT_E2E_AGENT_CONTACT and ABD_AGENT_E2E_SHARE_CONTACT",
  );

  test("creates, restores, renames, pins and shares a workspace", async ({ page }) => {
    await login(page);
    await page.getByTestId("nav-agent").click();
    await page.getByTestId("agent-new-conversation").click();
    await page.getByText(agentContact!, { exact: true }).click();
    await page.getByRole("button", { name: /confirm|确定/i }).click();
    await page.waitForURL(/#\/agent\//);

    const conversationID = page.url().split("/agent/")[1];
    const row = page.getByTestId(`agent-conversation-${conversationID}`);
    await expect(row).toBeVisible();
    await expect(page.getByTestId("agent-conversation-archive")).toBeDisabled();

    await page.reload();
    await expect(row).toBeVisible();
    await row.hover();
    await row.getByTestId("agent-conversation-rename").click();
    const title = `Agent E2E ${Date.now()}`;
    await row.getByRole("textbox").fill(title);
    await row.getByRole("textbox").press("Enter");
    await expect(row).toContainText(title);

    await row.hover();
    await row.getByTestId("agent-conversation-pin").click();
    await expect(row.getByTestId("agent-conversation-pin")).toHaveAttribute(
      "aria-label",
      "取消置顶",
    );

    await page.getByTestId("agent-conversation-share").click();
    await page.getByText(shareContact!, { exact: true }).click();
    await page.getByRole("button", { name: /confirm|确定/i }).click();
    await expect(page.getByText(shareContact!, { exact: true })).toHaveCount(0);
  });
});

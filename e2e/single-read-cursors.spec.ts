import { expect, test } from "@playwright/test";

const baseURL = process.env.ABD_UI_BASE_URL || "http://localhost:5180";

for (const width of [1440, 390]) {
  test(`single read cursor updates visible messages ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseURL}/ui-preview.html`);
    await expect(page.locator("[data-chat-message-row]")).toHaveCount(7);
    await page.evaluate(async () => {
      const historyURL = "/src/pages/chat/queryChat/useHistoryMessageList.tsx";
      const { updateOneMessage } = await import(historyURL);
      for (const index of [1, 3, 5]) {
        updateOneMessage({ clientMsgID: `preview-message-${index}`, isRead: false });
      }
    });
    const early = page.locator("#chat_preview-message-1");
    const middle = page.locator("#chat_preview-message-3");
    const late = page.locator("#chat_preview-message-5");
    const earlyReceipt = early.locator("[data-single-read-receipt]");
    const middleReceipt = middle.locator("[data-single-read-receipt]");
    const lateReceipt = late.locator("[data-single-read-receipt]");
    await expect(earlyReceipt.getByRole("progressbar", { name: "未读" })).toBeVisible();
    await expect(
      middleReceipt.getByRole("progressbar", { name: "未读" }),
    ).toBeVisible();
    await page.evaluate(async () => {
      const url = "/src/pages/chat/queryChat/useHistoryMessageList.tsx";
      const { updateSingleReadCursor } = await import(url);
      updateSingleReadCursor({
        conversationID: "another-chat",
        userID: "preview-lin",
        hasReadSeq: 100,
        readTime: 0,
      });
    });
    await expect(earlyReceipt.getByRole("progressbar", { name: "未读" })).toBeVisible();
    await page.evaluate(async () => {
      const url = "/src/pages/chat/queryChat/useHistoryMessageList.tsx";
      const { updateSingleReadCursor } = await import(url);
      updateSingleReadCursor({
        conversationID: "preview-chat-0",
        userID: "preview-lin",
        hasReadSeq: 4,
        readTime: 0,
      });
    });
    await expect(
      earlyReceipt.getByRole("progressbar", { name: "已读" }),
    ).toHaveAttribute("aria-valuenow", "100");
    await expect(
      middleReceipt.getByRole("progressbar", { name: "已读" }),
    ).toHaveAttribute("aria-valuenow", "100");
    await expect(
      lateReceipt.getByRole("progressbar", { name: "未读" }),
    ).toHaveAttribute("aria-valuenow", "0");
    await expect(early.getByText("已读", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `e2e/screenshots/single-read-${width}.png` });
  });
}

import { expect, test } from "@playwright/test";

const baseURL = process.env.ABD_UI_BASE_URL || "http://localhost:5180";

test("partial reply action closes when another message is clicked", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto(`${baseURL}/ui-preview.html`);

  const source = page
    .locator("#chat_preview-message-6 [data-quote-source]")
    .getByText("没问题，到时候见。", { exact: true });
  await source.evaluate((element) => {
    const text = element.firstChild;
    if (!text) throw new Error("missing message text");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 3);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });

  const partialReply = page.locator("[data-partial-reply-action]");
  await expect(partialReply).toBeVisible();
  await page.getByText("好，评审前我们再碰一下。", { exact: true }).click();
  await expect(partialReply).toBeHidden();
});

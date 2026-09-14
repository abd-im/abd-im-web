import { expect, test } from "@playwright/test";

const previewURL =
  (process.env.ABD_UI_BASE_URL || "http://localhost:5180") + "/ui-preview.html";

test("message reactions show selection, complete members, and the fixed picker", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto(previewURL);

  const message = page.locator("[data-chat-message-row]").last();
  const selectedReaction = message.locator('[data-reaction-emoji="👍"]');
  const reactionMembers = page.getByText("林知夏, 陈亦舟, 苏晚, Alex", {
    exact: true,
  });
  await expect(selectedReaction).toBeVisible();
  await expect(selectedReaction).toHaveAttribute("aria-pressed", "true");
  await expect(selectedReaction).toContainText("4");

  await selectedReaction.hover();
  await expect(reactionMembers).toBeVisible();

  await message.getByText("没问题，到时候见。", { exact: true }).hover();
  await message.getByTestId("add-message-reaction").hover();
  const pickerOptions = page.locator("[data-reaction-picker-emoji]");
  await expect(pickerOptions).toHaveCount(8);
  await expect(pickerOptions.first()).toBeVisible();
  await expect(reactionMembers).toBeHidden();
  await expect(selectedReaction).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/message-reactions.png" });
});

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
  await expect(selectedReaction).toBeVisible();
  await page.evaluate(async () => {
    const { useContactStore } = await import("/src/store/index.ts");
    const friends = useContactStore.getState().friendList;
    useContactStore.setState({
      friendList: friends.map((friend: { userID: string }) =>
        friend.userID === "preview-lin" ? { ...friend, remark: "产品小林" } : friend,
      ),
    });
  });
  const reactionMembers = page.locator('[data-reaction-members-for="👍"]');
  await expect(selectedReaction).toHaveAttribute("aria-pressed", "true");
  await expect(selectedReaction).toContainText("4");

  await selectedReaction.hover();
  await expect(reactionMembers).toBeVisible();
  await expect(reactionMembers.locator("[data-reaction-member-id]")).toHaveCount(4);
  await expect(reactionMembers).toContainText("产品小林");
  await expect(reactionMembers).toContainText("陈亦舟");
  await expect(reactionMembers).not.toContainText("preview-lin");
  await page.screenshot({ path: "e2e/screenshots/message-reaction-members.png" });

  await page.locator(".chat-header").hover();
  await expect(reactionMembers).toBeHidden();
  await message.getByText("没问题，到时候见。", { exact: true }).hover();
  await message.getByTestId("add-message-reaction").hover();
  const pickerOptions = page.locator("[data-reaction-picker-emoji]");
  await expect(pickerOptions).toHaveCount(8);
  await expect(pickerOptions.first()).toBeVisible();
  await expect(selectedReaction).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/message-reactions.png" });
});

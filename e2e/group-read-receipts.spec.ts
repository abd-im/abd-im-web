import { expect, Page, test } from "@playwright/test";

const baseURL = process.env.ABD_UI_BASE_URL || "http://localhost:5180";

async function prepareGroup(page: Page) {
  await page.goto(`${baseURL}/ui-preview.html`);
  await expect(page.locator("[data-chat-message-row]")).toHaveCount(7);
  await page.evaluate(async () => {
    const sdkURL = "/src/layout/MainContentWrap.tsx";
    const storeURL = "/src/store/index.ts";
    const readURL = "/src/store/groupReadReceipt.ts";
    const historyURL = "/src/pages/chat/queryChat/useHistoryMessageList.tsx";
    const { IMSDK } = await import(sdkURL);
    const { useContactStore, useConversationStore } = await import(storeURL);
    const { useGroupReadReceiptStore } = await import(readURL);
    const { updateOneMessage } = await import(historyURL);
    const { data } = await IMSDK.getAdvancedHistoryMessageList({
      conversationID: "preview-chat-0",
    });
    const members = [
      { userID: "preview-lin", nickname: "林知夏", faceURL: "", groupID: "test" },
      { userID: "preview-chen", nickname: "陈亦舟", faceURL: "", groupID: "test" },
      { userID: "preview-su", nickname: "苏晚", faceURL: "", groupID: "test" },
      { userID: "preview-zhou", nickname: "周予安", faceURL: "", groupID: "test" },
    ];
    const readCountBySeq = new Map([
      [2, 0],
      [4, 2],
      [6, 4],
      [7, 2],
    ]);
    const receipt = {
      conversationID: "preview-chat-0",
      enabled: true,
      status: "ready",
      reason: "",
      groupMessageReadInfo: [...readCountBySeq].map(([seq, count]) => {
        return {
          seq,
          clientMsgID: `preview-message-${seq - 1}`,
          hasReadCount: count,
          unreadCount: 4 - count,
          readMembers: members.slice(0, count),
          unreadMembers: members.slice(count),
        };
      }),
    };
    const calls: Record<string, unknown[]> = { reads: [], end: [], queries: [] };
    Object.assign(window, { groupReadTestCalls: calls, groupReadTestReceipt: receipt });
    useContactStore.setState({
      friendList: [
        {
          userID: "preview-lin",
          nickname: "林知夏",
          remark: "产品小林",
          faceURL: "",
        },
      ],
    });
    IMSDK.getGroupMessageReadInfo = async (params: unknown) => {
      calls.queries.push(params);
      return { data: Reflect.get(window, "groupReadTestReceipt") };
    };
    IMSDK.markConversationMessageAsReadBySeq = async (params: unknown) => {
      calls.reads.push(params);
      return { data: null };
    };
    IMSDK.markConversationMessageAsRead = async (params: unknown) => {
      calls.end.push(params);
      return { data: null };
    };
    const current = useConversationStore.getState().currentConversation;
    useConversationStore.setState({
      currentConversation: { ...current, conversationType: 3, groupID: "test" },
      currentGroupInfo: { groupID: "test", groupName: "产品评审", memberCount: 5 },
      currentMemberInGroup: { userID: "preview-me", groupID: "test", roleLevel: 100 },
    });
    useGroupReadReceiptStore.getState().update(receipt);
    data.messageList.forEach((message: Record<string, unknown>) =>
      updateOneMessage({
        ...message,
        sendID: message.seq === 7 ? "preview-me" : message.sendID,
        senderNickname: message.seq === 7 ? "Alex" : message.senderNickname,
        sessionType: 3,
        groupID: "test",
        sendTime: Date.now() - 100 * 86400000,
      }),
    );
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`group read rings and local lists ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await prepareGroup(page);
    const row = page.locator("#chat_preview-message-3");
    const circle = row.getByRole("button", { name: "产品小林, 陈亦舟 已读" });
    await expect(circle).toBeVisible();
    const before = await row.boundingBox();
    const bubble = row.locator("[data-quote-source]").first();
    const circleBox = await circle.boundingBox();
    const bubbleBox = await bubble.boundingBox();
    expect(circleBox!.x + circleBox!.width).toBeLessThanOrEqual(bubbleBox!.x + 1);
    expect(circleBox!.y + circleBox!.height / 2).toBeGreaterThan(bubbleBox!.y);
    expect(circleBox!.y + circleBox!.height / 2).toBeLessThan(
      bubbleBox!.y + bubbleBox!.height,
    );
    await circle.hover();
    await expect(row.locator("[data-message-actions]")).toHaveCSS("opacity", "0");
    await expect(circle).toHaveAttribute("title", "产品小林, 陈亦舟 已读");
    expect(await row.boundingBox()).toEqual(before);

    const reactionRow = page.locator("#chat_preview-message-6");
    const reactionCircle = reactionRow.getByRole("button", {
      name: "产品小林, 陈亦舟 已读",
    });
    const reactionBubble = reactionRow.locator("[data-quote-source]");
    const reactionShell = reactionRow.locator("[data-message-bubble-wrap]");
    await expect(reactionRow.locator('[data-reaction-emoji="👍"]')).toBeVisible();
    await expect(reactionCircle).toBeVisible();
    const reactionCircleBox = await reactionCircle.boundingBox();
    const reactionBubbleBox = await reactionBubble.boundingBox();
    const reactionShellBox = await reactionShell.boundingBox();
    expect(reactionCircleBox!.y + reactionCircleBox!.height / 2).toBeGreaterThan(
      reactionBubbleBox!.y + reactionBubbleBox!.height,
    );
    expect(reactionCircleBox!.y + reactionCircleBox!.height).toBeLessThanOrEqual(
      reactionShellBox!.y + reactionShellBox!.height + 1,
    );
    await circle.click();
    const panel = page.locator(".ui-popover").filter({ hasText: "阅读状态" });
    await expect(circle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await expect(page.locator(".ui-tooltip")).toHaveCount(0);
    await expect(panel).toContainText("2 已读");
    await expect(panel).toContainText("2 未读");
    await expect(panel).toContainText("产品小林");
    await expect(panel).toContainText("苏晚");
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.width).toBeLessThanOrEqual(viewport.width > 600 ? 338 : 302);
    await page.screenshot({ path: `e2e/screenshots/group-read-${viewport.width}.png` });
    const calls = await page.evaluate(() => Reflect.get(window, "groupReadTestCalls"));
    expect(calls.end).toEqual([]);
    expect(calls.queries.at(-1)).toEqual({
      conversationID: "preview-chat-0",
      seqs: [2, 4, 6, 7],
    });
    expect(calls.reads.length).toBeGreaterThan(0);
    await page.locator("#chat_preview-message-2").click();
    await expect(panel).toBeHidden();
    await page.evaluate(async () => {
      const { useConversationStore } = await import("/src/store/index.ts");
      const current = useConversationStore.getState().currentConversation;
      useConversationStore.setState({
        currentConversation: { ...current, conversationType: 1, groupID: "" },
      });
    });
    await expect(circle).toHaveCount(0);
  });
}

test("group read status changes update an open list and respect server capability", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareGroup(page);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const queries = Reflect.get(window, "groupReadTestCalls").queries;
        return queries.at(-1)?.seqs.includes(7) ?? false;
      }),
    )
    .toBe(true);
  const initialQueryCount = await page.evaluate(
    () => Reflect.get(window, "groupReadTestCalls").queries.length,
  );
  const row = page.locator("#chat_preview-message-3");
  await row.getByRole("button", { name: "产品小林, 陈亦舟 已读" }).click();
  await page.evaluate(async () => {
    const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
    const previous = Reflect.get(window, "groupReadTestReceipt");
    const item = previous.groupMessageReadInfo.find(
      (item: { seq: number }) => item.seq === 4,
    );
    Reflect.set(window, "groupReadTestReceipt", {
      ...previous,
      groupMessageReadInfo: previous.groupMessageReadInfo.map(
        (message: { seq: number }) =>
          message.seq === 4
            ? {
                ...item,
                hasReadCount: 3,
                unreadCount: 1,
                readMembers: [...item.readMembers, item.unreadMembers[0]],
                unreadMembers: item.unreadMembers.slice(1),
              }
            : message,
      ),
    });
    IMSDK.emit(
      "OnRecvC2CReadReceipt" as never,
      {
        event: "OnRecvC2CReadReceipt",
        data: [
          {
            conversationID: "preview-chat-0",
            userID: "preview-zhou",
            hasReadSeq: 4,
            readTime: Date.now(),
            sessionType: 3,
          },
        ],
      } as never,
    );
  });
  await expect
    .poll(async () =>
      page.evaluate(() => Reflect.get(window, "groupReadTestCalls").queries.length),
    )
    .toBe(initialQueryCount + 1);
  const panel = page.locator(".ui-popover").filter({ hasText: "阅读状态" });
  await expect(panel).toContainText("3 已读");
  await expect(panel).toContainText("1 未读");
  await page.evaluate(async () => {
    const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
    Reflect.set(window, "groupReadTestReceipt", {
      conversationID: "preview-chat-0",
      enabled: false,
      status: "ready",
      reason: "MEMBER_LIMIT_EXCEEDED",
      groupMessageReadInfo: [],
    });
    IMSDK.emit(
      "OnRecvC2CReadReceipt" as never,
      {
        event: "OnRecvC2CReadReceipt",
        data: [
          {
            conversationID: "preview-chat-0",
            userID: "preview-zhou",
            hasReadSeq: 5,
            readTime: Date.now(),
            sessionType: 3,
          },
        ],
      } as never,
    );
  });
  await expect
    .poll(async () =>
      page.evaluate(() => Reflect.get(window, "groupReadTestCalls").queries.length),
    )
    .toBe(initialQueryCount + 2);
  await expect(row.getByRole("button", { name: /已读/ })).toHaveCount(0);
  await expect(panel).toBeHidden();
});

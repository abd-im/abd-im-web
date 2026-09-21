import { expect, test } from "@playwright/test";

const baseURL = process.env.ABD_UI_BASE_URL || "http://localhost:5180";

test("own read cursor changes do not query receipts or overwrite ordinary messages", async ({
  page,
}) => {
  await page.goto(`${baseURL}/ui-preview.html`);
  await expect(page.locator("[data-chat-message-row]")).toHaveCount(7);
  await page.evaluate(async () => {
    const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
    const { useConversationStore } = await import("/src/store/index.ts");
    Reflect.set(window, "readRefreshQueries", 0);
    Reflect.set(window, "receiptQueries", 0);
    IMSDK.getMessageReadInfo = async () => {
      Reflect.set(window, "receiptQueries", Reflect.get(window, "receiptQueries") + 1);
      return {
        data: { conversationID: "preview-chat-0", messageReadInfo: [] },
      } as never;
    };
    IMSDK.findMessageList = async () => {
      Reflect.set(
        window,
        "readRefreshQueries",
        Reflect.get(window, "readRefreshQueries") + 1,
      );
      return { data: { findResultItems: [] } } as never;
    };
    const conversation = useConversationStore.getState().currentConversation!;
    const latest = JSON.parse(conversation.latestMsg);
    IMSDK.emit(
      "OnConversationChanged" as never,
      {
        event: "OnConversationChanged",
        data: [
          {
            ...conversation,
            readSeq: 10,
            unreadCount: 0,
            latestMsg: JSON.stringify({
              ...latest,
              clientMsgID: "preview-message-6",
              seq: 7,
              textElem: { content: "stale conversation preview" },
            }),
          },
        ],
      } as never,
    );
    IMSDK.emit(
      "OnMessageReadStateChanged" as never,
      { event: "OnMessageReadStateChanged", data: "another-conversation" } as never,
    );
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useConversationStore } = await import("/src/store/index.ts");
        return useConversationStore.getState().currentConversation?.readSeq;
      }),
    )
    .toBe(10);
  await expect(page.locator("#chat_preview-message-6")).toContainText(
    "没问题，到时候见。",
  );
  expect(await page.evaluate(() => Reflect.get(window, "readRefreshQueries"))).toBe(0);
  expect(await page.evaluate(() => Reflect.get(window, "receiptQueries"))).toBe(0);
});

for (const width of [1440, 390]) {
  test(`read state events refresh SDK read results ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseURL}/ui-preview.html`);
    await expect(page.locator("[data-chat-message-row]")).toHaveCount(7);
    const early = page.locator("#chat_preview-message-1");
    const middle = page.locator("#chat_preview-message-3");
    const late = page.locator("#chat_preview-message-5");
    const earlyReceipt = early.locator("[data-message-read-receipt]");
    const middleReceipt = middle.locator("[data-message-read-receipt]");
    const lateReceipt = late.locator("[data-message-read-receipt]");
    await expect(earlyReceipt.getByRole("progressbar", { name: "未读" })).toBeVisible();
    await expect(earlyReceipt.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    await page.evaluate(async () => {
      const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
      const { useMessageReadReceiptStore } = await import(
        "/src/store/messageReadReceipt.ts"
      );
      const member = { userID: "preview-lin", nickname: "林知夏", faceURL: "" };
      const receipt = {
        conversationID: "preview-chat-0",
        enabled: true,
        status: "ready" as const,
        reason: "",
        messageReadInfo: [2, 4, 6].map((seq) => ({
          seq,
          hasReadCount: 0,
          unreadCount: 1,
          readMembers: [],
          unreadMembers: [member],
        })),
      };
      Object.assign(window, { singleReadResult: receipt });
      IMSDK.getMessageReadInfo = async () =>
        ({ data: Reflect.get(window, "singleReadResult") } as never);
      IMSDK.findMessageList = async () => ({ data: { findResultItems: [] } } as never);
      useMessageReadReceiptStore.getState().update(receipt);
    });
    await expect(
      earlyReceipt.getByRole("progressbar", { name: "0 人已读，1 人未读" }),
    ).toBeVisible();
    await expect(
      middleReceipt.getByRole("progressbar", { name: "0 人已读，1 人未读" }),
    ).toBeVisible();
    await page.evaluate(async () => {
      const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
      const previous = Reflect.get(window, "singleReadResult");
      Reflect.set(window, "singleReadResult", {
        ...previous,
        messageReadInfo: previous.messageReadInfo.map(
          (message: { seq: number; unreadMembers: unknown[] }) =>
            message.seq <= 4
              ? {
                  ...message,
                  hasReadCount: 1,
                  unreadCount: 0,
                  readMembers: message.unreadMembers,
                  unreadMembers: [],
                }
              : message,
        ),
      });
      IMSDK.emit(
        "OnMessageReadStateChanged" as never,
        {
          event: "OnMessageReadStateChanged",
          data: "preview-chat-0",
        } as never,
      );
    });
    await expect(
      earlyReceipt.getByRole("progressbar", { name: "林知夏 已读" }),
    ).toHaveAttribute("aria-valuenow", "100");
    await expect(
      middleReceipt.getByRole("progressbar", { name: "林知夏 已读" }),
    ).toHaveAttribute("aria-valuenow", "100");
    await expect(
      lateReceipt.getByRole("progressbar", { name: "0 人已读，1 人未读" }),
    ).toHaveAttribute("aria-valuenow", "0");
    await page.evaluate(async () => {
      const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
      IMSDK.getMessageReadInfo = async () => {
        throw new Error("local read query failed");
      };
      IMSDK.emit(
        "OnMessageReadStateChanged" as never,
        {
          event: "OnMessageReadStateChanged",
          data: "preview-chat-0",
        } as never,
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    await expect(earlyReceipt.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    await expect(lateReceipt.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    await expect(early.getByText("已读", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `e2e/screenshots/single-read-${width}.png` });
  });
}

for (const event of ["OnConversationChanged", "OnMessageReadStateChanged"]) {
  test(`${event} refreshes the SDK burn timestamp`, async ({ page }) => {
    await page.goto(`${baseURL}/ui-preview.html`);
    await expect(page.locator("[data-chat-message-row]")).toHaveCount(7);
    await page.evaluate(async () => {
      const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
      const { updateOneMessage } = await import(
        "/src/pages/chat/queryChat/useHistoryMessageList.tsx"
      );
      const { data } = await IMSDK.getAdvancedHistoryMessageList({
        conversationID: "preview-chat-0",
      });
      const message = data.messageList.find(
        (item: { clientMsgID: string }) => item.clientMsgID === "preview-message-1",
      );
      updateOneMessage({
        ...message,
        attachedInfoElem: { isPrivateChat: true, hasReadTime: 0, burnDuration: 60 },
      });
      IMSDK.findMessageList = async () =>
        ({
          data: {
            findResultItems: [
              {
                conversationID: "preview-chat-0",
                messageList: [
                  {
                    ...message,
                    attachedInfoElem: {
                      isPrivateChat: true,
                      hasReadTime: Date.now() - 20000,
                      burnDuration: 60,
                    },
                  },
                ],
              },
            ],
          },
        } as never);
    });
    const row = page.locator("#chat_preview-message-1");
    await expect(row.getByText(/🔥/)).toHaveCount(0);
    await page.evaluate(async (event) => {
      const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
      const { useConversationStore } = await import("/src/store/index.ts");
      IMSDK.emit(
        event as never,
        {
          event,
          data:
            event === "OnConversationChanged"
              ? [{ ...useConversationStore.getState().currentConversation }]
              : "preview-chat-0",
        } as never,
      );
    }, event);
    await expect(row.getByText(/🔥\s*(3\d|40)s/)).toBeVisible();
  });
}

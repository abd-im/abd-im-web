import { expect, Page, test } from "@playwright/test";

const baseURL = process.env.ABD_UI_BASE_URL || "http://localhost:5180";

async function prepareGroup(page: Page, groupAtType = 0) {
  await page.goto(`${baseURL}/ui-preview.html`);
  await expect(page.locator("[data-chat-message-row]")).toHaveCount(7);
  await page.evaluate(
    async ({ groupAtType }) => {
      const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
      const { useContactStore, useConversationStore } = await import(
        "/src/store/index.ts"
      );
      const { data } = await IMSDK.getAdvancedHistoryMessageList({
        conversationID: "preview-chat-0",
      });
      const groupMessages = data.messageList.map((message) => ({
        ...message,
        sessionType: 3,
        groupID: "preview-group",
      }));
      const members = [
        {
          userID: "preview-lin",
          nickname: "林知夏",
          faceURL: "",
          groupID: "preview-group",
          roleLevel: 20,
        },
        {
          userID: "preview-chen",
          nickname: "陈亦舟",
          faceURL: "",
          groupID: "preview-group",
          roleLevel: 20,
        },
        {
          userID: "preview-me",
          nickname: "Alex",
          faceURL: "",
          groupID: "preview-group",
          roleLevel: 100,
        },
      ];
      const result = (value: unknown) =>
        Promise.resolve({ data: value, errCode: 0, errMsg: "", operationID: "test" });
      const calls = {
        atMessages: [] as Array<Record<string, unknown>>,
        fetches: [] as Array<Record<string, unknown>>,
        finds: 0,
        historyCounts: [] as number[],
        newerStarts: [] as string[],
        olderStarts: [] as string[],
        resets: [] as string[],
      };
      Reflect.set(window, "mentionJumpCalls", calls);
      Reflect.set(window, "previewGroupMessages", groupMessages);
      IMSDK.getGroupMemberList = () => result(members) as never;
      IMSDK.searchGroupMembers = ({ keywordList }: { keywordList: string[] }) =>
        result(
          members.filter((member) =>
            member.nickname
              .toLocaleLowerCase()
              .includes(keywordList[0].toLocaleLowerCase()),
          ),
        ) as never;
      IMSDK.getSpecifiedGroupMembersInfo = ({ userIDList }: { userIDList: string[] }) =>
        result(members.filter((member) => userIDList.includes(member.userID))) as never;
      IMSDK.createTextAtMessage = (params: Record<string, unknown>) => {
        calls.atMessages.push(structuredClone(params));
        const base = groupMessages[0];
        return result({
          ...base,
          clientMsgID: `sent-at-${Date.now()}`,
          serverMsgID: `sent-at-server-${Date.now()}`,
          contentType: 106,
          sendID: "preview-me",
          senderNickname: "Alex",
          sessionType: 3,
          groupID: "preview-group",
          atTextElem: {
            text: params.text,
            atUserList: params.atUserIDList,
            atUsersInfo: params.atUsersInfo,
            quoteMessage: params.message,
          },
        }) as never;
      };
      IMSDK.getMessageReadInfo = () =>
        result({
          conversationID: "preview-chat-0",
          enabled: false,
          status: "ready",
          reason: "MEMBER_LIMIT_EXCEEDED",
          messageReadInfo: [],
        }) as never;
      IMSDK.getAdvancedHistoryMessageListReverse = ({
        startClientMsgID,
      }: {
        startClientMsgID: string;
      }) => {
        calls.newerStarts.push(startClientMsgID);
        return result({ messageList: [], isEnd: true }) as never;
      };
      IMSDK.resetConversationGroupAtType = (conversationID: string) => {
        calls.resets.push(conversationID);
        return result(null) as never;
      };
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
      const current = useConversationStore.getState().currentConversation;
      useConversationStore.setState({
        currentConversation: {
          ...current,
          conversationType: 3,
          groupID: "preview-group",
          groupAtType,
        },
        currentGroupInfo: {
          groupID: "preview-group",
          groupName: "产品评审",
          memberCount: members.length,
        },
        currentMemberInGroup: members[2],
      });
      const { updateOneMessage } = await import(
        "/src/pages/chat/queryChat/useHistoryMessageList.tsx"
      );
      groupMessages.forEach(updateOneMessage);
    },
    { groupAtType },
  );
}

for (const viewport of [
  { width: 1100, height: 760 },
  { width: 390, height: 844 },
]) {
  test(`selects a group member by remark and sends its group nickname at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await prepareGroup(page);

    const editor = page.locator('.ck-content[contenteditable="true"]');
    await editor.click();
    await editor.pressSequentially("@产品");
    const picker = page.locator("[data-mention-picker]");
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("option", { name: "产品小林" })).toBeVisible();
    await expect(picker).not.toContainText("preview-lin");
    await expect(picker).not.toContainText("preview-me");
    const box = await picker.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(8);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width - 8);
    await page.screenshot({
      path: `e2e/screenshots/mention-picker-${viewport.width}.png`,
    });
    await picker.getByRole("option", { name: "产品小林" }).click();

    await expect(editor).toContainText("@林知夏");
    await editor.pressSequentially("请看");
    await editor.press("Enter");
    await expect
      .poll(() =>
        page.evaluate(() => Reflect.get(window, "mentionJumpCalls").atMessages),
      )
      .toHaveLength(1);
    const params = await page.evaluate(
      () => Reflect.get(window, "mentionJumpCalls").atMessages[0],
    );
    expect(params).toMatchObject({
      text: "@林知夏 请看",
      atUserIDList: ["preview-lin"],
      atUsersInfo: [{ atUserID: "preview-lin", groupNickname: "林知夏" }],
    });
    await expect(page.getByRole("button", { name: "@产品小林" }).last()).toBeVisible();
    await expect(picker).toBeHidden();
  });
}

test("the mention bubble loads and jumps to a message outside the current page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await prepareGroup(page, 1);
  await page.evaluate(async () => {
    const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
    const base = Reflect.get(window, "previewGroupMessages")[0];
    const target = {
      ...base,
      clientMsgID: "off-page-mention",
      serverMsgID: "off-page-mention-server",
      contentType: 106,
      sessionType: 3,
      groupID: "preview-group",
      seq: 80,
      textElem: undefined,
      atTextElem: {
        text: "@Alex 请看评审结论",
        atUserList: ["preview-me"],
        atUsersInfo: [{ atUserID: "preview-me", groupNickname: "Alex" }],
      },
    };
    const calls = Reflect.get(window, "mentionJumpCalls");
    IMSDK.searchLocalMessages = () =>
      Promise.resolve({
        data: {
          totalCount: 1,
          searchResultItems: [
            {
              conversationID: "preview-chat-0",
              messageList: [target],
            },
          ],
        },
      });
    IMSDK.fetchSurroundingMessages = (params: Record<string, unknown>) => {
      calls.fetches.push(params);
      return Promise.resolve({ data: { messageList: [target], isEnd: true } });
    };
    const { useConversationStore } = await import("/src/store/index.ts");
    const current = useConversationStore.getState().currentConversation;
    useConversationStore.setState({
      currentConversation: { ...current, groupAtType: 3 },
    });
  });

  const jump = page.locator("[data-mention-jump]");
  await expect(jump).toBeVisible();
  await expect(jump).toHaveAttribute("aria-label", "1 条未读提及");
  await page.screenshot({ path: "e2e/screenshots/mention-jump.png" });
  await page.evaluate(() => {
    const changes: Array<{ value: string | null; time: number }> = [];
    Reflect.set(window, "spotlightChanges", changes);
    new MutationObserver((records) => {
      records.forEach((record) => {
        if (
          record.type === "attributes" &&
          (record.target as HTMLElement).id === "chat_off-page-mention"
        ) {
          changes.push({
            value: (record.target as HTMLElement).getAttribute(
              "data-quote-spotlight-target",
            ),
            time: performance.now(),
          });
        }
      });
    }).observe(document.getElementById("chat-main-content")!, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-quote-spotlight-target"],
    });
  });
  await jump.click();
  const target = page.locator("#chat_off-page-mention");
  await expect(target).toBeVisible();
  await expect(target).toBeInViewport();
  await expect(target).toHaveAttribute("data-quote-spotlight-target", "true");
  await expect(jump).toBeHidden();
  const calls = await page.evaluate(() => Reflect.get(window, "mentionJumpCalls"));
  expect(calls.finds).toBe(0);
  expect(calls.fetches[0]).toMatchObject({
    conversationID: "preview-chat-0",
    seq: 80,
    before: 10,
    after: 10,
  });
  expect(calls.resets).toEqual(["preview-chat-0"]);
});

test("a quote fetches a seq window when the source is outside the current page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await prepareGroup(page);
  await page.evaluate(async () => {
    const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
    const { updateOneMessage } = await import(
      "/src/pages/chat/queryChat/useHistoryMessageList.tsx"
    );
    const messages = Reflect.get(window, "previewGroupMessages");
    const snapshot = {
      ...messages[0],
      clientMsgID: "off-page-quote-source",
      serverMsgID: "off-page-quote-source-server",
      sessionType: 3,
      groupID: "preview-group",
      seq: 70,
      textElem: { content: "页外原消息" },
      localEx: "snapshot",
    };
    const quote = {
      ...messages[6],
      contentType: 114,
      sessionType: 3,
      groupID: "preview-group",
      textElem: undefined,
      quoteElem: { text: "引用回复", quoteMessage: snapshot },
    };
    const calls = Reflect.get(window, "mentionJumpCalls");
    IMSDK.fetchSurroundingMessages = (params: Record<string, unknown>) => {
      calls.fetches.push(params);
      return Promise.resolve({
        data: { messageList: [snapshot], isEnd: true },
      });
    };
    updateOneMessage(quote);
  });

  await page
    .locator("#chat_preview-message-6")
    .locator("button")
    .filter({ hasText: "页外原消息" })
    .click();
  const source = page.locator("#chat_off-page-quote-source");
  await expect(source).toBeVisible();
  await expect(source).toBeInViewport();
  await expect(source).toHaveAttribute("data-quote-spotlight-target", "true");
  const calls = await page.evaluate(() => Reflect.get(window, "mentionJumpCalls"));
  expect(calls.finds).toBe(0);
  expect(calls.fetches[0]).toMatchObject({
    conversationID: "preview-chat-0",
    seq: 70,
    before: 10,
    after: 10,
  });
});

test("a quote locates directly from its sequence", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await prepareGroup(page);
  await page.evaluate(async () => {
    const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
    const { updateOneMessage } = await import(
      "/src/pages/chat/queryChat/useHistoryMessageList.tsx"
    );
    const messages = Reflect.get(window, "previewGroupMessages");
    const snapshot = {
      ...messages[0],
      clientMsgID: "seq-only-quote-source",
      serverMsgID: "seq-only-quote-source-server",
      groupID: "",
      sessionType: 3,
      seq: 66,
      textElem: { content: "按序号拉取的原消息" },
    };
    const fetchedSource = { ...snapshot, groupID: "preview-group" };
    const quote = {
      ...messages[6],
      contentType: 114,
      sessionType: 3,
      groupID: "preview-group",
      textElem: undefined,
      quoteElem: { text: "引用回复", quoteMessage: snapshot },
    };
    const calls = Reflect.get(window, "mentionJumpCalls");
    IMSDK.fetchSurroundingMessages = (params: Record<string, unknown>) => {
      calls.fetches.push(params);
      return Promise.resolve({
        data: { messageList: [fetchedSource], isEnd: false },
      });
    };
    updateOneMessage(quote);
  });

  await page
    .locator("#chat_preview-message-6")
    .locator("button")
    .filter({ hasText: "按序号拉取的原消息" })
    .click();

  const source = page.locator("#chat_seq-only-quote-source");
  await expect(source).toBeVisible();
  await expect(source).toBeInViewport();
  await expect(source).toHaveAttribute("data-quote-spotlight-target", "true");
  const calls = await page.evaluate(() => Reflect.get(window, "mentionJumpCalls"));
  expect(calls.finds).toBe(0);
  expect(calls.fetches).toHaveLength(1);
  expect(calls.fetches[0]).toMatchObject({
    conversationID: "preview-chat-0",
    seq: 66,
    before: 10,
    after: 10,
  });
});

test("a located history window loads newer messages until the latest message", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await prepareGroup(page);
  await page.evaluate(async () => {
    const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
    const { updateOneMessage } = await import(
      "/src/pages/chat/queryChat/useHistoryMessageList.tsx"
    );
    const messages = Reflect.get(window, "previewGroupMessages");
    const base = messages[0];
    const makeMessage = (seq: number) => ({
      ...base,
      clientMsgID: `newer-${seq}`,
      serverMsgID: `newer-server-${seq}`,
      seq,
      sendTime: base.sendTime + seq * 1000,
      createTime: base.createTime + seq * 1000,
      textElem: { content: `消息 ${seq}` },
    });
    const source = makeMessage(70);
    const quote = {
      ...messages[6],
      contentType: 114,
      textElem: undefined,
      quoteElem: { text: "引用回复", quoteMessage: source },
    };
    const calls = Reflect.get(window, "mentionJumpCalls");
    IMSDK.fetchSurroundingMessages = (params: Record<string, unknown>) => {
      calls.fetches.push(params);
      return Promise.resolve({
        data: {
          messageList: Array.from({ length: 21 }, (_, index) =>
            makeMessage(60 + index),
          ),
        },
      });
    };
    IMSDK.getAdvancedHistoryMessageListReverse = ({
      startClientMsgID,
    }: {
      startClientMsgID: string;
    }) => {
      calls.newerStarts.push(startClientMsgID);
      const startSeq = Number(startClientMsgID.replace("newer-", ""));
      const endSeq = startSeq === 80 ? 100 : 105;
      return Promise.resolve({
        data: {
          messageList: Array.from({ length: endSeq - startSeq }, (_, index) =>
            makeMessage(startSeq + index + 1),
          ),
          isEnd: endSeq === 105,
        },
      });
    };
    updateOneMessage(quote);
  });

  await page
    .locator("#chat_preview-message-6")
    .locator("button")
    .filter({ hasText: "消息 70" })
    .click();
  await expect(page.locator("#chat_newer-70")).toBeInViewport();

  const scroller = page.locator("#chat-list");
  await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "mentionJumpCalls").newerStarts),
    )
    .toContain("newer-80");

  await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "mentionJumpCalls").newerStarts),
    )
    .toEqual(["newer-80", "newer-100"]);
  await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect(page.locator("#chat_newer-105")).toBeInViewport();
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => Reflect.get(window, "mentionJumpCalls").newerStarts),
  ).toEqual(["newer-80", "newer-100"]);
});

test("a located window stops loading older history when a page adds no messages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await prepareGroup(page);
  await page.evaluate(async () => {
    const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
    const { updateOneMessage } = await import(
      "/src/pages/chat/queryChat/useHistoryMessageList.tsx"
    );
    const messages = Reflect.get(window, "previewGroupMessages");
    const base = messages[0];
    const makeMessage = (seq: number) => ({
      ...base,
      clientMsgID: `older-${seq}`,
      serverMsgID: `older-server-${seq}`,
      seq,
      sendTime: base.sendTime + seq * 1000,
      createTime: base.createTime + seq * 1000,
      textElem: { content: `消息 ${seq}` },
    });
    const source = makeMessage(70);
    const quote = {
      ...messages[6],
      contentType: 114,
      textElem: undefined,
      quoteElem: { text: "引用回复", quoteMessage: source },
    };
    const calls = Reflect.get(window, "mentionJumpCalls");
    IMSDK.fetchSurroundingMessages = () =>
      Promise.resolve({
        data: {
          messageList: Array.from({ length: 21 }, (_, index) =>
            makeMessage(60 + index),
          ),
        },
      });
    IMSDK.getAdvancedHistoryMessageList = ({
      startClientMsgID,
    }: {
      startClientMsgID: string;
    }) => {
      calls.olderStarts.push(startClientMsgID);
      return Promise.resolve({
        data: { messageList: [makeMessage(60)], isEnd: false },
      });
    };
    updateOneMessage(quote);
  });

  await page
    .locator("#chat_preview-message-6")
    .locator("button")
    .filter({ hasText: "消息 70" })
    .click();
  await expect(page.locator("#chat_older-70")).toBeInViewport();

  const scroller = page.locator("#chat-list");
  await scroller.evaluate((element) => element.scrollTo({ top: 0 }));
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "mentionJumpCalls").olderStarts),
    )
    .toEqual(["older-60"]);

  await scroller.evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight });
    element.scrollTo({ top: 0 });
  });
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => Reflect.get(window, "mentionJumpCalls").olderStarts),
  ).toEqual(["older-60"]);
});

test("message avatars and mentions open the existing user card flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await prepareGroup(page);
  await page.evaluate(async () => {
    const calls: Array<{ userID?: string; groupID?: string }> = [];
    Reflect.set(window, "profileOpenCalls", calls);
    window.userClick = (userID?: string, groupID?: string) => {
      calls.push({ userID, groupID });
    };
  });

  await page.locator('[data-message-avatar="preview-me"]').last().click();

  const editor = page.locator('.ck-content[contenteditable="true"]');
  await editor.click();
  await editor.pressSequentially("@产品");
  await page
    .locator("[data-mention-picker]")
    .getByRole("option", { name: "产品小林" })
    .click();
  await editor.press("Enter");
  const mention = page.getByRole("button", { name: "@产品小林" }).last();
  await expect(mention).toHaveClass(/message-mention/);
  await mention.click();

  const calls = await page.evaluate(() => Reflect.get(window, "profileOpenCalls"));
  expect(calls).toEqual([
    { userID: "preview-me", groupID: "preview-group" },
    { userID: "preview-lin", groupID: "preview-group" },
  ]);
});

for (const viewport of [
  { width: 1100, height: 760 },
  { width: 390, height: 844 },
]) {
  test(`opens a conversation at the unread boundary and lets the user jump to latest at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(`${baseURL}/ui-preview.html`);
    await expect(page.locator("[data-chat-message-row]")).toHaveCount(7);

    await page.evaluate(async () => {
      const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
      const { useConversationStore } = await import("/src/store/index.ts");
      const base = (
        await IMSDK.getAdvancedHistoryMessageList({ conversationID: "preview-chat-0" })
      ).data.messageList[0];
      const messages = Array.from({ length: 30 }, (_, index) => ({
        ...base,
        clientMsgID: `unread-position-${index}`,
        serverMsgID: `unread-position-server-${index}`,
        seq: index + 1,
        sendTime: base.sendTime + index * 1000,
        createTime: base.createTime + index * 1000,
        textElem: {
          content:
            index === 29
              ? "最新消息 https://example.com/review"
              : index === 5
              ? "第一条未读"
              : `历史消息 ${index + 1}`,
        },
      }));
      const quoteMessage = {
        ...messages[5],
        contentType: 114,
        quoteElem: {
          text: "引用回复",
          quoteMessage: { ...messages[4] },
        },
      };
      messages[5] = quoteMessage;
      const calls = Reflect.get(window, "unreadPositionCalls") ?? {
        historyCounts: [] as number[],
        finds: 0,
      };
      Reflect.set(window, "unreadPositionCalls", calls);
      IMSDK.getAdvancedHistoryMessageList = ({ count }: { count: number }) => {
        calls.historyCounts.push(count);
        return Promise.resolve({
          data: { messageList: messages.slice(-count), isEnd: true },
        });
      };
      IMSDK.findMessageList = () => {
        calls.finds += 1;
        return Promise.resolve({ data: { findResultItems: [] } });
      };
      const current = useConversationStore.getState().currentConversation;
      const conversation = {
        ...current!,
        conversationID: "unread-position-chat",
        unreadCount: 25,
        readSeq: 5,
      };
      useConversationStore.setState((state) => ({
        conversationList: [...state.conversationList, conversation],
        currentConversation: conversation,
      }));
      location.hash = "/chat/unread-position-chat";
    });

    await expect
      .poll(() =>
        page.evaluate(() => Reflect.get(window, "unreadPositionCalls").historyCounts),
      )
      .toContain(35);
    const divider = page.locator("[data-unread-divider]");
    await expect(divider).toBeVisible();
    await expect(divider).toHaveText("未读消息");
    await expect(page.locator("#chat_unread-position-5")).toBeVisible();
    await expect(page.locator("#chat_unread-position-29")).not.toBeInViewport();
    const jump = page.locator("[data-jump-to-latest]");
    await expect(jump).toBeVisible();
    await expect(jump).toHaveAttribute("aria-label", "跳到最新消息");
    await expect(jump).toContainText("25");
    await page.screenshot({
      path: `e2e/screenshots/unread-boundary-${viewport.width}.png`,
    });

    const quotedTarget = page.locator("#chat_unread-position-4");
    await expect(quotedTarget).toBeAttached();
    await expect(quotedTarget).not.toBeInViewport();

    await page
      .locator("#chat_unread-position-5")
      .locator("button")
      .filter({ hasText: "历史消息 5" })
      .click();
    await expect(quotedTarget).toBeVisible();
    await expect(quotedTarget).toBeInViewport();
    await expect(quotedTarget).toHaveAttribute("data-quote-spotlight-target", "true");
    expect(
      await page.evaluate(() => Reflect.get(window, "unreadPositionCalls").finds),
    ).toBe(0);
    await expect(
      page.getByText("无法定位该消息，消息可能已被删除或未同步"),
    ).toHaveCount(0);

    await jump.click();
    await expect(page.locator("#chat_unread-position-29")).toBeInViewport();
    await expect(jump).toBeHidden();
    const link = page.getByRole("link", { name: "https://example.com/review" });
    await expect(link).toHaveAttribute("href", "https://example.com/review");
    await expect(link).toHaveAttribute("target", "_blank");
  });
}

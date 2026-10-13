import { expect, test } from "@playwright/test";

const baseURL = process.env.ABD_UI_BASE_URL || "http://localhost:5180";

test("the installed SDK keeps message synchronization running after login", async ({
  page,
}) => {
  const wsAddr = baseURL.replace(/^http/, "ws") + "/sdk-session-test";
  let syncRequests = 0;
  let completeLogin!: () => void;
  const loginComplete = new Promise<void>((resolve) => {
    completeLogin = resolve;
  });
  await page.routeWebSocket(
    (url) => url.href.startsWith(wsAddr),
    async (socket) => {
      socket.onMessage((message) => {
        if (typeof message !== "string") syncRequests++;
      });
      await loginComplete;
      socket.send(JSON.stringify({ errCode: 0 }));
    },
  );
  await page.goto(`${baseURL}/#/login`);
  const result = await page.evaluate(
    async ({ apiAddr, wsAddr }) => {
      const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
      await IMSDK.login({
        userID: `session-test-${crypto.randomUUID()}`,
        token: "test-token",
        platformID: 5,
        apiAddr,
        wsAddr,
        isLogStandardOutput: false,
      });
      const conversationID = "si_session_test";
      const inserted = JSON.parse(
        await window.insertConversation(
          JSON.stringify({
            conversationID,
            conversationType: 1,
            userID: "contact",
            showName: "Test contact",
            latestMsgSendTime: 1,
          }),
        ),
      );
      const { data } = await IMSDK.getConversationListSplit({ offset: 0, count: 10 });
      return { inserted, conversations: data.map((item) => item.conversationID) };
    },
    { apiAddr: baseURL, wsAddr },
  );
  expect(result.inserted.errCode).toBe(0);
  expect(result.conversations).toEqual(["si_session_test"]);
  completeLogin();
  await expect.poll(() => syncRequests).toBeGreaterThan(0);
});

test("the installed SDK loads its database worker and mention API", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("requestfailed", (request) => failures.push(request.url()));
  await page.goto(baseURL);
  const result = await page.evaluate(async () => {
    const { IMSDK } = await import("/src/layout/MainContentWrap.tsx");
    const init = await window.initDB(`mention-test-${crypto.randomUUID()}`, "");
    const conversationID = "sg_empty";
    const check = (raw: string) => {
      const response = JSON.parse(raw);
      if (response.errCode !== 0) throw new Error(JSON.stringify(response));
      return response.data;
    };
    check(
      await window.insertConversation(
        JSON.stringify({ conversationID, readSeq: 4, unreadCount: 2 }),
      ),
    );
    const setCount = async (unreadMentionCount: number) =>
      check(
        await window.updateColumnsConversation(
          conversationID,
          JSON.stringify({ unreadMentionCount }),
        ),
      );
    const count = async () =>
      JSON.parse(check(await window.getConversation(conversationID)))
        .unreadMentionCount as number;
    await setCount(3);
    check(
      await window.batchInsertMessageList(
        conversationID,
        JSON.stringify([{ clientMsgID: "m10", seq: 10, status: 2 }]),
      ),
    );
    const message = JSON.parse(check(await window.getMessage(conversationID, "m10")));
    const beforeRead = await count();
    await setCount(2);
    const afterRead = await count();
    await setCount(0);
    const conversation = JSON.parse(
      check(await window.getConversation(conversationID)),
    );
    return {
      init: JSON.parse(init),
      message,
      beforeRead,
      afterRead,
      conversation,
      methods: [
        typeof IMSDK.getUnreadMentions,
        typeof IMSDK.markMentionsRead,
        typeof IMSDK.markAllMentionsRead,
      ],
    };
  });
  expect(result.init.errCode).toBe(0);
  expect(result.message).toMatchObject({ clientMsgID: "m10", seq: 10 });
  expect(result.message).not.toHaveProperty("containsUnreadMention");
  expect(result.beforeRead).toBe(3);
  expect(result.afterRead).toBe(2);
  expect(result.conversation).toMatchObject({
    readSeq: 4,
    unreadCount: 2,
    unreadMentionCount: 0,
  });
  expect(result.methods).toEqual(["function", "function", "function"]);
  expect(failures).toEqual([]);
});

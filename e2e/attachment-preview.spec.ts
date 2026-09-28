import { expect, test, type Page } from "@playwright/test";

const previewURL = `${
  process.env.ABD_UI_BASE_URL || "http://localhost:5180"
}/ui-preview.html`;
const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=";

test.beforeEach(async ({ page }) => {
  await page.route("**/__fixtures/uploaded/**", async (route) => {
    const name = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/").pop()!,
    );
    const bytes = await page.evaluate(
      (name) => Reflect.get(window, "attachmentTest").uploadedBodies[name],
      name,
    );
    await route.fulfill({
      contentType: name.endsWith(".png") ? "image/png" : "text/plain",
      body: Buffer.from(bytes),
    });
  });
  await page.goto(previewURL);
  await expect(page.locator(".ck-editor__editable")).toBeVisible();
  await page.evaluate(async () => {
    const sdkURL = "/src/layout/MainContentWrap.tsx";
    const storeURL = "/src/store/index.ts";
    const { IMSDK } = await import(sdkURL);
    const { useConversationStore } = await import(storeURL);
    const base = JSON.parse(
      useConversationStore.getState().conversationList[0].latestMsg,
    );
    const state = {
      prepared: [] as string[],
      uploaded: [] as string[],
      uploadedBodies: {} as Record<string, number[]>,
      failSend: false,
      sent: [] as Array<{ recvID: string; message: { clientMsgID: string } }>,
      fail: "",
      hold: false,
      release: () => {},
    };
    Reflect.set(window, "attachmentTest", state);
    let sequence = 0;
    const prepare = async (
      options: { file: File; sourceUrl: string; sourcePicture: object },
      image: boolean,
    ) => {
      state.prepared.push(options.file.name);
      if (state.fail === options.file.name) throw new Error("Preparation failed");
      if (state.hold)
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
      return {
        data: {
          ...base,
          clientMsgID: `attachment-${++sequence}`,
          contentType: image ? 102 : 105,
          ...(image
            ? { pictureElem: { sourcePicture: options.sourcePicture } }
            : {
                fileElem: {
                  fileName: options.file.name,
                  fileSize: options.file.size,
                  sourceUrl: options.sourceUrl,
                },
              }),
        },
      };
    };
    IMSDK.createFileMessageByFile = (options: Parameters<typeof prepare>[0]) =>
      prepare(options, false);
    IMSDK.createImageMessageByFile = (options: Parameters<typeof prepare>[0]) =>
      prepare(options, true);
    IMSDK.uploadFile = async ({ file }: { file: File }) => {
      state.uploaded.push(file.name);
      state.uploadedBodies[file.name] = Array.from(
        new Uint8Array(await file.arrayBuffer()),
      );
      if (state.fail === file.name) throw new Error("Upload failed");
      if (state.hold)
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
      return {
        data: {
          url: `${location.origin}/__fixtures/uploaded/${encodeURIComponent(
            file.name,
          )}`,
        },
      };
    };
    IMSDK.createImageMessageByURL = (options: {
      sourcePicture: object;
      bigPicture: object;
      snapshotPicture: object;
    }) =>
      Promise.resolve({
        data: {
          ...base,
          clientMsgID: `attachment-${++sequence}`,
          contentType: 102,
          pictureElem: options,
        },
      });
    IMSDK.createFileMessageByURL = (options: object) =>
      Promise.resolve({
        data: {
          ...base,
          clientMsgID: `attachment-${++sequence}`,
          contentType: 105,
          fileElem: options,
        },
      });
    IMSDK.createMergerMessage = (options: {
      messageList: object[];
      title: string;
      summaryList: string[];
    }) =>
      Promise.resolve({
        data: {
          ...base,
          clientMsgID: `combined-${++sequence}`,
          contentType: 107,
          mergeElem: {
            multiMessage: options.messageList,
            title: options.title,
            abstractList: options.summaryList,
          },
        },
      });
    IMSDK.createForwardMessage = (message: object) =>
      Promise.resolve({
        data: {
          ...message,
          clientMsgID: `forward-${++sequence}`,
        },
      });
    IMSDK.sendMessage = (params: {
      recvID: string;
      message: { clientMsgID: string };
    }) => {
      state.sent.push(params);
      if (state.failSend) return Promise.reject(new Error("Send failed"));
      return Promise.resolve({ data: { ...params.message, status: 2 } });
    };
  });
});

async function attach(page: Page, names: string[], event = "paste") {
  await page.locator(".ck-editor__editable").evaluate(
    (element, { names, event }) => {
      const transfer = new DataTransfer();
      for (const name of names) {
        const image = name.endsWith(".png");
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#d8e8f6";
        context.fillRect(0, 0, 320, 180);
        context.fillStyle = "#426280";
        context.font = "24px sans-serif";
        context.fillText("ABD IM", 110, 98);
        const content = image
          ? Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]), (char) =>
              char.charCodeAt(0),
            )
          : "local test file";
        transfer.items.add(
          new File([content], name, { type: image ? "image/png" : "text/plain" }),
        );
      }
      element.dispatchEvent(
        event === "paste"
          ? new ClipboardEvent("paste", {
              bubbles: true,
              cancelable: true,
              clipboardData: transfer,
            })
          : new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer: transfer,
            }),
      );
    },
    { names, event },
  );
}

async function sentCount(page: Page) {
  return page.evaluate(
    () => Reflect.get(window, "attachmentTest").sent.length as number,
  );
}

test("paste, drop and upload append inside the composer without sending or losing text", async ({
  page,
}) => {
  const editor = page.locator(".ck-editor__editable");
  await editor.fill("这是一起发送的说明文字");
  await attach(page, ["screenshot.png", "notes.txt"]);
  await attach(page, ["dropped.txt"], "drop");
  await page.locator('input[type="file"][accept="*"]').setInputFiles({
    name: "picked.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("picked"),
  });
  const attachments = page.getByRole("list", { name: "待发送附件" });
  await expect(attachments.getByRole("listitem")).toHaveCount(4);
  await expect(attachments.getByRole("img", { name: "screenshot.png" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, "attachmentTest").prepared),
  ).toEqual([]);
  expect(
    await page.evaluate(() => Reflect.get(window, "attachmentTest").uploaded),
  ).toEqual([]);
  expect(await sentCount(page)).toBe(0);
  await attachments.getByRole("button", { name: "移除 dropped.txt" }).click();
  await expect(attachments.getByRole("listitem")).toHaveCount(3);
  await expect(editor).toHaveText("这是一起发送的说明文字");
  await expect(page.getByRole("combobox", { name: "发送方式" })).toHaveValue(
    "combined",
  );
  await page.screenshot({
    path: "/tmp/abd-37-inline-composer.png",
    animations: "disabled",
  });
  for (const name of ["screenshot.png", "notes.txt", "picked.txt"]) {
    await attachments.getByRole("button", { name: `移除 ${name}` }).click();
  }
  await expect(attachments).toHaveCount(0);
  await expect(editor).toHaveText("这是一起发送的说明文字");
});

test("combined mode uploads all attachments then sends one message with one reply target", async ({
  page,
}) => {
  await page.locator(".ck-editor__editable").fill("一条图文消息");
  await attach(page, ["photo.png", "notes.txt"]);
  await page
    .getByRole("button", { name: "发送", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect.poll(() => sentCount(page)).toBe(1);
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
  await expect(page.locator(".ck-editor__editable")).toHaveText("");
  const sent = await page.evaluate(
    () => Reflect.get(window, "attachmentTest").sent[0].message,
  );
  expect(sent.contentType).toBe(107);
  expect(JSON.parse(sent.ex)).toEqual({ abdComposite: { version: 1 } });
  expect(sent.mergeElem.multiMessage).toHaveLength(3);
  expect(sent.mergeElem.multiMessage[0].textElem.content).toBe("一条图文消息");
  expect(sent.mergeElem.multiMessage[1].pictureElem.sourcePicture.url).toMatch(/^http/);
  expect(sent.mergeElem.multiMessage[2].fileElem.sourceUrl).toMatch(/^http/);
  const row = page.locator(`#chat_${sent.clientMsgID}`);
  await expect(row.getByTestId("composite-message")).toContainText("一条图文消息");
  await expect(row.getByTestId("composite-message")).toContainText("notes.txt");
  await expect(row.locator(".message-image img")).toBeVisible();
  await expect(row).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: "/tmp/abd-37-combined-message.png",
    animations: "disabled",
  });
  await row.getByTestId("composite-message").hover();
  await row.getByRole("button", { name: "回复", exact: true }).click();
  await expect(page.getByTestId("composer-reply")).toContainText("一条图文消息");
  const quote = await page.evaluate(async () => {
    const url = "/src/store/index.ts";
    return (await import(url)).useConversationStore.getState().quoteMessage.message;
  });
  expect(quote.clientMsgID).toBe(sent.clientMsgID);
  expect(quote.mergeElem.multiMessage).toHaveLength(3);
  await page.getByRole("button", { name: "取消 回复", exact: true }).click();
  await row.getByTestId("composite-message").hover();
  await row.getByRole("button", { name: "查看更多", exact: true }).click();
  await page.getByRole("menuitem", { name: "转发", exact: true }).click();
  const forwardDialog = page.getByRole("dialog", { name: "转发给" });
  await expect(forwardDialog).toContainText("1 条消息");
  await forwardDialog.getByRole("button", { name: /陈亦舟/ }).click();
  await forwardDialog.getByRole("button", { name: /确\s*认/ }).click();
  await expect.poll(() => sentCount(page)).toBe(2);
  const forwarded = await page.evaluate(
    () => Reflect.get(window, "attachmentTest").sent[1],
  );
  expect(forwarded.recvID).toBe("preview-chen");
  expect(forwarded.message.ex).toBe(sent.ex);
  expect(forwarded.message.mergeElem.multiMessage).toHaveLength(3);
});

test("separate mode sends text and each attachment individually", async ({ page }) => {
  await page.locator(".ck-editor__editable").fill("分别发送的说明");
  await attach(page, ["first.txt", "second.png"]);
  await page.getByRole("combobox", { name: "发送方式" }).selectOption("separate");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => sentCount(page)).toBe(3);
  const types = await page.evaluate(() =>
    Reflect.get(window, "attachmentTest").sent.map(
      (item: { message: { contentType: number } }) => item.message.contentType,
    ),
  );
  expect(types).toEqual([101, 105, 102]);
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
  await expect(page.locator(".ck-editor__editable")).toHaveText("");
});

test("mentions clearly use separate sending and keep the native mention notification", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const sdkURL = "/src/layout/MainContentWrap.tsx";
    const storeURL = "/src/store/index.ts";
    const { IMSDK } = await import(sdkURL);
    const { useConversationStore } = await import(storeURL);
    const state = useConversationStore.getState();
    const member = {
      userID: "preview-lin",
      nickname: "林知夏",
      groupID: "preview-group",
      roleLevel: 20,
    };
    IMSDK.getGroupMemberList = IMSDK.searchGroupMembers = () =>
      Promise.resolve({ data: [member] });
    IMSDK.getSpecifiedGroupMembersInfo = () => Promise.resolve({ data: [member] });
    const base = JSON.parse(state.conversationList[0].latestMsg);
    IMSDK.createTextAtMessage = (params: {
      text: string;
      atUserIDList: string[];
      atUsersInfo: unknown[];
    }) =>
      Promise.resolve({
        data: {
          ...base,
          clientMsgID: "mention-with-attachment",
          contentType: 106,
          atTextElem: {
            text: params.text,
            atUserList: params.atUserIDList,
            atUsersInfo: params.atUsersInfo,
          },
        },
      });
    const conversation = {
      ...state.currentConversation,
      conversationType: 3,
      groupID: "preview-group",
    };
    useConversationStore.setState({
      currentConversation: conversation,
      conversationList: state.conversationList.map((item: { conversationID: string }) =>
        item.conversationID === conversation.conversationID ? conversation : item,
      ),
      conversationKinds: { ...state.conversationKinds, "preview-group": "chat" },
      currentGroupInfo: {
        groupID: "preview-group",
        groupName: "测试群",
        memberCount: 2,
      },
    });
  });
  await page.locator(".ck-editor__editable").pressSequentially("@林");
  await page
    .locator("[data-mention-picker]")
    .getByRole("option", { name: "林知夏" })
    .click();
  await attach(page, ["mention.txt"]);
  const mode = page.getByRole("combobox", { name: "发送方式" });
  await expect(mode).toHaveValue("separate");
  await expect(mode).toBeDisabled();
  await expect(page.locator(".composer-mention-hint")).toContainText(
    "确保对方收到提醒",
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => sentCount(page)).toBe(2);
  const sent = await page.evaluate(() => Reflect.get(window, "attachmentTest").sent);
  expect(sent[0].message.contentType).toBe(106);
  expect(sent[0].message.atTextElem.atUserList).toEqual(["preview-lin"]);
  expect(sent[1].message.contentType).toBe(105);
});

test("switching conversations preserves each attachment draft", async ({ page }) => {
  await page.locator(".ck-editor__editable").fill("原会话草稿");
  await attach(page, ["original.txt"], "drop");
  await page.evaluate(() => {
    location.hash = "/chat/preview-chat-1";
  });
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
  await attach(page, ["other.txt"]);
  await page.evaluate(() => {
    location.hash = "/chat/preview-chat-0";
  });
  await expect(page.getByRole("list", { name: "待发送附件" })).toContainText(
    "original.txt",
  );
  await expect(page.getByRole("list", { name: "待发送附件" })).not.toContainText(
    "other.txt",
  );
  await expect(page.locator(".ck-editor__editable")).toHaveText("原会话草稿");
  expect(await sentCount(page)).toBe(0);
});

test("an in-flight group keeps its recipient and does not clear the new conversation draft", async ({
  page,
}) => {
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").hold = true;
  });
  await page.locator(".ck-editor__editable").fill("原会话说明");
  await attach(page, ["original-recipient.txt"]);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "attachmentTest").uploaded.length),
    )
    .toBe(1);
  await page.evaluate(() => {
    location.hash = "/chat/preview-chat-1";
  });
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
  await page.locator(".ck-editor__editable").fill("新会话说明");
  await attach(page, ["new-conversation.txt"]);
  await page.evaluate(() => Reflect.get(window, "attachmentTest").release());
  await expect.poll(() => sentCount(page)).toBe(1);
  expect(
    await page.evaluate(() => Reflect.get(window, "attachmentTest").sent[0].recvID),
  ).toBe("preview-lin");
  await expect(page.locator("#chat-list")).not.toContainText("original-recipient.txt");
  await expect(page.getByRole("list", { name: "待发送附件" })).toContainText(
    "new-conversation.txt",
  );
  await expect(page.locator(".ck-editor__editable")).toHaveText("新会话说明");
});

test("returning to an uploading conversation clears its remounted editor when sent", async ({
  page,
}) => {
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").hold = true;
  });
  await page.locator(".ck-editor__editable").fill("上传中切换会话");
  await attach(page, ["pending.txt"]);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "attachmentTest").uploaded.length),
    )
    .toBe(1);
  await page.evaluate(() => {
    location.hash = "/chat/preview-chat-1";
  });
  await expect(page.locator(".ck-editor__editable")).toHaveText("");
  await page.evaluate(() => {
    location.hash = "/chat/preview-chat-0";
  });
  await expect(page.locator(".ck-editor__editable")).toHaveText("上传中切换会话");
  await expect(page.locator(".ck-editor__editable")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await page.evaluate(() => Reflect.get(window, "attachmentTest").release());
  await expect.poll(() => sentCount(page)).toBe(1);
  await expect(page.locator(".ck-editor__editable")).toHaveText("");
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
});

test("failed grouped transmission retries the same message without uploading again", async ({
  page,
}) => {
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").failSend = true;
  });
  await page.locator(".ck-editor__editable").fill("图文消息重试");
  await attach(page, ["retry-group.txt"]);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => sentCount(page)).toBe(1);
  const id = await page.evaluate(
    () => Reflect.get(window, "attachmentTest").sent[0].message.clientMsgID,
  );
  const retry = page
    .locator(`#chat_${id}`)
    .getByRole("button", { name: "重试", exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").failSend = false;
  });
  await retry.click();
  await expect.poll(() => sentCount(page)).toBe(2);
  await expect(retry).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, "attachmentTest").uploaded),
  ).toEqual(["retry-group.txt"]);
  expect(
    await page.evaluate(
      () => Reflect.get(window, "attachmentTest").sent[1].message.clientMsgID,
    ),
  ).toBe(id);
});

test("group preparation failure retains the full draft and reuses completed uploads on retry", async ({
  page,
}) => {
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").fail = "retry.txt";
  });
  await page.locator(".ck-editor__editable").fill("失败时保留文字");
  await attach(page, ["success.txt", "retry.txt"]);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "attachmentTest").uploaded.length),
    )
    .toBe(2);
  await expect(page.getByRole("button", { name: "发送", exact: true })).toBeEnabled();
  await expect(
    page.getByRole("list", { name: "待发送附件" }).getByRole("listitem"),
  ).toHaveCount(2);
  await expect(page.locator(".ck-editor__editable")).toHaveText("失败时保留文字");
  expect(await sentCount(page)).toBe(0);
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").fail = "";
  });
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => sentCount(page)).toBe(1);
  expect(
    await page.evaluate(() => Reflect.get(window, "attachmentTest").uploaded),
  ).toEqual(["success.txt", "retry.txt", "retry.txt"]);
});

test("separate preparation failure keeps unattempted files and never repeats successful messages", async ({
  page,
}) => {
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").fail = "retry.txt";
  });
  await attach(page, ["success.txt", "retry.txt", "last.txt"]);
  await page.getByRole("combobox", { name: "发送方式" }).selectOption("separate");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "待发送附件" }).getByRole("listitem"),
  ).toHaveCount(2);
  expect(await sentCount(page)).toBe(1);
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").fail = "";
  });
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => sentCount(page)).toBe(3);
  await expect(page.getByRole("list", { name: "待发送附件" })).toHaveCount(0);
});

test("pending attachments and uploads block desktop update installation", async ({
  page,
}) => {
  await attach(page, ["pending.txt"]);
  const exitStatus = () =>
    page.evaluate(async () => {
      const url = "/src/utils/desktopTasks.ts";
      return (await import(url)).prepareDesktopExit();
    });
  expect(await exitStatus()).toBe("busy");
  await page.evaluate(() => {
    Reflect.get(window, "attachmentTest").hold = true;
  });
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "attachmentTest").prepared.length),
    )
    .toBe(1);
  expect(await exitStatus()).toBe("busy");
  await page.evaluate(() => Reflect.get(window, "attachmentTest").release());
  await expect.poll(() => sentCount(page)).toBe(1);
  await expect.poll(exitStatus).toBe("ready");
});

async function addFileMessage(page: Page, name: string, size = 128) {
  await page.evaluate(
    async ({ name, size }) => {
      const storeURL = "/src/store/index.ts";
      const historyURL = "/src/pages/chat/queryChat/useHistoryMessageList.tsx";
      const { useConversationStore } = await import(storeURL);
      const { pushNewMessage } = await import(historyURL);
      const base = JSON.parse(
        useConversationStore.getState().conversationList[0].latestMsg,
      );
      pushNewMessage({
        ...base,
        clientMsgID: "file-preview-test",
        contentType: 105,
        seq: 100,
        sendTime: Date.now(),
        fileElem: {
          fileName: name,
          fileSize: size,
          sourceUrl: `${location.origin}/__fixtures/preview`,
        },
      });
    },
    { name, size },
  );
  await page
    .locator("#chat_file-preview-test")
    .getByRole("button", { name: new RegExp(name.replace(/\./g, "\\.")) })
    .click();
}

test("Markdown files preview formatted content and safe links inside the app", async ({
  page,
}) => {
  await page.route("**/__fixtures/preview", (route) =>
    route.fulfill({
      contentType: "text/markdown",
      body: "# 文件预览\n\n| 项目 | 状态 |\n| --- | --- |\n| ABD-35 | 完成 |\n\n- [x] 已预览\n\n[链接](https://example.com)\n\n<script>window.previewInjected = true</script>",
    }),
  );
  await addFileMessage(page, "README.md");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "文件预览" })).toBeVisible();
  await expect(dialog.getByRole("table")).toContainText("ABD-35");
  await expect(dialog.getByRole("checkbox")).toBeChecked();
  await expect(dialog.getByRole("link", { name: "链接", exact: true })).toHaveAttribute(
    "target",
    "_blank",
  );
  expect(
    await page.evaluate(() => Reflect.get(window, "previewInjected")),
  ).toBeUndefined();
  await expect(dialog.getByRole("link", { name: "下载文件" })).toBeVisible();
  await page.screenshot({
    path: "/tmp/abd-35-markdown-preview.png",
    animations: "disabled",
  });
});

test("HTML files are displayed as text and never executed", async ({ page }) => {
  await page.route("**/__fixtures/preview", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Untrusted HTML</h1><script>window.previewInjected = true</script>",
    }),
  );
  await addFileMessage(page, "example.html");
  await expect(page.getByRole("dialog").locator("pre")).toContainText(
    "<h1>Untrusted HTML</h1>",
  );
  expect(
    await page.evaluate(() => Reflect.get(window, "previewInjected")),
  ).toBeUndefined();
});

test("failed previews can retry, while unsupported and oversized files offer downloads", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/__fixtures/preview", (route) =>
    route.fulfill(
      ++attempts === 1
        ? { status: 500, body: "failed" }
        : { contentType: "text/plain", body: "预览已恢复" },
    ),
  );
  await addFileMessage(page, "retry.txt");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("预览加载失败");
  await dialog.getByRole("button", { name: "重新加载" }).click();
  await expect(dialog.locator("pre")).toHaveText("预览已恢复");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
});

for (const [name, size, expected] of [
  ["archive.zip", 1024, "暂不支持"],
  ["huge.md", 3 * 1024 * 1024, "文件超过 2 MB"],
] as const) {
  test(`${name} shows a download fallback without fetching content`, async ({
    page,
  }) => {
    let requests = 0;
    await page.route("**/__fixtures/preview", (route) => {
      requests++;
      return route.abort();
    });
    await addFileMessage(page, name, size);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(expected);
    await expect(dialog.getByRole("link", { name: "下载文件" })).toBeVisible();
    expect(requests).toBe(0);
  });
}

test("image files preview without opening a new window", async ({ page }) => {
  await page.route("**/__fixtures/preview", (route) =>
    route.fulfill({ contentType: "image/png", body: Buffer.from(pixel, "base64") }),
  );
  await addFileMessage(page, "photo.png");
  const image = page.getByRole("dialog").getByRole("img", { name: "photo.png" });
  await expect(image).toBeVisible();
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  expect(page.context().pages()).toHaveLength(1);
});

test("PDF files render a page inside the app instead of navigating away", async ({
  page,
}) => {
  const content = "BT /F1 24 Tf 50 150 Td (ABD-35 PDF preview) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 7\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await page.route("**/__fixtures/preview", (route) =>
    route.fulfill({ contentType: "application/octet-stream", body: pdf }),
  );
  await addFileMessage(page, "document.pdf", pdf.length);
  const canvas = page.getByRole("dialog").locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("dialog").locator('[aria-busy="false"]')).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("第 1 / 2 页");
  const hasInk = await canvas.evaluate((element: HTMLCanvasElement) => {
    const pixels = element
      .getContext("2d")!
      .getImageData(0, 0, element.width, element.height).data;
    return pixels.some((value, index) => index % 4 !== 3 && value < 100);
  });
  expect(hasInk).toBe(true);
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByRole("dialog")).toContainText("第 2 / 2 页");
  await expect(page.getByRole("dialog").locator('[aria-busy="false"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "下一页" })).toBeDisabled();
  await page.getByRole("button", { name: "上一页" }).click();
  await expect(page.getByRole("dialog")).toContainText("第 1 / 2 页");
  await expect(page.getByRole("dialog").locator('[aria-busy="false"]')).toBeVisible();
  await page.screenshot({
    path: "/tmp/abd-35-pdf-preview.png",
    animations: "disabled",
  });
  expect(page.url()).toContain("/ui-preview.html");
});

test("unconfirmed attachments prevent an update restart until cancelled", async ({
  page,
}) => {
  await attach(page, ["pending.txt"]);
  await expect(page.getByRole("list", { name: "待发送附件" })).toBeVisible();
  const prepare = () =>
    page.evaluate(async () => {
      const tasksURL = "/src/utils/desktopTasks.ts";
      return (await import(tasksURL)).prepareDesktopExit();
    });
  expect(await prepare()).toBe("busy");
  await page.getByRole("button", { name: "移除 pending.txt" }).click();
  expect(await prepare()).toBe("ready");
});

test("invalid PDF content shows a recoverable error and retains the download", async ({
  page,
}) => {
  await page.route("**/__fixtures/preview", (route) =>
    route.fulfill({ contentType: "application/pdf", body: "not a PDF" }),
  );
  await addFileMessage(page, "invalid.pdf");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("预览加载失败");
  await expect(dialog.getByRole("button", { name: "重新加载" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "下载文件" })).toBeVisible();
});

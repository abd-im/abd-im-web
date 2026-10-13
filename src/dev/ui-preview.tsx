import "../index.scss";

import type {
  ComponentMessageParams,
  ComponentV2,
  ConversationItem,
  MessageItem,
  UploadFileOptions,
} from "@abd-im/wasm-client-sdk";
import axios from "axios";
import localforage from "localforage";
import ReactDOM from "react-dom/client";

const createPreviewID = () =>
  globalThis.crypto?.randomUUID?.() ||
  `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Separate development entry: production uses index.html and never imports fixtures.
async function startPreview() {
  if (!import.meta.env.DEV) return;
  if (!location.hash || location.hash.includes("login"))
    location.hash = "/chat/preview-chat-0";
  localStorage.setItem("IM_LOCALE", "zh-CN");
  await import("../i18n");
  const people = [
    { userID: "preview-lin", nickname: "林知夏", faceURL: "" },
    { userID: "preview-chen", nickname: "陈亦舟", faceURL: "" },
    { userID: "preview-su", nickname: "苏晚", faceURL: "" },
    { userID: "preview-zhou", nickname: "周予安", faceURL: "" },
    { userID: "preview-xu", nickname: "许清和", faceURL: "" },
    { userID: "preview-me", nickname: "Alex", faceURL: "" },
  ];
  const self = people[5];
  const now = Date.now();
  const textMessage = (
    content: string,
    indexOrTime: number,
    sender = people[0],
  ): MessageItem => {
    const isTimestamp = indexOrTime > 1000000000;
    const timestamp = isTimestamp ? indexOrTime : now - (12 - indexOrTime) * 60000;
    const msgID = isTimestamp ? createPreviewID() : `preview-message-${indexOrTime}`;
    const seq = isTimestamp ? 0 : indexOrTime + 1;
    return {
      clientMsgID: msgID,
      serverMsgID: isTimestamp ? msgID : `preview-server-message-${indexOrTime}`,
      createTime: timestamp,
      sendTime: timestamp,
      sessionType: 1,
      sendID: sender.userID,
      recvID: sender === self ? people[0].userID : self.userID,
      msgFrom: 100,
      contentType: 144,
      senderPlatformID: 5,
      senderNickname: sender.nickname,
      senderFaceUrl: sender.faceURL,
      groupID: "",
      content: "",
      seq,
      status: 2,
      textElem: { content },
      message: {
        id: isTimestamp ? msgID : `preview-server-message-${indexOrTime}`,
        channel_id: sender === self ? people[0].userID : self.userID,
        author: { id: sender.userID, username: sender.nickname },
        type: 0,
        timestamp: new Date(timestamp).toISOString(),
        flags: 32768,
        components: content ? [{ type: 10, id: 1, content }] : [],
      },
      attachedInfoElem: {
        groupHasReadInfo: { hasReadCount: 0, groupMemberCount: 0 },
        isPrivateChat: false,
        burnDuration: 0,
        hasReadTime: 0,
        isEncryption: false,
        inEncryptStatus: false,
      },
      ex: "",
      localEx: "",
    } as MessageItem;
  };
  const messages = [
    textMessage("周五的产品评审，改到下午三点可以吗？", 0),
    textMessage("可以，会议室我来预订。", 1, self),
    textMessage(
      "这次主要看消息搜索和多端同步。设计稿我已经整理好了，交互细节也放在文档里。",
      2,
    ),
    textMessage("收到。我会先把桌面端的流程走一遍，再和移动端对齐。", 3, self),
    textMessage("还有一件事：新同事的账号已经开通，明天可以一起试用。", 4),
    textMessage("好，评审前我们再碰一下。", 5, self),
    textMessage("没问题，到时候见。", 6),
  ];
  messages.slice(0, 3).forEach((message) => {
    message.sendTime -= 86400000;
    message.createTime -= 86400000;
  });
  const previews = [
    "没问题，到时候见。",
    "接口已经更新，可以联调了",
    "周五的设计评审，资料已整理",
    "收到，谢谢",
    "明天下午一起过一下方案",
  ];
  const conversations = people.slice(0, 5).map(
    (person, index) =>
      ({
        conversationID: `preview-chat-${index}`,
        conversationType: 1,
        userID: person.userID,
        groupID: "",
        showName: person.nickname,
        faceURL: person.faceURL,
        recvMsgOpt: 0,
        unreadCount: index === 1 ? 3 : index === 2 ? 1 : 0,
        readSeq: index === 0 ? 7 : 0,
        isPinned: false,
        latestMsg: JSON.stringify(textMessage(previews[index], index, person)),
        latestMsgSendTime: now - index * 3600000,
        draftText: "",
        draftTextTime: 0,
        burnDuration: 0,
        isPrivateChat: false,
        attachedInfo: "",
        ex: "",
        groupAtType: 0,
      } as ConversationItem),
  );
  const histories = new Map(
    conversations.map((conversation, index) => [
      conversation.conversationID,
      index === 0
        ? messages
        : [textMessage(previews[index], 20 + index, people[index])],
    ]),
  );
  const componentConversationID = "preview-components";
  const previewImage = (title: string, color: string) =>
    URL.createObjectURL(
      new Blob(
        [
          `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="260" viewBox="0 0 640 260">
          <rect width="640" height="260" rx="20" fill="${color}"/>
          <circle cx="520" cy="65" r="32" fill="#ffffff" opacity=".6"/>
          <path d="M0 260L180 95L330 230L450 120L640 260Z" fill="#ffffff" opacity=".2"/>
          <text x="32" y="64" fill="#ffffff" font-size="28" font-family="sans-serif">${title}</text>
        </svg>`,
        ],
        { type: "image/svg+xml" },
      ),
    );
  const cover = previewImage("Design review", "#2563eb");
  const draft = previewImage("Concept sketch", "#7c3aed");
  const notes = new Blob(["# 产品评审\n\n- 消息搜索\n- 多端同步\n- 组合消息\n"], {
    type: "text/markdown;charset=utf-8",
  });
  const audioURL = new URL("/src/assets/audio/newMsg.mp3", location.href).href;
  const videoURL = new URL("/e2e/fixtures/media-cache/clip.webm", location.href).href;
  const pdfPage =
    "BT /F1 26 Tf 44 235 Td (DESIGN HANDOFF) Tj 0 -42 Td /F1 13 Tf (Components / Files / Media) Tj 0 -28 Td (Version 2.4 - Ready for review) Tj ET";
  const pdfObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 440 320] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${pdfPage.length} >>\nstream\n${pdfPage}\nendstream`,
  ];
  let pdfContent = "%PDF-1.4\n";
  const pdfOffsets = [0];
  pdfObjects.forEach((object, index) => {
    pdfOffsets.push(pdfContent.length);
    pdfContent += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdfContent.length;
  pdfContent += `xref\n0 6\n0000000000 65535 f \n${pdfOffsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const pdf = new Blob([pdfContent], { type: "application/pdf" });
  const manifest = new Blob(
    [
      JSON.stringify(
        { version: "2.4", status: "ready", files: ["设计交付.pdf", "review-notes.md"] },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const componentBodies: ComponentMessageParams[] = [
    {
      components: [
        {
          type: 10,
          id: 1,
          content:
            "### 图文与附件\n设计封面和草稿放在同一条消息里，第二张图片点击展开。",
        },
        {
          type: 12,
          id: 2,
          items: [
            { media: { url: cover }, description: "蓝色设计封面" },
            { media: { url: draft }, description: "紫色概念草稿", spoiler: true },
          ],
        },
        { type: 14, id: 3, divider: true, spacing: 1 },
        { type: 13, id: 4, file: { url: "attachment://review-notes.md" } },
      ],
      attachments: [
        {
          id: "preview-notes",
          filename: "review-notes.md",
          size: notes.size,
          url: URL.createObjectURL(notes),
          content_type: "text/markdown",
        },
      ],
    },
    {
      components: [
        {
          type: 10,
          id: 1,
          content: "### 音视频组合\n下面是本地测试视频和提示音，可以直接播放。",
        },
        {
          type: 12,
          id: 2,
          items: [{ media: { url: videoURL }, description: "测试视频" }],
        },
        { type: 13, id: 3, file: { url: "attachment://preview-audio.mp3" } },
      ],
      attachments: [
        {
          id: "preview-video",
          filename: "preview-video.webm",
          size: 1051,
          url: videoURL,
          content_type: "video/webm",
          width: 640,
          height: 360,
          duration_secs: 1,
        },
        {
          id: "preview-audio",
          filename: "preview-audio.mp3",
          size: 20640,
          url: audioURL,
          content_type: "audio/mpeg",
        },
      ],
    },
    {
      components: [
        {
          type: 17,
          id: 1,
          accent_color: 0x2563eb,
          components: [
            {
              type: 9,
              id: 2,
              components: [
                {
                  type: 10,
                  id: 3,
                  content:
                    "### 周五产品评审\n**15:00–16:00 · 三楼会议室**\n\n请带上本周的设计与联调结果。",
                },
              ],
              accessory: {
                type: 11,
                id: 4,
                media: { url: cover },
                description: "评审封面",
              },
            },
            { type: 14, id: 5, divider: true, spacing: 1 },
            {
              type: 10,
              id: 6,
              content:
                "**本次议程**\n- 消息搜索与多端同步\n- 图片、文件和文字混合展示\n- 下一阶段排期\n\n> 上方是分区与缩略图，下方是按钮操作行。",
            },
            {
              type: 1,
              id: 7,
              components: [
                {
                  type: 2,
                  id: 8,
                  style: 5,
                  label: "查看组件文档",
                  url: "https://discord.com/developers/docs/components/reference",
                },
                {
                  type: 2,
                  id: 9,
                  style: 1,
                  label: "确认参加",
                  custom_id: "preview-rsvp",
                },
              ],
            },
          ],
        },
        {
          type: 17,
          id: 10,
          spoiler: true,
          accent_color: 0x7c3aed,
          components: [
            {
              type: 10,
              id: 11,
              content: "**评审备注**\n这整个容器都可以折叠，展开后才显示内容。",
            },
          ],
        },
      ],
    },
  ];
  const pollOptions = ["🌿 山间徒步", "☕ 城市漫游", "🎲 桌游聚会"];
  const pollCounts = [4, 3, 2];
  let myVote: number | undefined;
  const pollBody = (): ComponentMessageParams => ({
    components: [
      {
        type: 17,
        accent_color: 0x16a34a,
        components: [
          {
            type: 10,
            content: "### 周末团建，你想去哪？\n选择你喜欢的活动，我们周五确定安排。",
          },
          ...pollOptions.map(
            (label, index): ComponentV2 => ({
              type: 1,
              components: [
                {
                  type: 2,
                  style: myVote === index ? 1 : 2,
                  custom_id: `vote:${index}`,
                  label: `${myVote === index ? "✓ " : ""}${label} · ${
                    pollCounts[index] + (myVote === index ? 1 : 0)
                  } 票`,
                },
              ],
            }),
          ),
          { type: 14, spacing: 1, divider: true },
          {
            type: 10,
            content: `**${
              9 + (myVote === undefined ? 0 : 1)
            } 人参与** · 单选 · 剩余 2 天\n${
              myVote === undefined ? "你尚未投票" : `你投给了：${pollOptions[myVote]}`
            }\n\n本地交互预览，投票不会发送到服务端。`,
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 2,
                label: "撤回投票",
                custom_id: "vote:undo",
                disabled: myVote === undefined,
              },
            ],
          },
        ],
      },
    ],
  });
  componentBodies.push(
    {
      components: [
        {
          type: 17,
          accent_color: 0x5865f2,
          components: [
            {
              type: 10,
              content: "### 按钮与操作\n可以点击确认、保存和取消，观察按钮状态。",
            },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 1,
                  label: "确认报名",
                  custom_id: "action:confirm",
                  emoji: { name: "📅" },
                },
                { type: 2, style: 2, label: "稍后处理", custom_id: "action:later" },
                {
                  type: 2,
                  style: 3,
                  label: "保存",
                  custom_id: "action:save",
                  emoji: { name: "✓" },
                },
                {
                  type: 2,
                  style: 4,
                  label: "取消报名",
                  custom_id: "action:cancel",
                },
                {
                  type: 2,
                  style: 2,
                  label: "已截止",
                  custom_id: "action:closed",
                  disabled: true,
                },
              ],
            },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: "查看活动说明",
                  url: "https://docs.discord.com/developers/components/reference",
                },
                { type: 2, style: 6, sku_id: "preview-ticket" },
              ],
            },
          ],
        },
      ],
    },
    {
      components: [
        {
          type: 17,
          accent_color: 0x7c3aed,
          components: [
            {
              type: 10,
              content:
                "### 活动偏好\n试试单选与多选菜单。多选最多两项，选择后点击确认。",
            },
            {
              type: 1,
              components: [
                {
                  type: 3,
                  custom_id: "select:time",
                  placeholder: "选择出发时间",
                  options: [
                    {
                      label: "周六上午",
                      value: "saturday",
                      description: "09:00 集合",
                      emoji: { name: "☀️" },
                    },
                    {
                      label: "周日下午",
                      value: "sunday",
                      description: "14:00 集合",
                      emoji: { name: "🌤️" },
                    },
                  ],
                },
              ],
            },
            {
              type: 1,
              components: [
                {
                  type: 3,
                  custom_id: "select:food",
                  placeholder: "选择餐饮偏好（最多 2 项）",
                  min_values: 1,
                  max_values: 2,
                  options: [
                    { label: "烧烤", value: "bbq", emoji: { name: "🍖" } },
                    { label: "素食", value: "vegetarian", emoji: { name: "🥗" } },
                    { label: "咖啡", value: "coffee", emoji: { name: "☕" } },
                  ],
                },
              ],
            },
            {
              type: 1,
              components: [
                { type: 5, custom_id: "select:member", placeholder: "选择组织者" },
              ],
            },
            {
              type: 1,
              components: [
                { type: 6, custom_id: "select:role", placeholder: "选择参加角色" },
              ],
            },
            {
              type: 1,
              components: [
                {
                  type: 7,
                  custom_id: "select:mention",
                  placeholder: "选择要提醒的成员或角色",
                },
              ],
            },
            {
              type: 1,
              components: [
                { type: 8, custom_id: "select:channel", placeholder: "选择讨论频道" },
              ],
            },
            { type: 10, content: "选择结果：尚未选择" },
          ],
        },
      ],
    },
    pollBody(),
    {
      components: [
        {
          type: 17,
          accent_color: 0x5865f2,
          components: [
            {
              type: 10,
              content:
                "### 设计交付包\n**消息组件 · v2.4**\n\n设计稿和评审材料已整理，点击图片放大，点击文件直接预览。",
            },
            {
              type: 12,
              items: [
                { media: { url: cover }, description: "消息组件设计稿" },
                { media: { url: draft }, description: "交互方案概念图" },
              ],
            },
            { type: 13, file: { url: "attachment://设计交付.pdf" } },
            { type: 13, file: { url: "attachment://review-notes.md" } },
            { type: 13, file: { url: "attachment://manifest.json" } },
          ],
        },
      ],
      attachments: [
        {
          id: "preview-pdf",
          filename: "设计交付.pdf",
          size: pdf.size,
          url: URL.createObjectURL(pdf),
          content_type: "application/pdf",
        },
        {
          id: "preview-notes",
          filename: "review-notes.md",
          size: notes.size,
          url: URL.createObjectURL(notes),
          content_type: "text/markdown",
        },
        {
          id: "preview-json",
          filename: "manifest.json",
          size: manifest.size,
          url: URL.createObjectURL(manifest),
          content_type: "application/json",
        },
      ],
    },
    {
      components: [
        {
          type: 10,
          id: 1,
          content: "123456",
        },
        {
          type: 12,
          id: 2,
          items: [{ media: { url: "attachment://image.png" } }],
        },
      ],
      attachments: [
        {
          id: "preview-sending-image",
          filename: "image.png",
          size: 154200,
          url: "attachment://image.png",
          content_type: "image/png",
        },
      ],
    },
    {
      components: [
        {
          type: 10,
          id: 1,
          content: "hello",
        },
        {
          type: 12,
          id: 2,
          items: [
            { media: { url: "attachment://file1.png" } },
            { media: { url: "attachment://file2.png" } },
            { media: { url: "attachment://file3.pdf" } },
          ],
        },
      ],
      attachments: [
        {
          id: "preview-file-1",
          filename: "file1.png",
          size: 180000,
          url: "attachment://file1.png",
          content_type: "image/png",
        },
        {
          id: "preview-file-2",
          filename: "file2.png",
          size: 210000,
          url: "attachment://file2.png",
          content_type: "image/png",
        },
        {
          id: "preview-file-3",
          filename: "file3.pdf",
          size: 133370,
          url: "attachment://file3.pdf",
          content_type: "application/pdf",
        },
      ],
    },
  );
  const assignComponentIDs = (body: ComponentMessageParams) => {
    let id = 0;
    const visit = (component: ComponentV2) => {
      component.id = ++id;
      component.components?.forEach(visit);
      if (component.accessory) visit(component.accessory);
    };
    body.components.forEach(visit);
    return body;
  };
  const componentMessages = componentBodies.map((body, index): MessageItem => {
    const isSendingSample = index >= componentBodies.length - 2;
    const sender = isSendingSample || [1, 3, 5].includes(index) ? self : people[0];
    const envelope = textMessage("", index, sender);
    const timestamp = now - (componentBodies.length - index) * 60000;
    return {
      ...envelope,
      status: isSendingSample ? 1 : 2,
      clientMsgID: `preview-component-${index}`,
      serverMsgID: `preview-component-server-${index}`,
      createTime: timestamp,
      sendTime: timestamp,
      contentType: 144,
      textElem: undefined,
      message: {
        ...assignComponentIDs(body),
        id: `preview-component-server-${index}`,
        channel_id: componentConversationID,
        author: { id: sender.userID, username: sender.nickname },
        type: 0,
        timestamp: new Date(timestamp).toISOString(),
        flags: 32768,
      },
    };
  });
  conversations.unshift({
    ...conversations[0],
    conversationID: componentConversationID,
    showName: "V2 组件预览",
    latestMsg: JSON.stringify(componentMessages[componentMessages.length - 1]),
    latestMsgSendTime: now,
    readSeq: componentMessages.length,
  });
  histories.set(componentConversationID, componentMessages);
  const connection = {
    id: "preview",
    ownerUserID: self.userID,
    chatManagement: [] as Array<Record<string, unknown>>,
    createdAt: now,
    updatedAt: now,
  };
  const summaries = new Map<
    number,
    {
      seq: number;
      version: number;
      reactions: Array<{
        emoji: string;
        count: number;
        reactedByMe: boolean;
        userIDs: string[];
      }>;
    }
  >([
    [
      7,
      {
        seq: 7,
        version: 2,
        reactions: [
          {
            emoji: "👍",
            count: 4,
            reactedByMe: true,
            userIDs: ["preview-lin", "preview-chen", "preview-su", "preview-me"],
          },
          {
            emoji: "🎉",
            count: 2,
            reactedByMe: false,
            userIDs: ["preview-zhou", "preview-xu"],
          },
        ],
      },
    ],
  ]);
  // Set the adapter before app imports create their API clients. No preview API request leaves the browser.
  axios.defaults.adapter = (config) => {
    const body: {
      items?: Array<Record<string, unknown>>;
      userIDs?: string[];
      seqs?: number[];
      seq: number;
      emoji: string;
    } =
      typeof config.data === "string"
        ? JSON.parse(config.data || "{}")
        : config.data || {};
    let data: unknown = {};
    if (config.url?.includes("business_connection")) {
      for (const item of body.items || []) {
        const previous = connection.chatManagement.find(
          (entry) => entry.conversationID === item.conversationID,
        );
        if (previous) Object.assign(previous, item);
        else connection.chatManagement.push(item);
      }
      data = { connection };
    } else if (config.url?.includes("get_reaction_summaries")) {
      data = {
        summaries: (body.seqs || []).map(
          (seq: number) => summaries.get(seq) || { seq, version: 0, reactions: [] },
        ),
      };
    } else if (
      config.url?.includes("add_reaction") ||
      config.url?.includes("remove_reaction")
    ) {
      const summary = summaries.get(body.seq) || {
        seq: body.seq,
        version: 0,
        reactions: [],
      };
      summary.reactions = config.url.includes("add_reaction")
        ? [
            {
              emoji: body.emoji,
              count: 1,
              reactedByMe: true,
              userIDs: [self.userID],
            },
          ]
        : [];
      summary.version += 1;
      summaries.set(body.seq, summary);
      data = { summary };
    } else if (config.url?.includes("user")) {
      const users = body.userIDs
        ? people.filter((person) => body.userIDs?.includes(person.userID))
        : people;
      data = { users, total: users.length };
    }
    return Promise.resolve({
      config,
      status: 200,
      statusText: "OK",
      headers: {},
      data: { errCode: 0, errMsg: "", data: structuredClone(data) },
    });
  };
  const { default: App } = await import("../App");
  const { IMSDK } = await import("../layout/MainContentWrap");
  const { V2InteractionContext } = await import(
    "../pages/chat/queryChat/MessageItem/V2InteractiveComponents"
  );
  const { updateOneMessage } = await import(
    "../pages/chat/queryChat/useHistoryMessageList"
  );
  const { useUserStore, useContactStore, useConversationStore } = await import(
    "../store"
  );
  localforage.config({ name: "ABD-IM-UI-Preview" });
  await Promise.all([
    localforage.setItem("IM_TOKEN", "preview"),
    localforage.setItem("IM_CHAT_TOKEN", "preview"),
    localforage.setItem("IM_USERID", self.userID),
  ]);
  const result = (data: unknown = []) =>
    Promise.resolve({ errCode: 0, errMsg: "", data, operationID: "preview" });
  const previewUploadCancels = new Map<string, () => void>();
  for (const [key, value] of Object.entries(IMSDK)) {
    if (typeof value === "function") Reflect.set(IMSDK, key, () => result());
  }
  Object.assign(IMSDK, {
    login: () => result(),
    getSelfUserInfo: () => result(self),
    getConversationListSplit: ({ offset }: { offset: number }) =>
      result(offset ? [] : conversations),
    getTotalUnreadMsgCount: () => result(4),
    getAdvancedHistoryMessageList: ({ conversationID }: { conversationID: string }) =>
      result({ messageList: histories.get(conversationID) || [], isEnd: true }),
    getAdvancedHistoryMessageListReverse: () =>
      result({ messageList: [], isEnd: true }),
    getUnreadMentions: () =>
      result({
        seqs: [],
        hasMore: false,
      }),
    getFriendListPage: () => result(people.slice(0, 5)),
    getSpecifiedFriendsInfo: () => result(people.slice(0, 5)),
    getUsersInfo: () => result(people),
    uploadFile: async (
      { file }: { file: File },
      operationID: string,
      options?: UploadFileOptions,
    ) => {
      // Deliberately slow local fixture: uploading must not lock the next draft.
      let cancelled = false;
      previewUploadCancels.set(operationID, () => {
        cancelled = true;
      });
      try {
        const total = file.size || 1;
        for (let step = 1; step <= 12; step += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          if (cancelled) throw new Error("upload canceled");
          const current = Math.min(total, Math.floor((total * step) / 12));
          options?.onProgress?.({
            uuid: file.name,
            current,
            total,
            percent: Math.floor((current / total) * 100),
          });
        }
        // Preserve the selected file. Returning a shared fixture here makes the
        // optimistic local preview change into an unrelated image after sending.
        return result({ url: URL.createObjectURL(file) });
      } finally {
        previewUploadCancels.delete(operationID);
      }
    },
    cancelUploadFile: (operationID: string) => {
      const cancel = previewUploadCancels.get(operationID);
      cancel?.();
      return Boolean(cancel);
    },
    createComponentMessage: (body: ComponentMessageParams) => {
      const sendTime = Date.now();
      const id = createPreviewID();
      return result({
        ...textMessage("", sendTime, self),
        clientMsgID: id,
        serverMsgID: id,
        createTime: sendTime,
        sendTime,
        seq: 0,
        textElem: undefined,
        contentType: 144,
        message: {
          ...body,
          id,
          channel_id: self.userID,
          author: { id: self.userID, username: self.nickname },
          type: 0,
          timestamp: new Date(sendTime).toISOString(),
          flags: 32768,
        },
      });
    },
    createTextMessage: (content: string) =>
      result(textMessage(content, Date.now(), self)),
    sendMessage: ({ message }: { message: MessageItem }) => {
      const sent = { ...message, status: 2 };
      const id =
        useConversationStore.getState().currentConversation?.conversationID ||
        "preview-chat-0";
      histories.set(id, [...(histories.get(id) || []), sent]);
      return result(sent);
    },
  });
  useUserStore.getState().updateSelfInfo(self);
  useUserStore.setState({
    reinstall: false,
    isLogining: false,
  });
  useConversationStore.setState({
    conversationList: conversations,
    conversationListLoaded: true,
  });
  useContactStore.setState({
    userStatusList: people.map((person) => ({
      userID: person.userID,
      status: 1,
      platformIDs: [5],
    })),
  });
  await useContactStore.getState().getFriendListByReq();
  document.title = "ABD IM - 示例预览";
  const memberOptions = people
    .slice(0, 5)
    .map((person) => ({ label: person.nickname, value: person.userID }));
  const roleOptions = [
    { label: "设计组", value: "role-design" },
    { label: "研发组", value: "role-dev" },
  ];
  const entityOptions = {
    5: memberOptions,
    6: roleOptions,
    7: [...memberOptions, ...roleOptions],
    8: [
      { label: "# 活动讨论", value: "channel-event" },
      { label: "# 产品设计", value: "channel-design" },
    ],
  };
  const selections: Record<string, string> = {};
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <V2InteractionContext.Provider
      value={{
        options: entityOptions,
        onAction: (messageID, component, values) => {
          const history = histories.get(componentConversationID)!;
          const original = history.find((item) => item.clientMsgID === messageID);
          if (!original?.message || !component.custom_id) return;
          const updated = structuredClone(original);
          if (component.custom_id.startsWith("vote:")) {
            myVote =
              component.custom_id === "vote:undo"
                ? undefined
                : Number(component.custom_id.split(":")[1]);
            updated.message!.components = assignComponentIDs(pollBody()).components;
          } else {
            const visit = (item: ComponentV2) => {
              if (item.type === 2 && item.id === component.id) {
                item.label =
                  component.custom_id === "preview-rsvp" ? "已确认参加" : "已完成";
                item.disabled = true;
              }
              if (item.type === 10 && item.content?.startsWith("选择结果：")) {
                const options =
                  component.options ||
                  entityOptions[component.type as keyof typeof entityOptions] ||
                  [];
                selections[component.custom_id!] = values
                  .map(
                    (value) =>
                      options.find((option) => option.value === value)?.label || value,
                  )
                  .join("、");
                item.content = `选择结果：${Object.values(selections)
                  .filter(Boolean)
                  .join(" / ")}`;
              }
              item.components?.forEach(visit);
            };
            updated.message!.components.forEach(visit);
          }
          histories.set(
            componentConversationID,
            history.map((item) => (item.clientMsgID === messageID ? updated : item)),
          );
          if (
            useConversationStore.getState().currentConversation?.conversationID ===
            componentConversationID
          )
            updateOneMessage(updated);
        },
      }}
    >
      <App />
    </V2InteractionContext.Provider>,
  );
}

void startPreview();

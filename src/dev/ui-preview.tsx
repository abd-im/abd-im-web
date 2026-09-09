import "../index.scss";

import type { ConversationItem, MessageItem } from "@abd-im/wasm-client-sdk";
import axios from "axios";
import localforage from "localforage";
import ReactDOM from "react-dom/client";

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
    index: number,
    sender = people[0],
  ): MessageItem =>
    ({
      clientMsgID: `preview-message-${index}`,
      serverMsgID: "",
      createTime: now - (12 - index) * 60000,
      sendTime: now - (12 - index) * 60000,
      sessionType: 1,
      sendID: sender.userID,
      recvID: sender === self ? people[0].userID : self.userID,
      msgFrom: 100,
      contentType: 101,
      senderPlatformID: 5,
      senderNickname: sender.nickname,
      senderFaceUrl: sender.faceURL,
      groupID: "",
      content: "",
      seq: index + 1,
      isRead: true,
      status: 2,
      textElem: { content },
      attachedInfoElem: {
        groupHasReadInfo: { hasReadCount: 0, groupMemberCount: 0 },
        isPrivateChat: false,
        burnDuration: 0,
        hasReadTime: 0,
      },
      ex: "",
      localEx: "",
    } as MessageItem);
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
  const connection = {
    id: "preview",
    ownerUserID: self.userID,
    chatManagement: [] as Array<Record<string, unknown>>,
    createdAt: now,
    updatedAt: now,
  };
  const summaries = new Map<
    string,
    {
      clientMsgID: string;
      version: number;
      reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
    }
  >();
  // Set the adapter before app imports create their API clients. No preview API request leaves the browser.
  axios.defaults.adapter = (config) => {
    const body: {
      items?: Array<Record<string, unknown>>;
      userIDs?: string[];
      clientMsgIDs?: string[];
      clientMsgID: string;
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
        summaries: (body.clientMsgIDs || []).map(
          (id: string) =>
            summaries.get(id) || { clientMsgID: id, version: 0, reactions: [] },
        ),
      };
    } else if (
      config.url?.includes("add_reaction") ||
      config.url?.includes("remove_reaction")
    ) {
      const summary = summaries.get(body.clientMsgID) || {
        clientMsgID: body.clientMsgID,
        version: 0,
        reactions: [],
      };
      summary.reactions = config.url.includes("add_reaction")
        ? [{ emoji: body.emoji, count: 1, reactedByMe: true }]
        : [];
      summary.version += 1;
      summaries.set(body.clientMsgID, summary);
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
    getFriendListPage: () => result(people.slice(0, 5)),
    getSpecifiedFriendsInfo: () => result(people.slice(0, 5)),
    getUsersInfo: () => result(people),
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
  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
}

void startPreview();

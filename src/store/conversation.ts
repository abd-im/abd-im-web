import { MessageType, SessionType } from "@abd-im/wasm-client-sdk";
import {
  ConversationItem,
  GroupItem,
  GroupMemberItem,
  MessageItem,
} from "@abd-im/wasm-client-sdk/lib/types/entity";
import { t } from "i18next";
import { create } from "zustand";

import {
  conversationKind,
  workspaceKindUpdates,
} from "@/features/agentWorkspace/metadata";
import { IMSDK } from "@/layout/MainContentWrap";
import { feedbackToast } from "@/utils/common";
import { conversationSort, isGroupSession } from "@/utils/imCommon";

import { ConversationListUpdateType, ConversationStore } from "./type";
import { useUserStore } from "./user";

const CONVERSATION_SPLIT_COUNT = 500;
const GROUP_INFO_BATCH_COUNT = 100;

export const useConversationStore = create<ConversationStore>()((set, get) => ({
  conversationList: [],
  conversationListLoaded: false,
  conversationKinds: {},
  currentConversation: undefined,
  quoteMessage: undefined,
  unReadCount: 0,
  currentGroupInfo: undefined,
  currentMemberInGroup: undefined,
  getConversationListByReq: async (isOffset?: boolean) => {
    let tmpConversationList = [] as ConversationItem[];
    try {
      const { data } = await IMSDK.getConversationListSplit({
        offset: isOffset ? get().conversationList.length : 0,
        count: CONVERSATION_SPLIT_COUNT,
      });
      tmpConversationList = data;
    } catch (error) {
      feedbackToast({ error, msg: t("toast.getConversationFailed") });
      if (!isOffset) set(() => ({ conversationListLoaded: true }));
      return true;
    }
    if (isOffset) {
      get().updateConversationList(tmpConversationList, "filter");
    } else {
      set(() => ({
        conversationList: tmpConversationList,
        conversationListLoaded: true,
      }));
      void get().loadConversationKinds(tmpConversationList);
    }
    return tmpConversationList.length === CONVERSATION_SPLIT_COUNT;
  },
  updateConversationList: (
    list: ConversationItem[],
    type: ConversationListUpdateType,
  ) => {
    const idx = list.findIndex(
      (c) => c.conversationID === get().currentConversation?.conversationID,
    );
    if (idx > -1) get().updateCurrentConversation(list[idx]);

    const currentList = get().conversationList;
    const nextList =
      type === "filter"
        ? conversationSort([...list, ...currentList], currentList)
        : conversationSort([
            ...list,
            ...currentList.filter(
              (conversation) =>
                !list.some(
                  (item) => item.conversationID === conversation.conversationID,
                ),
            ),
          ]);
    set((state) => ({
      conversationList: nextList,
      conversationKinds: state.conversationKinds,
    }));
    void get().loadConversationKinds(nextList);
  },
  updateCurrentConversation: (conversation?: ConversationItem, isJump?: boolean) => {
    if (!conversation) {
      const prevConversation = get().currentConversation;
      if (prevConversation?.conversationType === SessionType.Single) {
        IMSDK.unsubscribeUsersStatus([prevConversation.userID]);
      }
      set(() => ({
        currentConversation: undefined,
        quoteMessage: undefined,
        currentGroupInfo: undefined,
        currentMemberInGroup: undefined,
      }));
      return Promise.resolve();
    }
    const prevConversation = get().currentConversation;

    const toggleNewConversation =
      conversation.conversationID !== prevConversation?.conversationID;

    if (toggleNewConversation) {
      if (prevConversation?.conversationType === SessionType.Single) {
        IMSDK.unsubscribeUsersStatus([prevConversation.userID]);
      }
      if (conversation.conversationType === SessionType.Single) {
        IMSDK.subscribeUsersStatus([conversation.userID]);
      }
    }

    set(() => ({
      currentConversation: { ...conversation },
      ...(toggleNewConversation ? { quoteMessage: undefined } : {}),
      ...(toggleNewConversation
        ? { currentGroupInfo: undefined, currentMemberInGroup: undefined }
        : {}),
    }));
    if (toggleNewConversation && isGroupSession(conversation.conversationType)) {
      void get().getCurrentGroupInfoByReq(conversation.groupID);
      void get().getCurrentMemberInGroupByReq(conversation.groupID);
    }
    return Promise.resolve();
  },
  updateQuoteMessage: (message?: MessageItem) => {
    set(() => ({ quoteMessage: message }));
  },
  getUnReadCountByReq: async () => {
    try {
      const { data } = await IMSDK.getTotalUnreadMsgCount();
      set(() => ({ unReadCount: data }));
      return data;
    } catch (error) {
      console.error(error);
      return 0;
    }
  },
  updateUnReadCount: (count: number) => {
    set(() => ({ unReadCount: count }));
  },
  getCurrentGroupInfoByReq: async (groupID: string) => {
    let groupInfo: GroupItem;
    try {
      const { data } = await IMSDK.getSpecifiedGroupsInfo([groupID]);
      groupInfo = data[0];
    } catch (error) {
      if (get().currentConversation?.groupID === groupID) {
        feedbackToast({ error, msg: t("toast.getGroupInfoFailed") });
      }
      return;
    }
    if (get().currentConversation?.groupID !== groupID) return;
    set((state) => ({
      currentGroupInfo: { ...groupInfo },
      conversationKinds: {
        ...state.conversationKinds,
        [groupID]: conversationKind(groupInfo.ex),
      },
    }));
  },
  updateCurrentGroupInfo: (groupInfo: GroupItem) => {
    set((state) => ({
      currentGroupInfo: { ...groupInfo },
      conversationKinds: {
        ...state.conversationKinds,
        [groupInfo.groupID]: conversationKind(groupInfo.ex),
      },
    }));
  },
  updateConversationGroupInfo: (groupInfo: GroupItem) => {
    set((state) => ({
      conversationKinds: {
        ...state.conversationKinds,
        [groupInfo.groupID]: conversationKind(groupInfo.ex),
      },
    }));
  },
  loadConversationKinds: async (list: ConversationItem[]) => {
    const knownKinds = get().conversationKinds;
    const groupIDs = [
      ...new Set(
        list
          .filter((item) => isGroupSession(item.conversationType))
          .map((item) => item.groupID)
          .filter(
            (groupID) => !Object.prototype.hasOwnProperty.call(knownKinds, groupID),
          ),
      ),
    ].filter(Boolean);
    if (!groupIDs.length) return;
    try {
      const groups: GroupItem[] = [];
      for (let index = 0; index < groupIDs.length; index += GROUP_INFO_BATCH_COUNT) {
        const { data } = await IMSDK.getSpecifiedGroupsInfo(
          groupIDs.slice(index, index + GROUP_INFO_BATCH_COUNT),
        );
        groups.push(...data);
      }
      const updates = workspaceKindUpdates(groups);
      set((state) => ({
        conversationKinds: { ...state.conversationKinds, ...updates },
      }));
    } catch (error) {
      console.error("failed to load conversation group metadata", error);
    }
  },
  getCurrentMemberInGroupByReq: async (groupID: string) => {
    let memberInfo: GroupMemberItem;
    const selfID = useUserStore.getState().selfInfo.userID;
    try {
      const { data } = await IMSDK.getSpecifiedGroupMembersInfo({
        groupID,
        userIDList: [selfID],
      });
      memberInfo = data[0];
    } catch (error) {
      if (get().currentConversation?.groupID === groupID) {
        set(() => ({ currentMemberInGroup: undefined }));
        feedbackToast({ error, msg: t("toast.getGroupMemberFailed") });
      }
      return;
    }
    if (get().currentConversation?.groupID !== groupID) return;
    set(() => ({ currentMemberInGroup: memberInfo ? { ...memberInfo } : undefined }));
  },
  setCurrentMemberInGroup: (memberInfo?: GroupMemberItem) => {
    set(() => ({ currentMemberInGroup: memberInfo }));
  },
  tryUpdateCurrentMemberInGroup: (member: GroupMemberItem) => {
    const currentMemberInGroup = get().currentMemberInGroup;
    if (
      member.groupID === currentMemberInGroup?.groupID &&
      member.userID === currentMemberInGroup?.userID
    ) {
      set(() => ({ currentMemberInGroup: { ...member } }));
    }
  },
  clearConversationStore: () => {
    set(() => ({
      conversationList: [],
      conversationListLoaded: false,
      conversationKinds: {},
      currentConversation: undefined,
      unReadCount: 0,
      currentGroupInfo: undefined,
      currentMemberInGroup: undefined,
      quoteMessage: undefined,
    }));
  },
}));

import {
  AtTextElem,
  BlackUserItem,
  ConversationItem,
  FriendApplicationItem,
  FriendUserItem,
  GroupApplicationItem,
  GroupItem,
  GroupMemberItem,
  MessageItem,
} from "@abd-im/wasm-client-sdk/lib/types/entity";

import { BusinessUserInfo } from "@/api/login";
import type { ConversationKind } from "@/features/agentWorkspace/metadata";

export type IMConnectState = "success" | "loading" | "failed";

export interface UserStore {
  syncState: IMConnectState;
  progress: number;
  reinstall: boolean;
  isLogining: boolean;
  connectState: IMConnectState;
  selfInfo: BusinessUserInfo;
  appSettings: AppSettings;
  updateSyncState: (syncState: IMConnectState) => void;
  updateProgressState: (progress: number) => void;
  updateReinstallState: (reinstall: boolean) => void;
  updateIsLogining: (isLogining: boolean) => void;
  updateConnectState: (connectState: IMConnectState) => void;
  updateSelfInfo: (info: Partial<BusinessUserInfo>) => void;
  getSelfInfoByReq: () => void;
  updateAppSettings: (settings: Partial<AppSettings>) => void;
  userLogout: (force?: boolean) => Promise<void>;
}

export interface AppSettings {
  locale: LocaleString;
  closeAction: "miniSize" | "quit";
  allowBeep: boolean;
}

export type LocaleString = "zh-CN" | "en-US";

export type ConversationListUpdateType = "push" | "filter";

export interface ConversationStore {
  conversationList: ConversationItem[];
  conversationListLoaded: boolean;
  conversationKinds: Record<string, ConversationKind | undefined>;
  currentConversation?: ConversationItem;
  quoteMessage?: MessageItem;
  unReadCount: number;
  currentGroupInfo?: GroupItem;
  currentMemberInGroup?: GroupMemberItem;
  getConversationListByReq: (isOffset?: boolean) => Promise<boolean>;
  updateConversationList: (
    list: ConversationItem[],
    type: ConversationListUpdateType,
  ) => void;
  updateCurrentConversation: (
    conversation?: ConversationItem,
    isJump?: boolean,
  ) => Promise<void>;
  updateQuoteMessage: (message?: MessageItem) => void;
  getUnReadCountByReq: () => Promise<number>;
  updateUnReadCount: (count: number) => void;
  getCurrentGroupInfoByReq: (groupID: string) => Promise<void>;
  updateCurrentGroupInfo: (groupInfo: GroupItem) => void;
  updateConversationGroupInfo: (groupInfo: GroupItem) => void;
  loadConversationKinds: (list: ConversationItem[]) => Promise<void>;
  getCurrentMemberInGroupByReq: (groupID: string) => Promise<void>;
  setCurrentMemberInGroup: (memberInfo?: GroupMemberItem) => void;
  tryUpdateCurrentMemberInGroup: (member: GroupMemberItem) => void;
  clearConversationStore: () => void;
}

export interface ContactStore {
  friendList: FriendUserItem[];
  blackList: BlackUserItem[];
  groupList: GroupItem[];
  userStatusList: UserStatusItem[];
  recvFriendApplicationList: FriendApplicationItem[];
  sendFriendApplicationList: FriendApplicationItem[];
  recvGroupApplicationList: GroupApplicationItem[];
  sendGroupApplicationList: GroupApplicationItem[];
  unHandleFriendApplicationCount: number;
  unHandleGroupApplicationCount: number;
  getFriendListByReq: () => Promise<void>;
  setFriendList: (list: FriendUserItem[]) => void;
  updateFriend: (friend: FriendUserItem, remove?: boolean) => void;
  pushNewFriend: (friend: FriendUserItem) => void;
  getBlackListByReq: () => Promise<void>;
  updateBlack: (black: BlackUserItem, remove?: boolean) => void;
  pushNewBlack: (black: BlackUserItem) => void;
  getGroupListByReq: () => Promise<void>;
  setGroupList: (list: GroupItem[]) => void;
  updateGroup: (group: GroupItem, remove?: boolean) => void;
  pushNewGroup: (group: GroupItem) => void;
  setUserStatusList: (list: UserStatusItem[]) => void;
  updateUserStatus: (status: UserStatusItem) => void;
  getRecvFriendApplicationListByReq: () => Promise<void>;
  updateRecvFriendApplication: (application: FriendApplicationItem) => Promise<void>;
  getSendFriendApplicationListByReq: () => Promise<void>;
  updateSendFriendApplication: (application: FriendApplicationItem) => void;
  getRecvGroupApplicationListByReq: () => Promise<void>;
  updateRecvGroupApplication: (application: GroupApplicationItem) => Promise<void>;
  getSendGroupApplicationListByReq: () => Promise<void>;
  updateSendGroupApplication: (application: GroupApplicationItem) => void;
  updateUnHandleFriendApplicationCount: (num: number) => void;
  updateUnHandleGroupApplicationCount: (num: number) => void;
  clearContactStore: () => void;
}

export interface UserStatusItem {
  userID: string;
  status: number;
  platformIDs: number[];
}

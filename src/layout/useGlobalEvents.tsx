import { CbEvents, LogLevel, MessageType, SessionType } from "@abd-im/wasm-client-sdk";
import {
  BlackUserItem,
  ConversationItem,
  FriendApplicationItem,
  FriendUserItem,
  GroupApplicationItem,
  GroupItem,
  GroupMemberItem,
  MessageItem,
  ReceiptInfo,
  RevokedInfo,
  SelfUserInfo,
  WSEvent,
  WsResponse,
} from "@abd-im/wasm-client-sdk/lib/types/entity";
import { t } from "i18next";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import newMsgAudio from "@/assets/audio/newMsg.mp3";
import { RUNTIME_API_URL, RUNTIME_WS_URL } from "@/config";
import { CustomType } from "@/constants";
import { parseReactionUpdatedEvent } from "@/pages/chat/queryChat/messageReactionState";
import {
  pushNewMessage,
  updateMessageSender,
  updateOneMessage,
} from "@/pages/chat/queryChat/useHistoryMessageList";
import { useConversationStore, useUserStore } from "@/store";
import { useContactStore } from "@/store/contact";
import { UserStatusItem } from "@/store/type";
import { feedbackToast } from "@/utils/common";
import { emit } from "@/utils/events";
import { initStore } from "@/utils/imCommon";
import { clearIMProfile, getIMToken, getIMUserID } from "@/utils/storage";

import { IMSDK } from "./MainContentWrap";

export function useGlobalEvent() {
  const navigate = useNavigate();
  const resume = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(newMsgAudio);
  }, []);

  // user
  const updateSyncState = useUserStore((state) => state.updateSyncState);
  const updateProgressState = useUserStore((state) => state.updateProgressState);
  const updateReinstallState = useUserStore((state) => state.updateReinstallState);
  const updateIsLogining = useUserStore((state) => state.updateIsLogining);
  const updateConnectState = useUserStore((state) => state.updateConnectState);
  const updateSelfInfo = useUserStore((state) => state.updateSelfInfo);
  const userLogout = useUserStore((state) => state.userLogout);
  // conversation
  const updateConversationList = useConversationStore(
    (state) => state.updateConversationList,
  );
  const updateUnReadCount = useConversationStore((state) => state.updateUnReadCount);
  const updateCurrentGroupInfo = useConversationStore(
    (state) => state.updateCurrentGroupInfo,
  );
  const updateConversationGroupInfo = useConversationStore(
    (state) => state.updateConversationGroupInfo,
  );
  const getCurrentGroupInfoByReq = useConversationStore(
    (state) => state.getCurrentGroupInfoByReq,
  );
  const setCurrentMemberInGroup = useConversationStore(
    (state) => state.setCurrentMemberInGroup,
  );
  const getCurrentMemberInGroupByReq = useConversationStore(
    (state) => state.getCurrentMemberInGroupByReq,
  );
  const tryUpdateCurrentMemberInGroup = useConversationStore(
    (state) => state.tryUpdateCurrentMemberInGroup,
  );
  const getConversationListByReq = useConversationStore(
    (state) => state.getConversationListByReq,
  );
  const getUnReadCountByReq = useConversationStore(
    (state) => state.getUnReadCountByReq,
  );
  // contact
  const getFriendListByReq = useContactStore((state) => state.getFriendListByReq);
  const getGroupListByReq = useContactStore((state) => state.getGroupListByReq);
  const updateFriend = useContactStore((state) => state.updateFriend);
  const pushNewFriend = useContactStore((state) => state.pushNewFriend);
  const updateBlack = useContactStore((state) => state.updateBlack);
  const pushNewBlack = useContactStore((state) => state.pushNewBlack);
  const updateGroup = useContactStore((state) => state.updateGroup);
  const pushNewGroup = useContactStore((state) => state.pushNewGroup);
  const updateRecvFriendApplication = useContactStore(
    (state) => state.updateRecvFriendApplication,
  );
  const updateSendFriendApplication = useContactStore(
    (state) => state.updateSendFriendApplication,
  );
  const updateRecvGroupApplication = useContactStore(
    (state) => state.updateRecvGroupApplication,
  );
  const updateSendGroupApplication = useContactStore(
    (state) => state.updateSendGroupApplication,
  );
  const updateUserStatus = useContactStore((state) => state.updateUserStatus);

  useEffect(() => {
    loginCheck();
    setIMListener();
    setIpcListener();

    window.addEventListener("online", () => {
      IMSDK.networkStatusChanged();
    });
    window.addEventListener("offline", () => {
      IMSDK.networkStatusChanged();
    });
    return () => {
      disposeIMListener();
    };
  }, []);

  const loginCheck = async () => {
    const IMToken = (await getIMToken()) as string;
    const IMUserID = (await getIMUserID()) as string;
    if (!IMToken || !IMUserID) {
      clearIMProfile();
      navigate("/login");
      return;
    }
    tryLogin();
  };

  const tryLogin = async () => {
    updateIsLogining(true);
    const IMToken = (await getIMToken()) as string;
    const IMUserID = (await getIMUserID()) as string;
    try {
      const apiAddr = RUNTIME_API_URL;
      const wsAddr = RUNTIME_WS_URL;
      if (window.electronAPI) {
        await IMSDK.login({
          userID: IMUserID,
          token: IMToken,
          platformID: window.electronAPI?.getPlatform() ?? 5,
          apiAddr,
          wsAddr,
          logLevel: LogLevel.Debug,
          isLogStandardOutput: false,
        });
      } else {
        await IMSDK.login({
          userID: IMUserID,
          token: IMToken,
          platformID: 5,
          apiAddr,
          wsAddr,
          logLevel: LogLevel.Debug,
        });
      }
      initStore();
    } catch (error) {
      console.error(error);
      if ((error as WsResponse).errCode !== 10102) {
        navigate("/login");
      }
    }
    updateIsLogining(false);
  };

  const setIMListener = () => {
    // account
    IMSDK.on(CbEvents.OnSelfInfoUpdated, selfUpdateHandler);
    IMSDK.on(CbEvents.OnConnecting, connectingHandler);
    IMSDK.on(CbEvents.OnConnectFailed, connectFailedHandler);
    IMSDK.on(CbEvents.OnConnectSuccess, connectSuccessHandler);
    IMSDK.on(CbEvents.OnKickedOffline, kickHandler);
    IMSDK.on(CbEvents.OnUserTokenExpired, expiredHandler);
    IMSDK.on(CbEvents.OnUserTokenInvalid, expiredHandler);
    // sync
    IMSDK.on(CbEvents.OnSyncServerStart, syncStartHandler);
    IMSDK.on(CbEvents.OnSyncServerProgress, syncProgressHandler);
    IMSDK.on(CbEvents.OnSyncServerFinish, syncFinishHandler);
    IMSDK.on(CbEvents.OnSyncServerFailed, syncFailedHandler);
    // message
    IMSDK.on(CbEvents.OnRecvNewMessage, newMessageHandler);
    IMSDK.on(CbEvents.OnRecvNewMessages, newMessagesHandler);
    IMSDK.on(CbEvents.OnNewRecvMessageRevoked, revokedMessageHandler);
    IMSDK.on(CbEvents.OnUserStatusChanged, userStatusChangeHandler);
    IMSDK.on(CbEvents.OnRecvC2CReadReceipt, c2cReadReceiptHandler);
    IMSDK.on(CbEvents.OnRecvCustomBusinessMessage, customBusinessMessageHandler);
    // conversation
    IMSDK.on(CbEvents.OnConversationChanged, conversationChnageHandler);
    IMSDK.on(CbEvents.OnNewConversation, newConversationHandler);
    IMSDK.on(CbEvents.OnTotalUnreadMessageCountChanged, totalUnreadChangeHandler);
    // friend
    IMSDK.on(CbEvents.OnFriendInfoChanged, friednInfoChangeHandler);
    IMSDK.on(CbEvents.OnFriendAdded, friednAddedHandler);
    IMSDK.on(CbEvents.OnFriendDeleted, friednDeletedHandler);
    // blacklist
    IMSDK.on(CbEvents.OnBlackAdded, blackAddedHandler);
    IMSDK.on(CbEvents.OnBlackDeleted, blackDeletedHandler);
    // group
    IMSDK.on(CbEvents.OnJoinedGroupAdded, joinedGroupAddedHandler);
    IMSDK.on(CbEvents.OnJoinedGroupDeleted, joinedGroupDeletedHandler);
    IMSDK.on(CbEvents.OnGroupDismissed, joinedGroupDismissHandler);
    IMSDK.on(CbEvents.OnGroupInfoChanged, groupInfoChangedHandler);
    IMSDK.on(CbEvents.OnGroupMemberAdded, groupMemberAddedHandler);
    IMSDK.on(CbEvents.OnGroupMemberDeleted, groupMemberDeletedHandler);
    IMSDK.on(CbEvents.OnGroupMemberInfoChanged, groupMemberInfoChangedHandler);
    // application
    IMSDK.on(CbEvents.OnFriendApplicationAdded, friendApplicationProcessedHandler);
    IMSDK.on(CbEvents.OnFriendApplicationAccepted, friendApplicationProcessedHandler);
    IMSDK.on(CbEvents.OnFriendApplicationRejected, friendApplicationProcessedHandler);
    IMSDK.on(CbEvents.OnGroupApplicationAdded, groupApplicationProcessedHandler);
    IMSDK.on(CbEvents.OnGroupApplicationAccepted, groupApplicationProcessedHandler);
    IMSDK.on(CbEvents.OnGroupApplicationRejected, groupApplicationProcessedHandler);
  };

  const selfUpdateHandler = ({ data }: WSEvent<SelfUserInfo>) => {
    updateSelfInfo(data);
    if (
      useConversationStore.getState().currentConversation?.conversationType ===
      SessionType.Single
    ) {
      updateMessageSender(data);
    }
  };
  const connectingHandler = () => {
    updateConnectState("loading");
    console.log("connecting...");
  };
  const connectFailedHandler = ({ errCode, errMsg }: WSEvent) => {
    updateConnectState("failed");
    console.error("connectFailedHandler", errCode, errMsg);

    if (errCode === 705) {
      tryOut(t("toast.loginExpiration"));
    }
  };
  const connectSuccessHandler = () => {
    updateConnectState("success");
    emit("MESSAGE_REACTIONS_REFRESH");
    console.log("connect success...");
  };
  const kickHandler = () => tryOut(t("toast.accountKicked"));
  const expiredHandler = () => tryOut(t("toast.loginExpiration"));

  const tryOut = (msg: string) =>
    feedbackToast({
      msg,
      error: msg,
      onClose: () => {
        userLogout(true);
      },
    });

  // sync
  const syncStartHandler = ({ data }: WSEvent<boolean>) => {
    updateSyncState("loading");
    updateReinstallState(data);
  };
  const syncProgressHandler = ({ data }: WSEvent<number>) => {
    updateProgressState(data);
  };
  const syncFinishHandler = () => {
    updateSyncState("success");
    emit("MESSAGE_REACTIONS_REFRESH");
    getFriendListByReq();
    getGroupListByReq();
    getConversationListByReq(false);
    getUnReadCountByReq();
  };
  const syncFailedHandler = () => {
    updateSyncState("failed");
    feedbackToast({ msg: t("toast.syncFailed"), error: t("toast.syncFailed") });
  };

  // message
  const newMessageHandler = ({ data }: WSEvent<MessageItem>) => {
    if (useUserStore.getState().syncState === "loading" || resume.current) {
      return;
    }
    handleNewMessage(data);
  };

  const newMessagesHandler = ({ data }: WSEvent<MessageItem[]>) => {
    if (useUserStore.getState().syncState === "loading" || resume.current) {
      return;
    }
    data.forEach(handleNewMessage);
  };

  const revokedMessageHandler = ({ data }: WSEvent<RevokedInfo>) => {
    updateOneMessage({
      clientMsgID: data.clientMsgID,
      contentType: MessageType.RevokeMessage,
      notificationElem: {
        detail: JSON.stringify(data),
      },
    } as MessageItem);
  };

  const userStatusChangeHandler = ({ data }: WSEvent<UserStatusItem>) => {
    updateUserStatus(data);
  };

  const c2cReadReceiptHandler = ({ data }: WSEvent<ReceiptInfo[]>) => {
    data.forEach((receipt) => {
      const readTime =
        receipt.readTime < 10000000000 ? receipt.readTime * 1000 : receipt.readTime;
      receipt.msgIDList.forEach((clientMsgID) => {
        updateOneMessage({
          clientMsgID,
          isRead: true,
          attachedInfoElem: { hasReadTime: readTime || Date.now() },
        } as MessageItem);
      });
    });
  };

  const customBusinessMessageHandler = ({ data }: WSEvent<unknown>) => {
    const event = parseReactionUpdatedEvent(data);
    if (event) {
      emit("MESSAGE_REACTION_UPDATED", event);
    }
  };

  const notPushType = [MessageType.TypingMessage, MessageType.RevokeMessage];

  const playNewMsgSound = () => {
    const { allowBeep } = useUserStore.getState().appSettings;
    const { globalRecvMsgOpt } = useUserStore.getState().selfInfo;
    if (allowBeep && globalRecvMsgOpt !== 2) {
      audioRef.current?.play().catch(() => {
        // Browser might block auto-play if no user interaction
      });
    }
  };

  const handleNewMessage = (newServerMsg: MessageItem) => {
    if (
      newServerMsg.contentType !== MessageType.StreamMessage &&
      newServerMsg.sendID !== useUserStore.getState().selfInfo.userID
    ) {
      playNewMsgSound();
    }

    if (newServerMsg.contentType === MessageType.CustomMessage) {
      const customData = JSON.parse(newServerMsg.customElem!.data);
      if (
        CustomType.CallingInvite <= customData.customType &&
        customData.customType <= CustomType.CallingHungup
      ) {
        return;
      }
    }

    if (!inCurrentConversation(newServerMsg)) return;

    if (!notPushType.includes(newServerMsg.contentType)) {
      pushNewMessage(newServerMsg);
    }
  };

  const inCurrentConversation = (newServerMsg: MessageItem) => {
    switch (newServerMsg.sessionType) {
      case SessionType.Single:
        return (
          newServerMsg.sendID ===
            useConversationStore.getState().currentConversation?.userID ||
          (newServerMsg.sendID === useUserStore.getState().selfInfo.userID &&
            newServerMsg.recvID ===
              useConversationStore.getState().currentConversation?.userID)
        );
      case SessionType.Group:
      case SessionType.WorkingGroup:
        return (
          newServerMsg.groupID ===
          useConversationStore.getState().currentConversation?.groupID
        );
      case SessionType.Notification:
        return (
          newServerMsg.sendID ===
          useConversationStore.getState().currentConversation?.userID
        );
      default:
        return false;
    }
  };

  // conversation
  const conversationChnageHandler = ({ data }: WSEvent<ConversationItem[]>) => {
    updateConversationList(data, "filter");
  };
  const newConversationHandler = ({ data }: WSEvent<ConversationItem[]>) => {
    updateConversationList(data, "push");
  };
  const totalUnreadChangeHandler = ({ data }: WSEvent<number>) => {
    if (data === useConversationStore.getState().unReadCount) return;
    updateUnReadCount(data);
  };

  // friend
  const friednInfoChangeHandler = ({ data }: WSEvent<FriendUserItem>) => {
    updateFriend(data);
    const currentConversation = useConversationStore.getState().currentConversation;
    if (
      currentConversation?.conversationType === SessionType.Single &&
      currentConversation.userID === data.userID
    ) {
      updateMessageSender({
        userID: data.userID,
        nickname: data.remark || data.nickname,
        faceURL: data.faceURL,
      });
    }
  };
  const friednAddedHandler = ({ data }: WSEvent<FriendUserItem>) => {
    pushNewFriend(data);
  };
  const friednDeletedHandler = ({ data }: WSEvent<FriendUserItem>) => {
    updateFriend(data, true);
  };

  // blacklist
  const blackAddedHandler = ({ data }: WSEvent<BlackUserItem>) => {
    pushNewBlack(data);
  };
  const blackDeletedHandler = ({ data }: WSEvent<BlackUserItem>) => {
    IMSDK.getSpecifiedFriendsInfo({
      friendUserIDList: [data.userID],
    }).then(({ data }) => {
      if (data.length) {
        pushNewFriend(data[0]);
      }
    });
    updateBlack(data, true);
  };

  // group
  const joinedGroupAddedHandler = ({ data }: WSEvent<GroupItem>) => {
    updateConversationGroupInfo(data);
    if (data.groupID === useConversationStore.getState().currentConversation?.groupID) {
      updateCurrentGroupInfo(data);
      getCurrentMemberInGroupByReq(data.groupID);
    }
    pushNewGroup(data);
  };
  const joinedGroupDeletedHandler = ({ data }: WSEvent<GroupItem>) => {
    if (data.groupID === useConversationStore.getState().currentConversation?.groupID) {
      getCurrentGroupInfoByReq(data.groupID);
      setCurrentMemberInGroup();
    }
    updateGroup(data, true);
  };
  const joinedGroupDismissHandler = ({ data }: WSEvent<GroupItem>) => {
    if (data.groupID === useConversationStore.getState().currentConversation?.groupID) {
      getCurrentMemberInGroupByReq(data.groupID);
    }
  };
  const groupInfoChangedHandler = ({ data }: WSEvent<GroupItem>) => {
    updateConversationGroupInfo(data);
    updateGroup(data);
    if (data.groupID === useConversationStore.getState().currentConversation?.groupID) {
      updateCurrentGroupInfo(data);
    }
  };
  const groupMemberAddedHandler = ({ data }: WSEvent<GroupMemberItem>) => {
    if (
      data.groupID === useConversationStore.getState().currentConversation?.groupID &&
      data.userID === useUserStore.getState().selfInfo.userID
    ) {
      getCurrentMemberInGroupByReq(data.groupID);
    }
  };
  const groupMemberDeletedHandler = ({ data }: WSEvent<GroupMemberItem>) => {
    if (
      data.groupID === useConversationStore.getState().currentConversation?.groupID &&
      data.userID === useUserStore.getState().selfInfo.userID
    ) {
      getCurrentMemberInGroupByReq(data.groupID);
    }
  };
  const groupMemberInfoChangedHandler = ({ data }: WSEvent<GroupMemberItem>) => {
    if (data.groupID === useConversationStore.getState().currentConversation?.groupID) {
      tryUpdateCurrentMemberInGroup(data);
      updateMessageSender(data);
    }
  };

  //application
  const friendApplicationProcessedHandler = ({
    data,
  }: WSEvent<FriendApplicationItem>) => {
    const isRecv = data.toUserID === useUserStore.getState().selfInfo.userID;
    if (isRecv) {
      updateRecvFriendApplication(data);
    } else {
      updateSendFriendApplication(data);
    }
  };
  const groupApplicationProcessedHandler = ({
    data,
  }: WSEvent<GroupApplicationItem>) => {
    const isRecv = data.userID !== useUserStore.getState().selfInfo.userID;
    if (isRecv) {
      updateRecvGroupApplication(data);
    } else {
      updateSendGroupApplication(data);
    }
  };

  const disposeIMListener = () => {
    IMSDK.off(CbEvents.OnSelfInfoUpdated, selfUpdateHandler);
    IMSDK.off(CbEvents.OnConnecting, connectingHandler);
    IMSDK.off(CbEvents.OnConnectFailed, connectFailedHandler);
    IMSDK.off(CbEvents.OnConnectSuccess, connectSuccessHandler);
    IMSDK.off(CbEvents.OnKickedOffline, kickHandler);
    IMSDK.off(CbEvents.OnUserTokenExpired, expiredHandler);
    IMSDK.off(CbEvents.OnUserTokenInvalid, expiredHandler);
    // sync
    IMSDK.off(CbEvents.OnSyncServerStart, syncStartHandler);
    IMSDK.off(CbEvents.OnSyncServerProgress, syncProgressHandler);
    IMSDK.off(CbEvents.OnSyncServerFinish, syncFinishHandler);
    IMSDK.off(CbEvents.OnSyncServerFailed, syncFailedHandler);
    // message
    IMSDK.off(CbEvents.OnRecvNewMessage, newMessageHandler);
    IMSDK.off(CbEvents.OnRecvNewMessages, newMessagesHandler);
    IMSDK.off(CbEvents.OnUserStatusChanged, userStatusChangeHandler);
    IMSDK.off(CbEvents.OnRecvC2CReadReceipt, c2cReadReceiptHandler);
    IMSDK.off(CbEvents.OnRecvCustomBusinessMessage, customBusinessMessageHandler);
    // conversation
    IMSDK.off(CbEvents.OnConversationChanged, conversationChnageHandler);
    IMSDK.off(CbEvents.OnNewConversation, newConversationHandler);
    IMSDK.off(CbEvents.OnTotalUnreadMessageCountChanged, totalUnreadChangeHandler);
    // friend
    IMSDK.off(CbEvents.OnFriendInfoChanged, friednInfoChangeHandler);
    IMSDK.off(CbEvents.OnFriendAdded, friednAddedHandler);
    IMSDK.off(CbEvents.OnFriendDeleted, friednDeletedHandler);
    // blacklist
    IMSDK.off(CbEvents.OnBlackAdded, blackAddedHandler);
    IMSDK.off(CbEvents.OnBlackDeleted, blackDeletedHandler);
    // group
    IMSDK.off(CbEvents.OnJoinedGroupAdded, joinedGroupAddedHandler);
    IMSDK.off(CbEvents.OnJoinedGroupDeleted, joinedGroupDeletedHandler);
    IMSDK.off(CbEvents.OnGroupDismissed, joinedGroupDismissHandler);
    IMSDK.off(CbEvents.OnGroupInfoChanged, groupInfoChangedHandler);
    IMSDK.off(CbEvents.OnGroupMemberAdded, groupMemberAddedHandler);
    IMSDK.off(CbEvents.OnGroupMemberDeleted, groupMemberDeletedHandler);
    IMSDK.off(CbEvents.OnGroupMemberInfoChanged, groupMemberInfoChangedHandler);
    // application
    IMSDK.off(CbEvents.OnFriendApplicationAdded, friendApplicationProcessedHandler);
    IMSDK.off(CbEvents.OnFriendApplicationAccepted, friendApplicationProcessedHandler);
    IMSDK.off(CbEvents.OnFriendApplicationRejected, friendApplicationProcessedHandler);
    IMSDK.off(CbEvents.OnGroupApplicationAdded, groupApplicationProcessedHandler);
    IMSDK.off(CbEvents.OnGroupApplicationAccepted, groupApplicationProcessedHandler);
    IMSDK.off(CbEvents.OnGroupApplicationRejected, groupApplicationProcessedHandler);
  };

  const setIpcListener = () => {
    window.electronAPI?.subscribe("appResume", () => {
      if (resume.current) {
        return;
      }
      resume.current = true;
      setTimeout(() => {
        resume.current = false;
      }, 5000);
    });
  };
}

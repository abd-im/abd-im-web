import { createUserDisplayNameResolver } from "@/utils/userDisplayName";

type MessageWithID = {
  clientMsgID: string;
};

type MessageWithSender = {
  sendID: string;
  senderNickname: string;
  senderFaceUrl: string;
};

type MessageReadCandidate = {
  sendID: string;
  seq: number;
  isRead: boolean;
};

export type MessageSenderProfile = {
  userID: string;
  nickname: string;
  faceURL: string;
};

type FriendRemarkProfile = {
  userID: string;
  remark: string;
};

export const mergeHistoryMessages = <T extends MessageWithID>(
  currentMessages: T[],
  incomingMessages: T[],
  loadMore: boolean,
) => {
  const current = loadMore ? currentMessages : [];
  const seenIDs = new Set(current.map((message) => message.clientMsgID));
  const prependedMessages = incomingMessages.filter((message) => {
    if (seenIDs.has(message.clientMsgID)) return false;
    seenIDs.add(message.clientMsgID);
    return true;
  });

  return {
    messageList: [...prependedMessages, ...current],
    prependedCount: prependedMessages.length,
  };
};

export const updateHistoryMessageSender = <T extends MessageWithSender>(
  messages: T[],
  profile: MessageSenderProfile,
) => {
  let changed = false;
  const messageList = messages.map((message) => {
    if (
      message.sendID !== profile.userID ||
      (message.senderNickname === profile.nickname &&
        message.senderFaceUrl === profile.faceURL)
    ) {
      return message;
    }
    changed = true;
    return {
      ...message,
      senderNickname: profile.nickname,
      senderFaceUrl: profile.faceURL,
    };
  });

  return changed ? messageList : messages;
};

export const applyFriendRemarks = <T extends MessageWithSender>(
  messages: T[],
  friends: FriendRemarkProfile[],
) => {
  const resolveUserDisplayName = createUserDisplayNameResolver(friends);
  let changed = false;
  const messageList = messages.map((message) => {
    const displayName = resolveUserDisplayName({
      userID: message.sendID,
      nickname: message.senderNickname,
    });
    if (message.senderNickname === displayName) return message;
    changed = true;
    return { ...message, senderNickname: displayName };
  });

  return changed ? messageList : messages;
};

export const getLatestUnreadMessageSeq = (
  messages: MessageReadCandidate[],
  selfUserID: string,
) =>
  messages.reduce(
    (latestSeq, message) =>
      !message.isRead && message.sendID !== selfUserID
        ? Math.max(latestSeq, message.seq)
        : latestSeq,
    0,
  );

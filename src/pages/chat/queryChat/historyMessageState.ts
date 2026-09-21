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
  clientMsgID?: string;
  sendID: string;
  seq: number;
};

export const getFirstUnreadMessageIndex = (
  messages: MessageReadCandidate[],
  selfUserID: string,
  readSeq: number,
) =>
  messages.findIndex(
    (message) => message.seq > readSeq && message.sendID !== selfUserID,
  );

// A burn refresh must not replace newer message content.
export const mergeMessageBurnTime = <
  T extends { clientMsgID: string; attachedInfoElem?: { hasReadTime?: number } },
>(
  messages: T[],
  updates: T[],
) => {
  const byID = new Map(updates.map((message) => [message.clientMsgID, message]));
  let changed = false;
  const next = messages.map((message) => {
    const hasReadTime = byID.get(message.clientMsgID)?.attachedInfoElem?.hasReadTime;
    if (!hasReadTime || message.attachedInfoElem?.hasReadTime) return message;
    changed = true;
    return {
      ...message,
      attachedInfoElem: { ...message.attachedInfoElem, hasReadTime },
    };
  });
  return changed ? next : messages;
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

export const appendHistoryMessages = <T extends MessageWithID>(
  currentMessages: T[],
  incomingMessages: T[],
) => {
  const seenIDs = new Set(currentMessages.map((message) => message.clientMsgID));
  const appendedMessages = incomingMessages.filter((message) => {
    if (seenIDs.has(message.clientMsgID)) return false;
    seenIDs.add(message.clientMsgID);
    return true;
  });

  return {
    messageList: [...currentMessages, ...appendedMessages],
    appendedCount: appendedMessages.length,
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
  readSeq: number,
) =>
  messages.reduce(
    (latestSeq, message) =>
      message.seq > readSeq && message.sendID !== selfUserID
        ? Math.max(latestSeq, message.seq)
        : latestSeq,
    0,
  );

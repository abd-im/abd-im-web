type MessageWithID = {
  clientMsgID: string;
};

type MessageWithSender = {
  sendID: string;
  senderNickname: string;
  senderFaceUrl: string;
};

export type MessageSenderProfile = {
  userID: string;
  nickname: string;
  faceURL: string;
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

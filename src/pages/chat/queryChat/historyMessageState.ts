type MessageWithID = {
  clientMsgID: string;
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

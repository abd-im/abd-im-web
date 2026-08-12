import { MessageItem } from "@abd-im/wasm-client-sdk";

type RetryMessageFactory = () => Promise<MessageItem>;

const retryFactories = new Map<string, RetryMessageFactory>();

export const registerMessageRetry = (
  clientMsgID: string,
  factory: RetryMessageFactory,
) => {
  retryFactories.set(clientMsgID, factory);
};

export const clearMessageRetry = (clientMsgID: string) => {
  retryFactories.delete(clientMsgID);
};

export const moveMessageRetry = (fromClientMsgID: string, toClientMsgID: string) => {
  const factory = retryFactories.get(fromClientMsgID);
  if (!factory) return;
  retryFactories.delete(fromClientMsgID);
  retryFactories.set(toClientMsgID, factory);
};

export const recreateFailedMessage = async (clientMsgID: string) => {
  const factory = retryFactories.get(clientMsgID);
  if (!factory) return undefined;

  const recreated = await factory();
  clearMessageRetry(recreated.clientMsgID);
  recreated.clientMsgID = clientMsgID;
  retryFactories.set(clientMsgID, factory);
  return recreated;
};

import { MessageItem } from "@abd-im/wasm-client-sdk";

type RetryMessageFactory = () => Promise<MessageItem>;

const retryFactories = new Map<
  string,
  { create: RetryMessageFactory; dispose?: () => void }
>();

export const registerMessageRetry = (
  clientMsgID: string,
  factory: RetryMessageFactory,
  dispose?: () => void,
) => {
  retryFactories.set(clientMsgID, { create: factory, dispose });
};

export const clearMessageRetry = (clientMsgID: string) => {
  retryFactories.get(clientMsgID)?.dispose?.();
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

  const recreated = await factory.create();
  clearMessageRetry(recreated.clientMsgID);
  recreated.clientMsgID = clientMsgID;
  retryFactories.set(clientMsgID, factory);
  return recreated;
};

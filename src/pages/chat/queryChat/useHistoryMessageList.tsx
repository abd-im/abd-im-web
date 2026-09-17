import { MessageItem, ViewType } from "@abd-im/wasm-client-sdk";
import { useLatest, useRequest } from "ahooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { IMSDK } from "@/layout/MainContentWrap";
import { useUserStore } from "@/store/user";
import emitter, { emit } from "@/utils/events";

import type { MessageSenderProfile } from "./historyMessageState";
import {
  appendHistoryMessages,
  applySingleReadCursor,
  mergeHistoryMessages,
  updateHistoryMessageSender,
} from "./historyMessageState";

const START_INDEX = 10000;
const SPLIT_COUNT = 20;
const MAX_INITIAL_COUNT = 100;

const filterExpiredMessages = (messages: MessageItem[], conversationID: string) =>
  messages.filter((message) => {
    if (!message.attachedInfoElem) return true;
    const { isPrivateChat, burnDuration, hasReadTime } = message.attachedInfoElem;
    if (!isPrivateChat || !message.isRead || !hasReadTime) return true;
    const elapsed = Math.floor((Date.now() - hasReadTime) / 1000);
    if (elapsed < burnDuration) return true;
    void IMSDK.deleteMessageFromLocalStorage({
      conversationID,
      clientMsgID: message.clientMsgID,
    });
    return false;
  });

export function useHistoryMessageList(enabled = true, initialUnreadCount = 0) {
  const { conversationID } = useParams();
  const [loadState, setLoadState] = useState({
    conversationID: "",
    initLoading: true,
    hasMoreOld: true,
    hasMoreNew: false,
    hasPendingNewMessage: false,
    isAroundMessage: false,
    messageList: [] as MessageItem[],
    firstItemIndex: START_INDEX,
    listRevision: 0,
  });
  const latestLoadState = useLatest(loadState);
  const latestConversationID = useLatest(conversationID);
  const latestInitialUnreadCount = useLatest(initialUnreadCount);
  const pendingRequests = useRef(new Set<string>());
  const historyGeneration = useRef(0);

  useEffect(() => {
    const pushNewMessage = (message: MessageItem) => {
      setLoadState((preState) => {
        const idx = preState.messageList.findIndex(
          (item) => item.clientMsgID === message.clientMsgID,
        );
        if (idx < 0) {
          if (preState.hasMoreNew) {
            return { ...preState, hasPendingNewMessage: true };
          }
          return {
            ...preState,
            messageList: [...preState.messageList, message],
          };
        }

        const messageList = [...preState.messageList];
        messageList[idx] = {
          ...messageList[idx],
          ...message,
          attachedInfoElem: {
            ...messageList[idx].attachedInfoElem,
            ...message.attachedInfoElem,
          },
        };
        return { ...preState, messageList };
      });
    };
    const updateOneMessage = (message: MessageItem) => {
      setLoadState((preState) => {
        const tmpList = [...preState.messageList];
        const idx = tmpList.findIndex((msg) => msg.clientMsgID === message.clientMsgID);
        if (idx < 0) {
          return preState;
        }

        tmpList[idx] = {
          ...tmpList[idx],
          ...message,
          attachedInfoElem: {
            ...tmpList[idx].attachedInfoElem,
            ...message.attachedInfoElem,
          },
        } as MessageItem;
        return {
          ...preState,
          messageList: tmpList,
        };
      });
    };
    const deleteOneMessage = (clientMsgID: string) => {
      setLoadState((preState) => {
        const newList = preState.messageList.filter(
          (msg) => msg.clientMsgID !== clientMsgID,
        );
        return {
          ...preState,
          messageList: newList,
        };
      });
    };
    const clearHistory = () => {
      setLoadState((preState) => ({
        ...preState,
        messageList: [],
      }));
    };
    const updateMessageSender = (profile: MessageSenderProfile) => {
      setLoadState((preState) => {
        const messageList = updateHistoryMessageSender(preState.messageList, profile);
        return messageList === preState.messageList
          ? preState
          : { ...preState, messageList };
      });
    };
    const applyReadCursor = (receipt: {
      conversationID: string;
      userID: string;
      hasReadSeq: number;
      readTime: number;
    }) => {
      if (receipt.conversationID !== latestConversationID.current) return;
      setLoadState((previous) => {
        const messageList = applySingleReadCursor(
          previous.messageList,
          useUserStore.getState().selfInfo.userID,
          receipt.userID,
          receipt.hasReadSeq,
          receipt.readTime,
        );
        return messageList === previous.messageList
          ? previous
          : { ...previous, messageList };
      });
    };
    emitter.on("PUSH_NEW_MSG", pushNewMessage);
    emitter.on("UPDATE_ONE_MSG", updateOneMessage);
    emitter.on("UPDATE_MSG_SENDER", updateMessageSender);
    emitter.on("C2C_READ_CURSOR", applyReadCursor);
    emitter.on("DELETE_ONE_MSG", deleteOneMessage);
    emitter.on("CLEAR_HISTORY_DONE", clearHistory);
    return () => {
      emitter.off("PUSH_NEW_MSG", pushNewMessage);
      emitter.off("UPDATE_ONE_MSG", updateOneMessage);
      emitter.off("UPDATE_MSG_SENDER", updateMessageSender);
      emitter.off("C2C_READ_CURSOR", applyReadCursor);
      emitter.off("DELETE_ONE_MSG", deleteOneMessage);
      emitter.off("CLEAR_HISTORY_DONE", clearHistory);
    };
  }, [latestConversationID]);

  const { loading: moreOldLoading, runAsync: getMoreOldMessages } = useRequest<
    void,
    [loadMore?: boolean]
  >(
    async (loadMore = true) => {
      const reqConversationID = conversationID;
      const generation = loadMore
        ? historyGeneration.current
        : ++historyGeneration.current;
      const startClientMsgID = loadMore
        ? latestLoadState.current?.messageList[0]?.clientMsgID ?? ""
        : "";
      const requestKey = `${
        reqConversationID ?? ""
      }:old:${generation}:${startClientMsgID}`;
      if (pendingRequests.current.has(requestKey)) return;
      pendingRequests.current.add(requestKey);

      try {
        const { data } = await IMSDK.getAdvancedHistoryMessageList({
          count: loadMore
            ? SPLIT_COUNT
            : Math.min(
                MAX_INITIAL_COUNT,
                Math.max(SPLIT_COUNT, (latestInitialUnreadCount.current ?? 0) + 10),
              ),
          startClientMsgID,
          conversationID: reqConversationID ?? "",
          viewType: ViewType.History,
        });
        if (
          latestConversationID.current !== reqConversationID ||
          historyGeneration.current !== generation
        )
          return;

        const filteredMessages = filterExpiredMessages(
          data.messageList,
          reqConversationID ?? "",
        );

        setLoadState((preState) => {
          const { messageList, prependedCount } = mergeHistoryMessages(
            preState.messageList,
            filteredMessages,
            loadMore,
          );
          return {
            ...preState,
            conversationID: reqConversationID ?? "",
            initLoading: false,
            hasMoreOld: !data.isEnd && (!loadMore || prependedCount > 0),
            hasMoreNew: loadMore ? preState.hasMoreNew : false,
            hasPendingNewMessage: loadMore ? preState.hasPendingNewMessage : false,
            isAroundMessage: loadMore ? preState.isAroundMessage : false,
            messageList,
            firstItemIndex:
              (loadMore ? preState.firstItemIndex : START_INDEX) - prependedCount,
            listRevision: loadMore ? preState.listRevision : generation,
          };
        });
      } finally {
        pendingRequests.current.delete(requestKey);
      }
    },
    {
      manual: true,
    },
  );

  const { loading: moreNewLoading, runAsync: getMoreNewMessages } = useRequest<
    void,
    []
  >(
    async () => {
      const reqConversationID = conversationID;
      const state = latestLoadState.current;
      if (!state?.hasMoreNew || !state.isAroundMessage) return;
      const startClientMsgID =
        state.messageList[state.messageList.length - 1]?.clientMsgID;
      if (!startClientMsgID) return;
      const generation = historyGeneration.current;
      const requestKey = `${
        reqConversationID ?? ""
      }:new:${generation}:${startClientMsgID}`;
      if (pendingRequests.current.has(requestKey)) return;
      pendingRequests.current.add(requestKey);

      try {
        const { data } = await IMSDK.getAdvancedHistoryMessageListReverse({
          count: SPLIT_COUNT,
          startClientMsgID,
          conversationID: reqConversationID ?? "",
          viewType: ViewType.History,
        });
        if (
          latestConversationID.current !== reqConversationID ||
          historyGeneration.current !== generation
        )
          return;

        const filteredMessages = filterExpiredMessages(
          data.messageList,
          reqConversationID ?? "",
        );
        setLoadState((preState) => {
          if (
            preState.conversationID !== reqConversationID ||
            historyGeneration.current !== generation
          ) {
            return preState;
          }
          const { messageList, appendedCount } = appendHistoryMessages(
            preState.messageList,
            filteredMessages,
          );
          const retryPendingMessage = data.isEnd && preState.hasPendingNewMessage;
          const hasMoreNew = retryPendingMessage || (!data.isEnd && appendedCount > 0);
          return {
            ...preState,
            hasMoreNew,
            hasPendingNewMessage: retryPendingMessage
              ? false
              : preState.hasPendingNewMessage,
            isAroundMessage: hasMoreNew,
            messageList,
          };
        });
      } finally {
        pendingRequests.current.delete(requestKey);
      }
    },
    { manual: true },
  );

  useEffect(() => {
    if (!enabled) {
      historyGeneration.current += 1;
      setLoadState({
        conversationID: conversationID ?? "",
        initLoading: false,
        hasMoreOld: false,
        hasMoreNew: false,
        hasPendingNewMessage: false,
        isAroundMessage: false,
        messageList: [],
        firstItemIndex: START_INDEX,
        listRevision: historyGeneration.current,
      });
      return;
    }
    void getMoreOldMessages(false);
    return () => {
      historyGeneration.current += 1;
      setLoadState(() => ({
        conversationID: "",
        initLoading: true,
        hasMoreOld: true,
        hasMoreNew: false,
        hasPendingNewMessage: false,
        isAroundMessage: false,
        messageList: [] as MessageItem[],
        firstItemIndex: START_INDEX,
        listRevision: historyGeneration.current,
      }));
    };
  }, [conversationID, enabled, getMoreOldMessages]);

  const showSurroundingMessages = useCallback(
    (messageList: MessageItem[]) => {
      const generation = ++historyGeneration.current;
      setLoadState({
        conversationID: latestConversationID.current ?? "",
        initLoading: false,
        hasMoreOld: true,
        hasMoreNew: true,
        hasPendingNewMessage: false,
        isAroundMessage: true,
        messageList,
        firstItemIndex: START_INDEX - messageList.length,
        listRevision: generation,
      });
    },
    [latestConversationID],
  );

  return {
    SPLIT_COUNT,
    loadState,
    latestLoadState,
    conversationID,
    moreOldLoading,
    moreNewLoading,
    getMoreOldMessages,
    getMoreNewMessages,
    showSurroundingMessages,
  };
}

export const pushNewMessage = (message: MessageItem) => emit("PUSH_NEW_MSG", message);
export const updateOneMessage = (message: MessageItem) =>
  emit("UPDATE_ONE_MSG", message);
export const updateMessageSender = (profile: MessageSenderProfile) =>
  emit("UPDATE_MSG_SENDER", profile);
export const updateSingleReadCursor = (receipt: {
  conversationID: string;
  userID: string;
  hasReadSeq: number;
  readTime: number;
}) => emit("C2C_READ_CURSOR", receipt);
export const deleteMessage = (clientMsgID: string) =>
  emit("DELETE_ONE_MSG", clientMsgID);

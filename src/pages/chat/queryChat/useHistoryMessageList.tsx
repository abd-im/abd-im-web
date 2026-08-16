import { MessageItem, ViewType } from "@abd-im/wasm-client-sdk";
import { useLatest, useRequest } from "ahooks";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { IMSDK } from "@/layout/MainContentWrap";
import emitter, { emit } from "@/utils/events";

import type { MessageSenderProfile } from "./historyMessageState";
import {
  mergeHistoryMessages,
  updateHistoryMessageSender,
} from "./historyMessageState";

const START_INDEX = 10000;
const SPLIT_COUNT = 20;

export function useHistoryMessageList(enabled = true) {
  const { conversationID } = useParams();
  const [loadState, setLoadState] = useState({
    initLoading: true,
    hasMoreOld: true,
    messageList: [] as MessageItem[],
    firstItemIndex: START_INDEX,
  });
  const latestLoadState = useLatest(loadState);
  const latestConversationID = useLatest(conversationID);
  const pendingRequests = useRef(new Set<string>());

  useEffect(() => {
    const pushNewMessage = (message: MessageItem) => {
      setLoadState((preState) => {
        const idx = preState.messageList.findIndex(
          (item) => item.clientMsgID === message.clientMsgID,
        );
        if (idx < 0) {
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
    emitter.on("PUSH_NEW_MSG", pushNewMessage);
    emitter.on("UPDATE_ONE_MSG", updateOneMessage);
    emitter.on("UPDATE_MSG_SENDER", updateMessageSender);
    emitter.on("DELETE_ONE_MSG", deleteOneMessage);
    emitter.on("CLEAR_HISTORY_DONE", clearHistory);
    return () => {
      emitter.off("PUSH_NEW_MSG", pushNewMessage);
      emitter.off("UPDATE_ONE_MSG", updateOneMessage);
      emitter.off("UPDATE_MSG_SENDER", updateMessageSender);
      emitter.off("DELETE_ONE_MSG", deleteOneMessage);
      emitter.off("CLEAR_HISTORY_DONE", clearHistory);
    };
  }, []);

  const { loading: moreOldLoading, runAsync: getMoreOldMessages } = useRequest<
    void,
    [loadMore?: boolean]
  >(
    async (loadMore = true) => {
      const reqConversationID = conversationID;
      const startClientMsgID = loadMore
        ? latestLoadState.current.messageList[0]?.clientMsgID ?? ""
        : "";
      const requestKey = `${reqConversationID ?? ""}:${startClientMsgID}`;
      if (pendingRequests.current.has(requestKey)) return;
      pendingRequests.current.add(requestKey);

      try {
        const { data } = await IMSDK.getAdvancedHistoryMessageList({
          count: SPLIT_COUNT,
          startClientMsgID,
          conversationID: reqConversationID ?? "",
          viewType: ViewType.History,
        });
        if (latestConversationID.current !== reqConversationID) return;

        const filteredMessages = data.messageList.filter((msg: MessageItem) => {
          if (!msg.attachedInfoElem) return true;
          const { isPrivateChat, burnDuration, hasReadTime } = msg.attachedInfoElem;
          if (isPrivateChat && msg.isRead && hasReadTime) {
            const now = Date.now();
            const diff = Math.floor((now - hasReadTime) / 1000);
            if (diff >= burnDuration) {
              IMSDK.deleteMessageFromLocalStorage({
                conversationID: reqConversationID ?? "",
                clientMsgID: msg.clientMsgID,
              });
              return false;
            }
          }
          return true;
        });

        setLoadState((preState) => {
          const { messageList, prependedCount } = mergeHistoryMessages(
            preState.messageList,
            filteredMessages,
            loadMore,
          );
          return {
            ...preState,
            initLoading: false,
            hasMoreOld: !data.isEnd && (!loadMore || prependedCount > 0),
            messageList,
            firstItemIndex:
              (loadMore ? preState.firstItemIndex : START_INDEX) - prependedCount,
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

  useEffect(() => {
    if (!enabled) {
      setLoadState({
        initLoading: false,
        hasMoreOld: false,
        messageList: [],
        firstItemIndex: START_INDEX,
      });
      return;
    }
    void getMoreOldMessages(false);
    return () => {
      setLoadState(() => ({
        initLoading: true,
        hasMoreOld: true,
        messageList: [] as MessageItem[],
        firstItemIndex: START_INDEX,
      }));
    };
  }, [conversationID, enabled, getMoreOldMessages]);

  return {
    SPLIT_COUNT,
    loadState,
    latestLoadState,
    conversationID,
    moreOldLoading,
    getMoreOldMessages,
  };
}

export const pushNewMessage = (message: MessageItem) => emit("PUSH_NEW_MSG", message);
export const updateOneMessage = (message: MessageItem) =>
  emit("UPDATE_ONE_MSG", message);
export const updateMessageSender = (profile: MessageSenderProfile) =>
  emit("UPDATE_MSG_SENDER", profile);
export const deleteMessage = (clientMsgID: string) =>
  emit("DELETE_ONE_MSG", clientMsgID);

import { MessageItem, ViewType } from "@abd-im/wasm-client-sdk";
import { useLatest, useRequest } from "ahooks";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { IMSDK } from "@/layout/MainContentWrap";
import emitter, { emit } from "@/utils/events";

const START_INDEX = 10000;
const SPLIT_COUNT = 20;

export function useHistoryMessageList() {
  const { conversationID } = useParams();
  const [loadState, setLoadState] = useState({
    initLoading: true,
    hasMoreOld: true,
    messageList: [] as MessageItem[],
    firstItemIndex: START_INDEX,
  });
  const latestLoadState = useLatest(loadState);

  useEffect(() => {
    loadHistoryMessages();
    return () => {
      setLoadState(() => ({
        initLoading: true,
        hasMoreOld: true,
        messageList: [] as MessageItem[],
        firstItemIndex: START_INDEX,
      }));
    };
  }, [conversationID]);

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
    emitter.on("PUSH_NEW_MSG", pushNewMessage);
    emitter.on("UPDATE_ONE_MSG", updateOneMessage);
    emitter.on("DELETE_ONE_MSG", deleteOneMessage);
    emitter.on("CLEAR_HISTORY_DONE", clearHistory);
    return () => {
      emitter.off("PUSH_NEW_MSG", pushNewMessage);
      emitter.off("UPDATE_ONE_MSG", updateOneMessage);
      emitter.off("DELETE_ONE_MSG", deleteOneMessage);
      emitter.off("CLEAR_HISTORY_DONE", clearHistory);
    };
  }, []);

  const loadHistoryMessages = () => getMoreOldMessages(false);

  const { loading: moreOldLoading, runAsync: getMoreOldMessages } = useRequest(
    async (loadMore = true) => {
      const reqConversationID = conversationID;
      const { data } = await IMSDK.getAdvancedHistoryMessageList({
        count: SPLIT_COUNT,
        startClientMsgID: loadMore
          ? latestLoadState.current.messageList[0]?.clientMsgID
          : "",
        conversationID: conversationID ?? "",
        viewType: ViewType.History,
      });
      if (conversationID !== reqConversationID) return;

      const filteredMessages = data.messageList.filter((msg: MessageItem) => {
        if (!msg.attachedInfoElem) return true;
        const { isPrivateChat, burnDuration, hasReadTime } = msg.attachedInfoElem;
        if (isPrivateChat && msg.isRead && hasReadTime) {
          const now = Date.now();
          const diff = Math.floor((now - hasReadTime) / 1000);
          if (diff >= burnDuration) {
            IMSDK.deleteMessageFromLocalStorage({
              conversationID: reqConversationID!,
              clientMsgID: msg.clientMsgID,
            });
            return false;
          }
        }
        return true;
      });

      setLoadState((preState) => ({
        ...preState,
        initLoading: false,
        hasMoreOld: !data.isEnd,
        messageList: [...filteredMessages, ...(loadMore ? preState.messageList : [])],
        firstItemIndex: preState.firstItemIndex - filteredMessages.length,
      }));
    },
    {
      manual: true,
    },
  );

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
export const deleteMessage = (clientMsgID: string) =>
  emit("DELETE_ONE_MSG", clientMsgID);

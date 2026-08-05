import {
  MessageItem,
  MessageStatus,
  MessageType,
  SessionType,
} from "@abd-im/wasm-client-sdk";
import { Layout, Spin } from "antd";
import clsx from "clsx";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import { SystemMessageTypes } from "@/constants/im";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import emitter from "@/utils/events";

import MessageItemComponent from "./MessageItem";
import NotificationMessage from "./NotificationMessage";
import { updateOneMessage, useHistoryMessageList } from "./useHistoryMessageList";
import { useMessageReactions } from "./useMessageReactions";

const REACTABLE_MESSAGE_TYPES = new Set<MessageType>([
  MessageType.TextMessage,
  MessageType.PictureMessage,
  MessageType.VoiceMessage,
  MessageType.VideoMessage,
  MessageType.FileMessage,
  MessageType.AtTextMessage,
  MessageType.MergeMessage,
  MessageType.CardMessage,
  MessageType.LocationMessage,
  MessageType.CustomMessage,
  MessageType.QuoteMessage,
]);

const ChatContent = () => {
  const virtuoso = useRef<VirtuosoHandle>(null);
  const lastMsgIdRef = useRef<string>("");
  const selfUserID = useUserStore((state) => state.selfInfo.userID);
  const connectState = useUserStore((state) => state.connectState);
  const syncState = useUserStore((state) => state.syncState);
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((behavior: "auto" | "smooth" = "auto") => {
    setTimeout(
      () => {
        virtuoso.current?.scrollToIndex({
          index: 99999,
          align: "end",
          behavior,
        });
      },
      behavior === "smooth" ? 50 : 0,
    );
  }, []);

  const {
    SPLIT_COUNT,
    conversationID,
    loadState,
    latestLoadState,
    moreOldLoading,
    getMoreOldMessages,
  } = useHistoryMessageList();

  const reactionsEnabled =
    !window.electronAPI &&
    currentConversation?.conversationID === conversationID &&
    !currentConversation?.isPrivateChat &&
    !currentConversation?.isMsgDestruct;
  const reactableMessages = useMemo(
    () =>
      reactionsEnabled
        ? loadState.messageList.filter(
            (message) =>
              REACTABLE_MESSAGE_TYPES.has(message.contentType) &&
              message.status === MessageStatus.Succeed &&
              Boolean(message.serverMsgID) &&
              !message.attachedInfoElem?.isPrivateChat,
          )
        : [],
    [loadState.messageList, reactionsEnabled],
  );
  const reactableMessageIDs = useMemo(
    () => new Set(reactableMessages.map((message) => message.clientMsgID)),
    [reactableMessages],
  );
  const { summaries, isPending, toggleReaction } = useMessageReactions(
    reactionsEnabled ? conversationID : undefined,
    reactableMessages,
    selfUserID,
    connectState === "success" && syncState === "success",
  );

  useEffect(() => {
    lastMsgIdRef.current = "";
  }, [conversationID]);

  useEffect(() => {
    if (conversationID) {
      IMSDK.markConversationMessageAsRead(conversationID).then(() => {
        latestLoadState.current?.messageList.forEach((msg) => {
          if (!msg.isRead && msg.sendID !== selfUserID) {
            updateOneMessage({
              clientMsgID: msg.clientMsgID,
              isRead: true,
              attachedInfoElem: { hasReadTime: Date.now() },
            } as MessageItem);
          }
        });
      });
      scrollToBottom();
    }
  }, [conversationID, scrollToBottom]);

  useEffect(() => {
    if (!conversationID || loadState.messageList.length === 0) return;

    const latestMsg = loadState.messageList[loadState.messageList.length - 1];
    const latestMsgId = latestMsg.clientMsgID;
    const isNewMsg = latestMsgId !== lastMsgIdRef.current;

    if (isNewMsg) {
      const oldId = lastMsgIdRef.current;
      lastMsgIdRef.current = latestMsgId;
      if (oldId) {
        const isSelf = latestMsg.sendID === selfUserID;
        if (isSelf || atBottom) {
          scrollToBottom("smooth");
        }
      }
    }

    if (atBottom) {
      IMSDK.markConversationMessageAsRead(conversationID).then(() => {
        latestLoadState.current?.messageList.forEach((msg) => {
          if (!msg.isRead && msg.sendID !== selfUserID) {
            updateOneMessage({
              clientMsgID: msg.clientMsgID,
              isRead: true,
              attachedInfoElem: { hasReadTime: Date.now() },
            } as MessageItem);
          }
        });
      });
    }
  }, [
    loadState.messageList.length,
    conversationID,
    selfUserID,
    atBottom,
    scrollToBottom,
  ]);

  useEffect(() => {
    const scrollHandler = () => scrollToBottom("smooth");
    emitter.on("CHAT_LIST_SCROLL_TO_BOTTOM", scrollHandler);
    return () => {
      emitter.off("CHAT_LIST_SCROLL_TO_BOTTOM", scrollHandler);
    };
  }, [scrollToBottom]);

  const loadMoreMessage = () => {
    if (!loadState.hasMoreOld || moreOldLoading) return;
    getMoreOldMessages();
  };

  return (
    <Layout.Content
      className="relative flex h-full flex-col overflow-hidden !bg-white"
      id="chat-main-content"
    >
      {loadState.initLoading ? (
        <div className="flex h-full w-full items-center justify-center bg-white pt-1">
          <Spin spinning />
        </div>
      ) : (
        <Virtuoso
          id="chat-list"
          className="w-full flex-1"
          followOutput={() => false}
          firstItemIndex={loadState.firstItemIndex}
          initialTopMostItemIndex={99999}
          startReached={loadMoreMessage}
          atBottomStateChange={setAtBottom}
          ref={virtuoso}
          data={loadState.messageList}
          context={summaries}
          increaseViewportBy={500}
          components={{
            Header: () =>
              loadState.hasMoreOld ? (
                <div
                  className={clsx(
                    "flex justify-center py-2 opacity-0",
                    moreOldLoading && "opacity-100",
                  )}
                >
                  <Spin />
                </div>
              ) : null,
          }}
          computeItemKey={(_, item) => item.clientMsgID}
          itemContent={(_, message, reactionSummaries) => {
            if (SystemMessageTypes.includes(message.contentType)) {
              return (
                <NotificationMessage key={message.clientMsgID} message={message} />
              );
            }
            const canReact = reactableMessageIDs.has(message.clientMsgID);
            return (
              <MessageItemComponent
                key={message.clientMsgID}
                conversationID={conversationID}
                message={message}
                reactionSummary={reactionSummaries[message.clientMsgID]}
                isReactionPending={
                  canReact
                    ? (emoji) => isPending(message.clientMsgID, emoji)
                    : undefined
                }
                onToggleReaction={
                  canReact
                    ? (emoji, reactedByMe) =>
                        toggleReaction(message.clientMsgID, emoji, reactedByMe)
                    : undefined
                }
                messageUpdateFlag={
                  message.senderNickname +
                  message.senderFaceUrl +
                  String(message.isRead) +
                  String(message.status) +
                  String(message.attachedInfoElem?.hasReadTime)
                }
              />
            );
          }}
        />
      )}
    </Layout.Content>
  );
};

export default memo(ChatContent);

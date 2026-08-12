import { MessageItem, MessageStatus, MessageType } from "@abd-im/wasm-client-sdk";
import { Layout, Spin } from "antd";
import clsx from "clsx";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import { message as antMessage } from "@/AntdGlobalComp";
import { SystemMessageTypes } from "@/constants/im";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import emitter from "@/utils/events";

import { moveMessageRetry, recreateFailedMessage } from "./ChatFooter/messageRetry";
import { useFileMessage } from "./ChatFooter/SendActionBar/useFileMessage";
import { useSendMessage } from "./ChatFooter/useSendMessage";
import ForwardSelectionBar from "./forwarding/ForwardSelectionBar";
import ForwardTargetModal, { ForwardTarget } from "./forwarding/ForwardTargetModal";
import MessageItemComponent from "./MessageItem";
import { getMessagePreview } from "./messagePreview";
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
  const { t } = useTranslation();
  const virtuoso = useRef<VirtuosoHandle>(null);
  const lastMsgIdRef = useRef<string>("");
  const selfUserID = useUserStore((state) => state.selfInfo.userID);
  const connectState = useUserStore((state) => state.connectState);
  const syncState = useUserStore((state) => state.syncState);
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const conversationList = useConversationStore((state) => state.conversationList);
  const [atBottom, setAtBottom] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIDs, setSelectedMessageIDs] = useState<Set<string>>(
    () => new Set(),
  );
  const [forwardMode, setForwardMode] = useState<"merge" | "single">("merge");
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [forwardSubmitting, setForwardSubmitting] = useState(false);
  const { sendMessage } = useSendMessage();
  const {
    getFileMessage,
    getImageMessage,
    getVideoMessage,
    recreateFileBackedMessage,
  } = useFileMessage();

  const selectReplacementFile = useCallback((contentType: MessageType) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      contentType === MessageType.PictureMessage
        ? "image/*"
        : contentType === MessageType.VideoMessage
        ? "video/*"
        : "*";

    return new Promise<File | undefined>((resolve) => {
      input.onchange = () => resolve(input.files?.[0]);
      input.click();
    });
  }, []);

  const retryMessage = useCallback(
    async (message: MessageItem) => {
      try {
        let recreated =
          (await recreateFailedMessage(message.clientMsgID)) ??
          (await recreateFileBackedMessage(message));
        const isFileBackedMessage = [
          MessageType.PictureMessage,
          MessageType.VideoMessage,
          MessageType.FileMessage,
        ].includes(message.contentType);
        if (!recreated && isFileBackedMessage) {
          const replacement = await selectReplacementFile(message.contentType);
          if (!replacement) return;
          recreated =
            message.contentType === MessageType.PictureMessage
              ? await getImageMessage(replacement)
              : message.contentType === MessageType.VideoMessage
              ? await getVideoMessage(replacement)
              : await getFileMessage(replacement);
        }
        if (recreated && recreated.clientMsgID !== message.clientMsgID) {
          moveMessageRetry(recreated.clientMsgID, message.clientMsgID);
          recreated.clientMsgID = message.clientMsgID;
        }
        const sent = await sendMessage({ message: recreated ?? message });
        if (!sent) {
          antMessage.error(t("toast.uploadFailed"));
        }
      } catch {
        antMessage.error(t("toast.uploadFailed"));
      }
    },
    [
      getFileMessage,
      getImageMessage,
      getVideoMessage,
      recreateFileBackedMessage,
      selectReplacementFile,
      sendMessage,
      t,
    ],
  );

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
    conversationID,
    loadState,
    latestLoadState,
    moreOldLoading,
    getMoreOldMessages,
  } = useHistoryMessageList();

  const selectedMessages = useMemo(
    () =>
      loadState.messageList.filter((message) =>
        selectedMessageIDs.has(message.clientMsgID),
      ),
    [loadState.messageList, selectedMessageIDs],
  );

  const isForwardableMessage = useCallback(
    (message: MessageItem) =>
      message.status === MessageStatus.Succeed &&
      Boolean(message.clientMsgID) &&
      !message.attachedInfoElem?.isPrivateChat,
    [],
  );

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
    setSelectionMode(false);
    setSelectedMessageIDs(new Set());
    setForwardDialogOpen(false);
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

  const closeSelection = () => {
    setSelectionMode(false);
    setSelectedMessageIDs(new Set());
  };

  const enterSelection = (messageID: string) => {
    setSelectionMode(true);
    setSelectedMessageIDs(new Set([messageID]));
  };

  const toggleSelection = (messageID: string) => {
    setSelectedMessageIDs((current) => {
      const next = new Set(current);
      if (next.has(messageID)) {
        next.delete(messageID);
      } else {
        next.add(messageID);
      }
      return next;
    });
  };

  const openForwardDialog = (mode: "merge" | "single") => {
    if (!selectedMessages.length) return;
    setForwardMode(mode);
    setForwardDialogOpen(true);
  };

  const openSingleForward = (messageID: string) => {
    setSelectionMode(true);
    setSelectedMessageIDs(new Set([messageID]));
    setForwardMode("single");
    setForwardDialogOpen(true);
  };

  const resolveTargetConversation = async (target: ForwardTarget) => {
    const existing = conversationList.find(
      (conversation) =>
        conversation.conversationType === target.sessionType &&
        (target.isGroup ? conversation.groupID : conversation.userID) ===
          target.sourceID,
    );
    if (existing) return existing;

    return (
      await IMSDK.getOneConversation({
        sourceID: target.sourceID,
        sessionType: target.sessionType,
      })
    ).data;
  };

  const submitForward = async (targets: ForwardTarget[]) => {
    if (!selectedMessages.length || !currentConversation) return false;

    setForwardSubmitting(true);
    let successCount = 0;
    try {
      for (const target of targets) {
        try {
          const targetConversation = await resolveTargetConversation(target);
          let targetSucceeded = true;
          if (forwardMode === "merge") {
            const { data: message } = await IMSDK.createMergerMessage({
              messageList: selectedMessages.map((item) => ({ ...item })),
              title: `${currentConversation.showName} ${t(
                "placeholder.messageHistory",
              )}`,
              summaryList: selectedMessages.map(
                (item) => `${item.senderNickname}: ${getMessagePreview(item)}`,
              ),
            });
            targetSucceeded = await sendMessage({
              message,
              conversation: targetConversation,
            });
          } else {
            for (const sourceMessage of selectedMessages) {
              const { data: message } = await IMSDK.createForwardMessage({
                ...sourceMessage,
              });
              if (!(await sendMessage({ message, conversation: targetConversation }))) {
                targetSucceeded = false;
              }
            }
          }
          if (targetSucceeded) successCount += 1;
        } catch (error) {
          console.error("Failed to forward messages", error);
        }
      }
    } finally {
      setForwardSubmitting(false);
    }

    if (successCount === targets.length) {
      antMessage.success(t("toast.forwardSuccess", { count: successCount }));
    } else if (successCount) {
      antMessage.warning(
        t("toast.forwardPartialFailed", {
          success: successCount,
          failed: targets.length - successCount,
        }),
      );
    } else {
      antMessage.error(t("toast.forwardFailed"));
    }

    if (successCount) closeSelection();
    return successCount > 0;
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
                selectionMode={selectionMode}
                selected={selectedMessageIDs.has(message.clientMsgID)}
                selectable={isForwardableMessage(message)}
                onEnterSelection={enterSelection}
                onToggleSelection={toggleSelection}
                onForward={openSingleForward}
                onRetry={() => void retryMessage(message)}
              />
            );
          }}
        />
      )}
      {selectionMode && (
        <ForwardSelectionBar
          count={selectedMessages.length}
          onMergeForward={() => openForwardDialog("merge")}
          onSingleForward={() => openForwardDialog("single")}
          onDelete={() => void antMessage.info(t("toast.batchDeleteUnavailable"))}
          onClose={closeSelection}
        />
      )}
      <ForwardTargetModal
        open={forwardDialogOpen}
        messageCount={selectedMessages.length}
        submitting={forwardSubmitting}
        onOpenChange={setForwardDialogOpen}
        onSubmit={submitForward}
      />
    </Layout.Content>
  );
};

export default memo(ChatContent);

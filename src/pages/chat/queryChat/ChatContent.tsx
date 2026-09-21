import {
  GroupAtType,
  MessageItem,
  MessageStatus,
  MessageType,
  SessionType,
} from "@abd-im/wasm-client-sdk";
import { Layout, Spin } from "antd";
import clsx from "clsx";
import { AtSign, ChevronDown } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import { message as antMessage } from "@/AntdGlobalComp";
import { Button } from "@/components/ui";
import { SystemMessageTypes } from "@/constants/im";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import { useContactStore } from "@/store/contact";
import type { QuoteLocation } from "@/utils/events";
import emitter from "@/utils/events";

import { moveMessageRetry, recreateFailedMessage } from "./ChatFooter/messageRetry";
import { useFileMessage } from "./ChatFooter/SendActionBar/useFileMessage";
import { useSendMessage } from "./ChatFooter/useSendMessage";
import ForwardSelectionBar from "./forwarding/ForwardSelectionBar";
import ForwardTargetModal, { ForwardTarget } from "./forwarding/ForwardTargetModal";
import {
  applyFriendRemarks,
  getFirstUnreadMessageIndex,
  getLatestUnreadMessageSeq,
} from "./historyMessageState";
import { isMessageMentioningUser } from "./mentions";
import { formatMessageDate, messageDate, startsMessageDay } from "./messageDate";
import MessageItemComponent from "./MessageItem";
import { getMessagePreview } from "./messagePreview";
import NotificationMessage from "./NotificationMessage";
import { spotlightQuote } from "./partialQuote";
import { useHistoryMessageList } from "./useHistoryMessageList";
import { useMessageReactions } from "./useMessageReactions";
import { useMessageReadReceipts } from "./useMessageReadReceipts";

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

const hasUnreadMentionFlag = (groupAtType?: GroupAtType) =>
  groupAtType === GroupAtType.AtMe ||
  groupAtType === GroupAtType.AtAll ||
  groupAtType === GroupAtType.AtAllAtMe;

const sortMessagesByPosition = (left: MessageItem, right: MessageItem) =>
  left.seq - right.seq || left.sendTime - right.sendTime;

const LOCATE_SETTLE_TIMEOUT = 1200;

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
  const friendList = useContactStore((state) => state.friendList);
  const entryUnreadRef = useRef({ conversationID: "", count: 0, readSeq: 0 });
  const unreadBoundaryRef = useRef<{
    conversationID: string;
    clientMsgID?: string;
    initialized: boolean;
  }>({ conversationID: "", initialized: false });
  const activeConversationID = currentConversation?.conversationID ?? "";
  const currentUnreadCount = currentConversation?.unreadCount ?? 0;
  const readSeq = currentConversation?.readSeq ?? 0;
  if (activeConversationID !== entryUnreadRef.current.conversationID) {
    entryUnreadRef.current = {
      conversationID: activeConversationID,
      count: currentUnreadCount,
      readSeq,
    };
    unreadBoundaryRef.current = {
      conversationID: activeConversationID,
      initialized: false,
    };
  }
  const entryUnreadCount = entryUnreadRef.current.count;
  const [atBottom, setAtBottom] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIDs, setSelectedMessageIDs] = useState<Set<string>>(
    () => new Set(),
  );
  const [forwardMode, setForwardMode] = useState<"merge" | "single">("merge");
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [forwardSubmitting, setForwardSubmitting] = useState(false);
  const [pendingQuoteLocation, setPendingQuoteLocation] = useState<QuoteLocation>();
  const pendingQuoteLocationRef = useRef<QuoteLocation>();
  const [spotlightedMessageID, setSpotlightedMessageID] = useState("");
  const clearSpotlightRef = useRef<() => void>();
  const locateRequestRef = useRef(0);
  const locateScrollFrameRef = useRef(0);
  const [mentionTargets, setMentionTargets] = useState<MessageItem[]>([]);
  const [mentionJumping, setMentionJumping] = useState(false);
  const handledMentionIDs = useRef(new Set<string>());
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
    moreOldLoading,
    moreNewLoading,
    getMoreOldMessages,
    getMoreNewMessages,
    showSurroundingMessages,
  } = useHistoryMessageList(true, entryUnreadCount);
  const historyReady =
    !loadState.initLoading && loadState.conversationID === conversationID;

  const updatePendingQuoteLocation = useCallback((location?: QuoteLocation) => {
    pendingQuoteLocationRef.current = location;
    setPendingQuoteLocation(location);
  }, []);

  const spotlightLocatedMessage = useCallback((location: QuoteLocation) => {
    const row = document.getElementById(`chat_${location.clientMsgID}`);
    const scroller = document.getElementById("chat-list");
    if (!row || !scroller) return false;
    const rowRect = row.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const rowCenter = rowRect.top + rowRect.height / 2;
    if (rowCenter < scrollerRect.top || rowCenter > scrollerRect.bottom) return false;
    clearSpotlightRef.current?.();
    setSpotlightedMessageID(location.clientMsgID);
    clearSpotlightRef.current = spotlightQuote(
      row,
      location.quoteText,
      location.quoteOffset,
      () =>
        setSpotlightedMessageID((current) =>
          current === location.clientMsgID ? "" : current,
        ),
    );
    return true;
  }, []);

  const locateMessage = useCallback(
    async (location: QuoteLocation) => {
      if (!conversationID) return false;
      const requestID = ++locateRequestRef.current;
      const loadedIndex = loadState.messageList.findIndex(
        (message) => message.clientMsgID === location.clientMsgID,
      );
      if (loadedIndex >= 0) {
        updatePendingQuoteLocation(location);
        return true;
      }
      try {
        const seq = location.sourceMessage?.seq ?? 0;
        if (seq <= 0) throw new Error("Message sequence is unavailable");
        const { data } = await IMSDK.fetchSurroundingMessages({
          conversationID,
          seq,
          before: 10,
          after: 10,
        });
        if (requestID !== locateRequestRef.current) return false;
        const anchor = data.messageList.find((item) => item.seq === seq);
        if (!anchor) {
          throw new Error("Located message was not returned");
        }
        updatePendingQuoteLocation({
          ...location,
          clientMsgID: anchor.clientMsgID,
        });
        showSurroundingMessages(data.messageList);
        return true;
      } catch (error) {
        if (requestID !== locateRequestRef.current) return false;
        console.error(error);
        antMessage.warning(t("toast.messageUnavailable"));
        return false;
      }
    },
    [
      conversationID,
      loadState.messageList,
      showSurroundingMessages,
      t,
      updatePendingQuoteLocation,
    ],
  );

  useEffect(() => {
    const locateQuote = (location: QuoteLocation) => {
      void locateMessage(location);
    };
    emitter.on("LOCATE_QUOTED_MESSAGE", locateQuote);
    return () => emitter.off("LOCATE_QUOTED_MESSAGE", locateQuote);
  }, [locateMessage]);

  useEffect(() => {
    if (!pendingQuoteLocation) return;
    const index = loadState.messageList.findIndex(
      (message) => message.clientMsgID === pendingQuoteLocation.clientMsgID,
    );
    if (index < 0) return;

    let cancelled = false;
    let frameCount = 0;
    const startedAt = performance.now();
    const settleLocation = () => {
      if (cancelled) return;
      if (frameCount % 4 === 0) {
        virtuoso.current?.scrollToIndex({
          index,
          align: "center",
          behavior: "auto",
        });
      }
      if (spotlightLocatedMessage(pendingQuoteLocation)) {
        updatePendingQuoteLocation(undefined);
        return;
      }
      if (performance.now() - startedAt >= LOCATE_SETTLE_TIMEOUT) {
        updatePendingQuoteLocation(undefined);
        return;
      }
      frameCount += 1;
      locateScrollFrameRef.current = window.requestAnimationFrame(settleLocation);
    };

    locateScrollFrameRef.current = window.requestAnimationFrame(settleLocation);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(locateScrollFrameRef.current);
    };
  }, [
    loadState.listRevision,
    loadState.messageList,
    pendingQuoteLocation,
    spotlightLocatedMessage,
    updatePendingQuoteLocation,
  ]);

  const displayMessages = useMemo(
    () => applyFriendRemarks(loadState.messageList, friendList),
    [friendList, loadState.messageList],
  );
  const isGroupConversation =
    currentConversation?.conversationType === SessionType.WorkingGroup &&
    Boolean(currentConversation.groupID);
  const supportsReadReceipts =
    currentConversation?.conversationType === SessionType.Single || isGroupConversation;
  useMessageReadReceipts(
    conversationID,
    supportsReadReceipts,
    displayMessages,
    selfUserID,
  );

  const selectedMessages = useMemo(
    () =>
      displayMessages.filter((message) => selectedMessageIDs.has(message.clientMsgID)),
    [displayMessages, selectedMessageIDs],
  );

  const isForwardableMessage = useCallback(
    (message: MessageItem) =>
      message.status === MessageStatus.Succeed &&
      Boolean(message.clientMsgID) &&
      !message.attachedInfoElem?.isPrivateChat,
    [],
  );

  const reactionsEnabled =
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
              Number.isSafeInteger(message.seq) &&
              message.seq > 0 &&
              !message.attachedInfoElem?.isPrivateChat,
          )
        : [],
    [loadState.messageList, reactionsEnabled],
  );
  const reactableMessageSeqs = useMemo(
    () => new Set(reactableMessages.map((message) => message.seq)),
    [reactableMessages],
  );
  const {
    summaries,
    isPending,
    toggleReaction,
    userProfiles: reactionUserProfiles,
  } = useMessageReactions(
    reactionsEnabled ? conversationID : undefined,
    reactableMessages,
    selfUserID,
    connectState === "success" && syncState === "success",
  );
  const latestUnreadMessageSeq = getLatestUnreadMessageSeq(
    loadState.messageList,
    selfUserID,
    readSeq,
  );
  const unreadCandidateIndex = useMemo(
    () =>
      entryUnreadCount > 0
        ? getFirstUnreadMessageIndex(
            loadState.messageList,
            selfUserID,
            entryUnreadRef.current.readSeq,
          )
        : -1,
    [entryUnreadCount, loadState.messageList, selfUserID],
  );
  if (historyReady && !unreadBoundaryRef.current.initialized) {
    unreadBoundaryRef.current = {
      conversationID: activeConversationID,
      clientMsgID:
        unreadCandidateIndex >= 0
          ? loadState.messageList[unreadCandidateIndex]?.clientMsgID
          : undefined,
      initialized: true,
    };
  }
  const firstUnreadMessageID = unreadBoundaryRef.current.clientMsgID;
  const firstUnreadIndex = firstUnreadMessageID
    ? loadState.messageList.findIndex(
        (message) => message.clientMsgID === firstUnreadMessageID,
      )
    : -1;
  const locatedMessageIndex = pendingQuoteLocation
    ? loadState.messageList.findIndex(
        (message) => message.clientMsgID === pendingQuoteLocation.clientMsgID,
      )
    : -1;
  const initialTopMostItemIndex =
    locatedMessageIndex >= 0
      ? {
          index: locatedMessageIndex,
          align: "center" as const,
        }
      : firstUnreadIndex >= 0
      ? {
          index: firstUnreadIndex,
          align: "start" as const,
        }
      : 99999;

  useEffect(() => {
    locateRequestRef.current += 1;
    updatePendingQuoteLocation(undefined);
    clearSpotlightRef.current?.();
    clearSpotlightRef.current = undefined;
    setSpotlightedMessageID("");
    if (locateScrollFrameRef.current) {
      window.cancelAnimationFrame(locateScrollFrameRef.current);
      locateScrollFrameRef.current = 0;
    }
    lastMsgIdRef.current = "";
    handledMentionIDs.current.clear();
    setAtBottom(false);
    setMentionTargets([]);
    setMentionJumping(false);
    setSelectionMode(false);
    setSelectedMessageIDs(new Set());
    setForwardDialogOpen(false);
  }, [conversationID, updatePendingQuoteLocation]);

  const jumpToLatest = useCallback(async () => {
    locateRequestRef.current += 1;
    updatePendingQuoteLocation(undefined);
    if (loadState.isAroundMessage) {
      await getMoreOldMessages(false);
    }
    scrollToBottom("smooth");
  }, [
    getMoreOldMessages,
    loadState.isAroundMessage,
    scrollToBottom,
    updatePendingQuoteLocation,
  ]);

  useEffect(() => {
    if (!isGroupConversation || !historyReady) return;
    const targets = loadState.messageList.filter(
      (message) =>
        message.seq > readSeq &&
        !handledMentionIDs.current.has(message.clientMsgID) &&
        isMessageMentioningUser(message, selfUserID),
    );
    if (!targets.length) return;
    setMentionTargets((current) => {
      const byID = new Map(
        [...current, ...targets].map((message) => [message.clientMsgID, message]),
      );
      return [...byID.values()].sort(sortMessagesByPosition);
    });
  }, [historyReady, isGroupConversation, loadState.messageList, readSeq, selfUserID]);

  useEffect(() => {
    if (
      !historyReady ||
      !isGroupConversation ||
      !conversationID ||
      !hasUnreadMentionFlag(currentConversation?.groupAtType)
    )
      return;

    let cancelled = false;
    void IMSDK.searchLocalMessages({
      conversationID,
      keywordList: [],
      messageTypeList: [MessageType.AtTextMessage],
      pageIndex: 1,
      count: 100,
    })
      .then(({ data }) => {
        if (cancelled) return;
        const targets = (data.searchResultItems ?? [])
          .flatMap((item) => item.messageList)
          .filter(
            (message) =>
              !handledMentionIDs.current.has(message.clientMsgID) &&
              isMessageMentioningUser(message, selfUserID),
          )
          .sort(sortMessagesByPosition);
        const unreadTargets = targets.filter((message) => message.seq > readSeq);
        const pendingTargets = unreadTargets.length ? unreadTargets : targets.slice(-1);
        if (!pendingTargets.length) return;
        setMentionTargets((current) => {
          const byID = new Map(
            [...current, ...pendingTargets].map((message) => [
              message.clientMsgID,
              message,
            ]),
          );
          return [...byID.values()].sort(sortMessagesByPosition);
        });
      })
      .catch((error) => console.error("Failed to load mention messages", error));
    return () => {
      cancelled = true;
    };
  }, [
    conversationID,
    currentConversation?.groupAtType,
    readSeq,
    isGroupConversation,
    historyReady,
    selfUserID,
  ]);

  const jumpToNextMention = useCallback(async () => {
    const target = mentionTargets[0];
    if (!target || mentionJumping) return;
    setMentionJumping(true);
    const located = await locateMessage({
      clientMsgID: target.clientMsgID,
      sourceMessage: target,
    });
    setMentionJumping(false);
    if (!located) return;

    handledMentionIDs.current.add(target.clientMsgID);
    const remainingTargets = mentionTargets.filter(
      (message) => message.clientMsgID !== target.clientMsgID,
    );
    setMentionTargets(remainingTargets);
    if (!remainingTargets.length && conversationID) {
      void IMSDK.resetConversationGroupAtType(conversationID).catch((error) =>
        console.error("Failed to reset mention state", error),
      );
    }
  }, [conversationID, locateMessage, mentionJumping, mentionTargets]);

  useEffect(() => {
    if (conversationID) {
      if (currentConversation?.conversationType === SessionType.Notification) {
        void IMSDK.markConversationMessageAsRead(conversationID).catch((error) =>
          console.error("Failed to mark conversation as read", error),
        );
      }
    }
  }, [conversationID, currentConversation?.conversationType, selfUserID]);

  useEffect(() => {
    if (!historyReady || !conversationID || loadState.messageList.length === 0) return;

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

    if (
      atBottom &&
      latestUnreadMessageSeq > 0 &&
      document.visibilityState === "visible" &&
      document.hasFocus()
    ) {
      if (
        currentConversation?.conversationType === SessionType.WorkingGroup ||
        currentConversation?.conversationType === SessionType.Single
      ) {
        return;
      }
      void IMSDK.markConversationMessageAsRead(conversationID).catch((error) =>
        console.error("Failed to mark conversation as read", error),
      );
    }
  }, [
    loadState.messageList,
    historyReady,
    latestUnreadMessageSeq,
    conversationID,
    currentConversation?.conversationType,
    selfUserID,
    atBottom,
    scrollToBottom,
  ]);

  useEffect(() => {
    const scrollHandler = () => void jumpToLatest();
    emitter.on("CHAT_LIST_SCROLL_TO_BOTTOM", scrollHandler);
    return () => {
      emitter.off("CHAT_LIST_SCROLL_TO_BOTTOM", scrollHandler);
    };
  }, [jumpToLatest]);

  const loadMoreMessage = useCallback(() => {
    if (!loadState.hasMoreOld || moreOldLoading) return;
    void getMoreOldMessages();
  }, [getMoreOldMessages, loadState.hasMoreOld, moreOldLoading]);

  const loadMoreNewMessage = useCallback(() => {
    if (!loadState.hasMoreNew || moreNewLoading || pendingQuoteLocation) return;
    void getMoreNewMessages();
  }, [getMoreNewMessages, loadState.hasMoreNew, moreNewLoading, pendingQuoteLocation]);

  const handleAtBottomChange = useCallback((bottom: boolean) => {
    setAtBottom(bottom);
  }, []);

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
      className="relative flex h-full flex-col overflow-hidden !bg-surface"
      id="chat-main-content"
    >
      {!historyReady ? (
        <div className="flex h-full w-full items-center justify-center bg-surface pt-1">
          <Spin spinning />
        </div>
      ) : (
        <Virtuoso
          key={`${conversationID}:${loadState.listRevision}`}
          id="chat-list"
          className="w-full flex-1"
          followOutput={() => false}
          firstItemIndex={loadState.firstItemIndex}
          initialTopMostItemIndex={initialTopMostItemIndex}
          startReached={pendingQuoteLocation ? undefined : loadMoreMessage}
          endReached={
            loadState.isAroundMessage && !pendingQuoteLocation
              ? loadMoreNewMessage
              : undefined
          }
          atBottomStateChange={handleAtBottomChange}
          ref={virtuoso}
          data={displayMessages}
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
            Footer: () =>
              loadState.hasMoreNew ? (
                <div
                  className={clsx(
                    "flex justify-center py-2 opacity-0",
                    moreNewLoading && "opacity-100",
                  )}
                >
                  <Spin />
                </div>
              ) : null,
          }}
          computeItemKey={(_, item) => item.clientMsgID}
          itemContent={(index, message, reactionSummaries) => {
            const previous = displayMessages[index - loadState.firstItemIndex - 1];
            const canReact = reactableMessageSeqs.has(message.seq);
            const showReactionAction =
              reactionsEnabled &&
              REACTABLE_MESSAGE_TYPES.has(message.contentType) &&
              (message.status === MessageStatus.Sending ||
                message.status === MessageStatus.Succeed) &&
              !message.attachedInfoElem?.isPrivateChat;
            const avatarText = message.senderNickname;
            return (
              <>
                {startsMessageDay(message.sendTime, previous?.sendTime) && (
                  <div className="chat-date-divider">
                    <time dateTime={messageDate(message.sendTime).format("YYYY-MM-DD")}>
                      {formatMessageDate(message.sendTime)}
                    </time>
                  </div>
                )}
                {message.clientMsgID === firstUnreadMessageID && (
                  <div className="chat-unread-divider" data-unread-divider>
                    {t("unreadMessages")}
                  </div>
                )}
                {SystemMessageTypes.includes(message.contentType) ? (
                  <NotificationMessage message={message} />
                ) : (
                  <MessageItemComponent
                    key={message.clientMsgID}
                    conversationID={conversationID}
                    flushReadCursor={
                      atBottom &&
                      message.clientMsgID ===
                        loadState.messageList[loadState.messageList.length - 1]
                          ?.clientMsgID
                    }
                    message={message}
                    avatarText={avatarText}
                    showReadReceipt={supportsReadReceipts}
                    reactionSummary={reactionSummaries[message.seq]}
                    showReactionAction={showReactionAction}
                    reactionUserProfiles={reactionUserProfiles}
                    isReactionPending={
                      canReact ? (emoji) => isPending(message.seq, emoji) : undefined
                    }
                    onToggleReaction={
                      canReact
                        ? (emoji, reactedByMe) =>
                            toggleReaction(message.seq, emoji, reactedByMe)
                        : undefined
                    }
                    messageUpdateFlag={
                      avatarText +
                      message.senderNickname +
                      message.senderFaceUrl +
                      String(message.status) +
                      String(message.attachedInfoElem?.hasReadTime)
                    }
                    selectionMode={selectionMode}
                    selected={selectedMessageIDs.has(message.clientMsgID)}
                    selectable={isForwardableMessage(message)}
                    spotlighted={message.clientMsgID === spotlightedMessageID}
                    onEnterSelection={enterSelection}
                    onToggleSelection={toggleSelection}
                    onForward={openSingleForward}
                    onRetry={() => void retryMessage(message)}
                  />
                )}
              </>
            );
          }}
        />
      )}
      {!selectionMode && (mentionTargets.length > 0 || !atBottom) && (
        <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
          {mentionTargets.length > 0 && (
            <Button
              variant="default"
              size="icon"
              className="relative rounded-full border border-[var(--surface-border)] bg-surface-raised shadow-md"
              title={t("unreadMentions", { count: mentionTargets.length })}
              aria-label={t("unreadMentions", { count: mentionTargets.length })}
              data-mention-jump
              disabled={mentionJumping}
              onClick={() => void jumpToNextMention()}
            >
              <AtSign size={18} aria-hidden="true" />
              <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-brand px-1 text-[10px] leading-4 text-white">
                {mentionTargets.length > 99 ? "99+" : mentionTargets.length}
              </span>
            </Button>
          )}
          {!atBottom && (
            <Button
              variant="default"
              size="icon"
              className="relative rounded-full border border-[var(--surface-border)] bg-surface-raised shadow-md"
              title={t("jumpToLatest")}
              aria-label={t("jumpToLatest")}
              data-jump-to-latest
              onClick={() => void jumpToLatest()}
            >
              <ChevronDown size={20} aria-hidden="true" />
              {currentUnreadCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-brand px-1 text-[10px] leading-4 text-white">
                  {currentUnreadCount > 99 ? "99+" : currentUnreadCount}
                </span>
              )}
            </Button>
          )}
        </div>
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

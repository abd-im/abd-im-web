import {
  MessageItem,
  MessageType,
  SessionType,
  ViewType,
} from "@abd-im/wasm-client-sdk";
import type { ConversationItem } from "@abd-im/wasm-client-sdk/lib/types/entity";
import { Tooltip } from "antd";
import clsx from "clsx";
import {
  ArrowUp,
  Bot,
  CircleX,
  Copy,
  FilePlus2,
  FileText,
  Image,
  LoaderCircle,
  Pencil,
  Reply,
  Share2,
  Sparkles,
  Split,
} from "lucide-react";
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";

import {
  agentWorkspaceTitleFromPrompt,
  createAgentWorkspace,
} from "@/features/agentWorkspace/actions";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";
import { emit } from "@/utils/events";
import { formatMessageTime } from "@/utils/imCommon";

import { useSendMessage } from "../chat/queryChat/ChatFooter/useSendMessage";
import {
  captureQuoteSelection,
  createQuoteSnapshot,
  PartialQuoteElem,
  QuoteSelection,
  spotlightQuote,
} from "../chat/queryChat/partialQuote";
import { useHistoryMessageList } from "../chat/queryChat/useHistoryMessageList";
import styles from "./agent-workspace.module.scss";
import { reduceAgentRun } from "./agentRunReducer";
import AgentRunRenderer, {
  AgentRunActivityNavigator,
  AgentRunNavigationItem,
} from "./AgentRunRenderer";

const textContent = (message: MessageItem) => {
  switch (message.contentType) {
    case MessageType.TextMessage:
      return message.textElem?.content ?? "";
    case MessageType.AtTextMessage:
      return message.atTextElem?.text ?? "";
    case MessageType.QuoteMessage:
      return message.quoteElem?.text ?? "";
    default:
      return "";
  }
};

const USER_MESSAGE_TYPES = new Set<MessageType>([
  MessageType.TextMessage,
  MessageType.AtTextMessage,
  MessageType.QuoteMessage,
  MessageType.PictureMessage,
  MessageType.FileMessage,
]);

const isWorkspaceMessage = (message: MessageItem) =>
  USER_MESSAGE_TYPES.has(message.contentType) ||
  (message.contentType === MessageType.StreamMessage &&
    message.streamElem?.type === "agent_run_v1");

export interface AgentWorkspaceDraft {
  agentUserID: string;
  agentName?: string;
}

export default function AgentWorkspaceContent({
  draft,
}: {
  draft?: AgentWorkspaceDraft;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [activeRunMessageID, setActiveRunMessageID] = useState<string>();
  const [quoteSelection, setQuoteSelection] = useState<
    (QuoteSelection & { message: MessageItem; left: number; top: number }) | undefined
  >();
  const [pendingQuoteLocation, setPendingQuoteLocation] = useState<{
    clientMsgID: string;
    quoteText?: string;
    quoteOffset?: number;
  }>();
  const streamRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const updateConversationGroupInfo = useConversationStore(
    (state) => state.updateConversationGroupInfo,
  );
  const updateConversationList = useConversationStore(
    (state) => state.updateConversationList,
  );
  const updateCurrentConversation = useConversationStore(
    (state) => state.updateCurrentConversation,
  );
  const quoteMessage = useConversationStore((state) => state.quoteMessage);
  const updateQuoteMessage = useConversationStore((state) => state.updateQuoteMessage);
  const selfUserID = useUserStore((state) => state.selfInfo.userID);
  const { sendMessage } = useSendMessage();
  const isDraft = Boolean(draft?.agentUserID);
  const {
    conversationID,
    loadState,
    moreOldLoading,
    getMoreOldMessages,
    showSurroundingMessages,
  } = useHistoryMessageList(!isDraft);

  const visibleMessages = useMemo(
    () => loadState.messageList.filter(isWorkspaceMessage),
    [loadState.messageList],
  );

  const latestAgentMessageID = useMemo(() => {
    for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
      const message = visibleMessages[index];
      if (message.sendID !== selfUserID) {
        return message.clientMsgID;
      }
    }
    return undefined;
  }, [selfUserID, visibleMessages]);
  const latestRunMessageID = useMemo(
    () =>
      [...visibleMessages]
        .reverse()
        .find(
          (message) =>
            message.contentType === MessageType.StreamMessage &&
            message.streamElem?.type === "agent_run_v1",
        )?.clientMsgID,
    [visibleMessages],
  );
  const latestUserMessageID = useMemo(() => {
    for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
      const message = visibleMessages[index];
      if (message.sendID === selfUserID) return message.clientMsgID;
    }
    return undefined;
  }, [selfUserID, visibleMessages]);
  const runNavigationItems = useMemo(() => {
    let title: string | undefined;
    const runs: AgentRunNavigationItem[] = [];
    visibleMessages.forEach((message) => {
      if (message.sendID === selfUserID) {
        title = textContent(message).trim() || title;
        return;
      }
      if (
        message.contentType === MessageType.StreamMessage &&
        message.streamElem?.type === "agent_run_v1"
      ) {
        runs.push({
          messageID: message.clientMsgID,
          streamElem: message.streamElem,
          title,
        });
      }
    });
    return runs;
  }, [selfUserID, visibleMessages]);
  const conversationReady =
    isDraft ||
    (Boolean(currentConversation) &&
      currentConversation?.conversationID === conversationID);

  useEffect(() => {
    const container = streamRef.current;
    if (!container || loadState.initLoading || !atBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationID, loadState.initLoading, loadState.messageList]);

  useEffect(() => {
    if (conversationID) void IMSDK.markConversationMessageAsRead(conversationID);
  }, [conversationID, loadState.messageList.length]);

  useEffect(() => {
    if (!runNavigationItems.length) {
      setActiveRunMessageID(undefined);
      return;
    }
    setActiveRunMessageID((current) => {
      if (current && !atBottomRef.current) return current;
      return runNavigationItems.at(-1)?.messageID;
    });
  }, [runNavigationItems]);

  const updateActiveRunFromScroll = (container: HTMLDivElement) => {
    const viewportCenter =
      container.getBoundingClientRect().top + container.clientHeight / 2;
    const nearest = [...container.querySelectorAll<HTMLElement>("[data-agent-run-id]")]
      .map((element) => ({
        messageID: element.dataset.agentRunId,
        distance: Math.abs(element.getBoundingClientRect().top - viewportCenter),
      }))
      .filter((item): item is { messageID: string; distance: number } =>
        Boolean(item.messageID),
      )
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearest) setActiveRunMessageID(nearest.messageID);
  };

  const selectRun = (messageID: string) => {
    setActiveRunMessageID(messageID);
    const target = [
      ...(streamRef.current?.querySelectorAll<HTMLElement>("[data-agent-run-id]") ??
        []),
    ].find((element) => element.dataset.agentRunId === messageID);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const revealQuote = useCallback(
    (location: { clientMsgID: string; quoteText?: string; quoteOffset?: number }) => {
      const row = document.getElementById(`chat_${location.clientMsgID}`);
      if (!row) return false;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(
        () => spotlightQuote(row, location.quoteText, location.quoteOffset),
        180,
      );
      return true;
    },
    [],
  );

  const locateQuote = async (location: {
    clientMsgID: string;
    quoteText?: string;
    quoteOffset?: number;
  }) => {
    if (revealQuote(location) || !conversationID) return;
    try {
      const { data: found } = await IMSDK.findMessageList([
        { conversationID, clientMsgIDList: [location.clientMsgID] },
      ]);
      const source = found.findResultItems
        ?.flatMap((item) => item.messageList)
        .find((item) => item.clientMsgID === location.clientMsgID);
      if (!source) throw new Error("Quoted message was not found");
      const { data } = await IMSDK.fetchSurroundingMessages({
        startMessage: source,
        viewType: ViewType.History,
        before: 10,
        after: 10,
      });
      setPendingQuoteLocation(location);
      showSurroundingMessages(data.messageList);
    } catch (error) {
      feedbackToast({ error });
    }
  };

  useEffect(() => {
    if (!pendingQuoteLocation) return;
    const timer = window.setTimeout(() => {
      if (revealQuote(pendingQuoteLocation)) setPendingQuoteLocation(undefined);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [loadState.messageList, pendingQuoteLocation, revealQuote]);

  const sendPrompt = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || sending || !conversationReady) return;

    setSending(true);
    try {
      let conversation: ConversationItem | undefined = currentConversation;
      if (draft) {
        const group = await createAgentWorkspace(
          draft.agentUserID,
          agentWorkspaceTitleFromPrompt(
            trimmedPrompt,
            t("agentWorkspace.newConversation"),
          ),
        );
        updateConversationGroupInfo(group);
        const response = await IMSDK.getOneConversation({
          sourceID: group.groupID,
          sessionType: SessionType.WorkingGroup,
        });
        conversation = response.data;
        updateConversationList([conversation], "push");
        await updateCurrentConversation(conversation);
      }
      const message = quoteMessage
        ? (
            await (
              IMSDK.createQuoteMessage as unknown as (params: {
                text: string;
                message: MessageItem;
                quoteText?: string;
                quoteOffset?: number;
              }) => ReturnType<typeof IMSDK.createQuoteMessage>
            )({
              text: trimmedPrompt,
              message: createQuoteSnapshot(quoteMessage),
              quoteText: quoteMessage.quoteText,
              quoteOffset: quoteMessage.quoteOffset,
            })
          ).data
        : (await IMSDK.createTextMessage(trimmedPrompt)).data;
      if (!(await sendMessage({ message, conversation }))) return;
      setPrompt("");
      updateQuoteMessage();
      if (draft && conversation) {
        navigate(`/agent/${conversation.conversationID}`, { replace: true });
      }
    } catch (error) {
      feedbackToast({ error });
    } finally {
      setSending(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void sendPrompt();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing)
      return;
    event.preventDefault();
    void sendPrompt();
  };

  return (
    <main
      id="chat-main-content"
      className={clsx("flex h-full min-w-0 flex-1 flex-col", styles.page)}
    >
      <header className={styles.header}>
        <span className={styles.headerAvatar} aria-hidden="true">
          <Bot size={17} strokeWidth={1.8} />
        </span>
        <span className={styles.headerCopy}>
          <strong>
            {draft?.agentName ||
              currentConversation?.showName ||
              t("agentWorkspace.agent")}
          </strong>
          <small>{t("agentWorkspace.workspaceLabel")}</small>
        </span>
        <div className={styles.headerActions}>
          <Tooltip title={t("agentWorkspace.share")}>
            <button
              className={styles.headerButton}
              type="button"
              aria-label={t("agentWorkspace.share")}
              data-testid="agent-conversation-share"
              disabled={isDraft}
              onClick={() => {
                if (!currentConversation?.groupID) return;
                emit("OPEN_CHOOSE_MODAL", {
                  type: "INVITE_TO_GROUP",
                  extraData: currentConversation.groupID,
                });
              }}
            >
              <Share2 size={16} strokeWidth={1.8} />
              <span>{t("agentWorkspace.share")}</span>
            </button>
          </Tooltip>
        </div>
      </header>
      <div
        className={styles.stream}
        ref={streamRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          atBottomRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 48;
          updateActiveRunFromScroll(element);
        }}
      >
        {runNavigationItems.length > 0 && (
          <AgentRunActivityNavigator
            runs={runNavigationItems}
            activeMessageID={activeRunMessageID}
            onSelect={selectRun}
          />
        )}
        <div
          className={clsx(
            styles.streamInner,
            !loadState.initLoading &&
              visibleMessages.length === 0 &&
              styles.streamInnerEmpty,
          )}
        >
          {loadState.hasMoreOld && !loadState.initLoading && (
            <button
              className={styles.starterPrompt}
              type="button"
              disabled={moreOldLoading}
              onClick={() => void getMoreOldMessages()}
            >
              {moreOldLoading ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                t("agentWorkspace.loadMore")
              )}
            </button>
          )}

          {loadState.initLoading ? (
            <div className={styles.empty} role="status">
              <LoaderCircle className="animate-spin" size={18} />
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyMark}>
                <Sparkles size={22} strokeWidth={1.8} />
              </span>
              <h1>{t("agentWorkspace.emptyTitle")}</h1>
              <p>{t("agentWorkspace.emptySubtitle")}</p>
              <div className={styles.starterPrompts}>
                {[
                  t("agentWorkspace.starters.explain"),
                  t("agentWorkspace.starters.answer"),
                  t("agentWorkspace.starters.handleChat"),
                ].map((starter) => (
                  <button
                    className={styles.starterPrompt}
                    type="button"
                    key={starter}
                    onClick={() => setPrompt(starter)}
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            visibleMessages.map((message) => {
              const isRun =
                message.contentType === MessageType.StreamMessage &&
                message.streamElem?.type === "agent_run_v1";
              const userMessage = message.sendID === selfUserID;
              const agentMessage = !userMessage;
              const content = textContent(message);
              const image = message.pictureElem?.sourcePicture;
              const file = message.fileElem;
              const runReduction =
                isRun && message.streamElem
                  ? reduceAgentRun(
                      message.streamElem.content,
                      message.streamElem.packets ?? [],
                      message.streamElem.end,
                    )
                  : undefined;
              const runEnded = Boolean(
                runReduction &&
                  !runReduction.unsupported &&
                  ["completed", "failed", "cancelled"].includes(
                    runReduction.view.status,
                  ),
              );
              const copyText = isRun ? runReduction?.view.answer ?? "" : content;
              const quoteElem = message.quoteElem as PartialQuoteElem | undefined;
              const persistentActions =
                agentMessage && message.clientMsgID === latestAgentMessageID;
              const canEdit =
                userMessage && message.clientMsgID === latestUserMessageID;

              return (
                <article
                  id={`chat_${message.clientMsgID}`}
                  className={clsx(styles.message, userMessage && styles.messageUser)}
                  key={message.clientMsgID}
                  data-chat-message-row
                  data-agent-run-id={isRun ? message.clientMsgID : undefined}
                  onPointerUp={(event) => {
                    if (isRun && !runEnded) return;
                    const selection = captureQuoteSelection(event.currentTarget);
                    if (!selection) {
                      setQuoteSelection(undefined);
                      return;
                    }
                    const rowRect = event.currentTarget.getBoundingClientRect();
                    setQuoteSelection({
                      ...selection,
                      message,
                      left:
                        selection.rect.left - rowRect.left + selection.rect.width / 2,
                      top: selection.rect.top - rowRect.top - 38,
                    });
                  }}
                >
                  {quoteSelection?.message.clientMsgID === message.clientMsgID && (
                    <button
                      type="button"
                      className={styles.quoteSelectionAction}
                      style={{ left: quoteSelection.left, top: quoteSelection.top }}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => {
                        updateQuoteMessage({
                          message,
                          quoteText: quoteSelection.text,
                          quoteOffset: quoteSelection.offset,
                          sourceText: quoteSelection.sourceText,
                        });
                        setQuoteSelection(undefined);
                        window.getSelection()?.removeAllRanges();
                      }}
                    >
                      <Reply size={14} strokeWidth={1.8} />
                      {t("placeholder.reply")}
                    </button>
                  )}
                  <div className={styles.messageBody}>
                    {quoteElem?.quoteMessage && (
                      <button
                        type="button"
                        className={styles.messageQuote}
                        onClick={() =>
                          void locateQuote({
                            clientMsgID: quoteElem.quoteMessage.clientMsgID,
                            quoteText: quoteElem.quoteText,
                            quoteOffset: quoteElem.quoteOffset,
                          })
                        }
                      >
                        <strong>
                          {quoteElem.quoteMessage.senderNickname ||
                            quoteElem.quoteMessage.sendID}
                        </strong>
                        <span>{quoteElem.quoteText}</span>
                      </button>
                    )}
                    {isRun && message.streamElem ? (
                      <AgentRunRenderer
                        streamElem={message.streamElem}
                        isActive={message.clientMsgID === latestRunMessageID}
                      />
                    ) : userMessage ? (
                      <div className={styles.userBubble}>
                        {content && <div data-quote-source>{content}</div>}
                        {image && (
                          <div className={styles.userAttachment}>
                            <Image size={15} strokeWidth={1.8} />
                            <span>{t("placeholder.image")}</span>
                            <small>
                              {image.size ? `${Math.round(image.size / 1024)} KB` : ""}
                            </small>
                          </div>
                        )}
                        {file && (
                          <div className={styles.userAttachment}>
                            <FileText size={15} strokeWidth={1.8} />
                            <span>{file.fileName}</span>
                            <small>
                              {file.fileSize
                                ? `${Math.round(file.fileSize / 1024)} KB`
                                : ""}
                            </small>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className={styles.answer} data-quote-source>
                        <ReactMarkdown skipHtml>{content}</ReactMarkdown>
                      </div>
                    )}
                    {(userMessage || agentMessage || runEnded) && (
                      <div
                        className={clsx(
                          styles.messageActions,
                          isRun && styles.messageActionsAgent,
                          persistentActions && styles.messageActionsPersistent,
                        )}
                      >
                        <time>{formatMessageTime(message.sendTime)}</time>
                        <Tooltip title={t("agentWorkspace.copy")}>
                          <button
                            className={styles.messageAction}
                            type="button"
                            aria-label={t("agentWorkspace.copy")}
                            onClick={() => {
                              if (copyText && navigator.clipboard) {
                                void navigator.clipboard.writeText(copyText);
                              }
                            }}
                          >
                            <Copy size={14} strokeWidth={1.8} />
                          </button>
                        </Tooltip>
                        {agentMessage && (
                          <Tooltip title={t("agentWorkspace.fork")}>
                            <button
                              className={styles.messageAction}
                              type="button"
                              aria-label={t("agentWorkspace.fork")}
                            >
                              <Split
                                className={styles.forkIcon}
                                size={14}
                                strokeWidth={1.8}
                              />
                            </button>
                          </Tooltip>
                        )}
                        {canEdit && (
                          <Tooltip title={t("agentWorkspace.edit")}>
                            <button
                              className={styles.messageAction}
                              type="button"
                              aria-label={t("agentWorkspace.edit")}
                            >
                              <Pencil size={14} strokeWidth={1.8} />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      <form className={styles.composer} onSubmit={submit}>
        <div className={styles.composerInner}>
          {quoteMessage && (
            <div className={styles.composerQuote}>
              <Reply size={14} strokeWidth={1.8} />
              <span>
                <strong>
                  {quoteMessage.message.senderNickname || quoteMessage.message.sendID}
                </strong>
                <small>
                  {quoteMessage.quoteText || textContent(quoteMessage.message)}
                </small>
              </span>
              <button
                type="button"
                aria-label={t("cancel")}
                onClick={() => updateQuoteMessage()}
              >
                <CircleX size={15} strokeWidth={1.8} />
              </button>
            </div>
          )}
          <textarea
            value={prompt}
            placeholder={t("agentWorkspace.composerPlaceholder")}
            aria-label={t("agentWorkspace.composerPlaceholder")}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className={styles.composerFooter}>
            <div className={styles.composerTools}>
              <button
                className={styles.toolButton}
                type="button"
                disabled
                title={t("agentWorkspace.attachmentsUnavailable")}
                aria-label={t("agentWorkspace.attachmentsUnavailable")}
              >
                <FilePlus2 size={16} strokeWidth={1.8} />
              </button>
            </div>
            <button
              className={styles.sendButton}
              type="submit"
              disabled={sending || !conversationReady || !prompt.trim()}
              title={t("placeholder.send")}
              aria-label={t("placeholder.send")}
            >
              {sending ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <ArrowUp size={16} strokeWidth={2} />
              )}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

export { isWorkspaceMessage, textContent };

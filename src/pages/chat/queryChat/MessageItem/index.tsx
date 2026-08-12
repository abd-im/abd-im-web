import {
  MessageItem as MessageItemType,
  MessageStatus,
  MessageType,
} from "@abd-im/wasm-client-sdk";
import { type MenuProps, Tooltip } from "antd";
import clsx from "clsx";
import { Bot, CircleAlert } from "lucide-react";
import { FC, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { message as antMessage } from "@/AntdGlobalComp";
import type { MessageReactionSummary } from "@/api/messageReaction";
import OIMAvatar from "@/components/OIMAvatar";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import { formatMessageTime } from "@/utils/imCommon";

import { MARKDOWN_TEXT_MESSAGE_TYPE } from "../markdownMessage";
import { deleteMessage } from "../useHistoryMessageList";
import BurnCountdown from "./BurnCountdown";
import CardMessageRender from "./CardMessageRender";
import CatchMessageRender from "./CatchMsgRenderer";
import FileMessageRender from "./FileMessageRender";
import MarkdownMessageRender from "./MarkdownMessageRender";
import MediaMessageRender from "./MediaMessageRender";
import MergeMessageRender from "./MergeMessageRender";
import styles from "./message-item.module.scss";
import MessageItemErrorBoundary from "./MessageItemErrorBoundary";
import MessageReactionBar from "./MessageReactionBar";
import MessageSuffix from "./MessageSuffix";
import QuoteMessageRender from "./QuoteMessageRender";
import StreamMessageRender from "./StreamMessageRender";
import TextMessageRender from "./TextMessageRender";
import VideoMessageRender from "./VideoMessageRender";

export interface IMessageItemProps {
  message: MessageItemType;
  isSender?: boolean;
  disabled?: boolean;
  conversationID?: string;
  messageUpdateFlag?: string;
  reactionSummary?: MessageReactionSummary;
  isReactionPending?: (emoji: string) => boolean;
  onToggleReaction?: (emoji: string, reactedByMe: boolean) => void;
  selectionMode?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onEnterSelection?: (messageID: string) => void;
  onToggleSelection?: (messageID: string) => void;
  onForward?: (messageID: string) => void;
  onRetry?: () => void;
}

const components: Record<number, FC<IMessageItemProps>> = {
  [MessageType.TextMessage]: TextMessageRender,
  [MessageType.StreamMessage]: StreamMessageRender,
  [MessageType.PictureMessage]: MediaMessageRender,
  [MessageType.VideoMessage]: VideoMessageRender,
  [MessageType.FileMessage]: FileMessageRender,
  [MessageType.CardMessage]: CardMessageRender,
  [MessageType.QuoteMessage]: QuoteMessageRender,
  [MessageType.MergeMessage]: MergeMessageRender,
  [MARKDOWN_TEXT_MESSAGE_TYPE]: MarkdownMessageRender,
};

interface AgentAttribution {
  agentName?: string;
}

const agentAttributionFromEx = (ex?: string): AgentAttribution | undefined => {
  if (!ex) return undefined;
  try {
    const value = JSON.parse(ex) as { abdAgent?: AgentAttribution };
    return value.abdAgent;
  } catch {
    return undefined;
  }
};

const MessageItem: FC<IMessageItemProps> = ({
  message,
  disabled,
  conversationID,
  reactionSummary,
  isReactionPending,
  onToggleReaction,
  selectionMode,
  selected,
  selectable,
  onEnterSelection,
  onToggleSelection,
  onForward,
  onRetry,
}) => {
  const { t } = useTranslation();
  const selfUserID = useUserStore((state) => state.selfInfo.userID);
  const updateQuoteMessage = useConversationStore((state) => state.updateQuoteMessage);
  const isSender = useMemo(
    () => selfUserID === message.sendID,
    [selfUserID, message.sendID],
  );
  const agentAttribution = useMemo(
    () => agentAttributionFromEx(message.ex),
    [message.ex],
  );

  const MessageRenderComponent = components[message.contentType] || CatchMessageRender;

  const isPrivate = message.attachedInfoElem?.isPrivateChat;
  const canReact =
    Boolean(onToggleReaction && isReactionPending) &&
    message.status === MessageStatus.Succeed &&
    Boolean(message.serverMsgID) &&
    !isPrivate;
  const canReply =
    message.status === MessageStatus.Succeed &&
    Boolean(message.clientMsgID) &&
    !isPrivate;
  const canForward =
    selectable ??
    (message.status === MessageStatus.Succeed &&
      Boolean(message.clientMsgID) &&
      !isPrivate);
  const hasReactions = canReact && Boolean(reactionSummary?.reactions.length);

  const menuItems = useMemo(() => {
    if (isPrivate) {
      return [{ key: "delete", label: t("placeholder.delete") }];
    }

    const items: MenuProps["items"] = [];
    if (canForward) {
      items.push({ key: "forward", label: t("placeholder.forward") });
    }
    if (message.contentType === MessageType.TextMessage) {
      items.push({ key: "copy", label: t("placeholder.copy") });
    }
    if (canForward) {
      items.push({ key: "check", label: t("placeholder.check") });
    }
    if (canReply) {
      items.push({ key: "reply", label: t("placeholder.reply") });
    }

    // Normalize sendTime to milliseconds
    const sendTimeMs =
      message.sendTime < 10000000000 ? message.sendTime * 1000 : message.sendTime;
    const canRevoke = isSender && Date.now() - sendTimeMs < 600000;

    if (canRevoke) {
      items.push({ key: "revoke", label: t("placeholder.revoke") });
    }
    items.push({ key: "delete", label: t("placeholder.delete") });
    return items;
  }, [canForward, canReply, message, isSender, isPrivate, t]);

  const handleMenuAction = async (key: string) => {
    switch (key) {
      case "copy":
        try {
          await navigator.clipboard.writeText(message.textElem?.content || "");
          antMessage.success(t("toast.copySuccess"));
        } catch (err) {
          antMessage.error(t("toast.copyFailed"));
        }
        break;
      case "revoke":
        try {
          await IMSDK.revokeMessage({
            conversationID: conversationID!,
            clientMsgID: message.clientMsgID,
          });
        } catch (err) {
          antMessage.error(t("toast.accessFailed"));
        }
        break;
      case "delete":
        try {
          await IMSDK.deleteMessageFromLocalStorage({
            conversationID: conversationID!,
            clientMsgID: message.clientMsgID,
          });
          deleteMessage(message.clientMsgID);
        } catch (err) {
          antMessage.error(t("toast.accessFailed"));
        }
        break;
      case "forward":
        onForward?.(message.clientMsgID);
        break;
      case "check":
        onEnterSelection?.(message.clientMsgID);
        break;
      case "reply":
        updateQuoteMessage(message);
        break;
    }
  };

  const onMenuClick: MenuProps["onClick"] = ({ key }) => {
    void handleMenuAction(key);
  };

  return (
    <>
      <div
        id={`chat_${message.clientMsgID}`}
        className={clsx(
          "relative flex select-text justify-center py-3",
          styles["message-row"],
          selectionMode && styles["message-row-selection-mode"],
          selected && styles["message-row-selected"],
          isPrivate && "!select-none",
        )}
      >
        {selectionMode && selectable && (
          <button
            type="button"
            className={clsx(
              styles["message-select-toggle"],
              selected && styles["message-select-toggle-selected"],
            )}
            aria-label={t("placeholder.check")}
            aria-pressed={selected}
            onClick={() => onToggleSelection?.(message.clientMsgID)}
          >
            {selected ? "✓" : ""}
          </button>
        )}
        <div
          className={clsx(
            styles["message-container"],
            isSender && styles["message-container-sender"],
          )}
        >
          <OIMAvatar
            size={36}
            src={message.senderFaceUrl}
            text={message.senderNickname}
          />

          <div className={styles["message-wrap"]}>
            <div className={styles["message-profile"]}>
              <div
                title={message.senderNickname}
                className={clsx(
                  "max-w-[30%] truncate text-[var(--sub-text)]",
                  isSender ? "ml-2" : "mr-2",
                )}
              >
                {message.senderNickname}
              </div>
              <div className="text-[var(--sub-text)]">
                {formatMessageTime(message.sendTime)}
              </div>
              {agentAttribution && (
                <Tooltip
                  title={t("secretary.sentByAgent", {
                    name: agentAttribution.agentName || t("agentWorkspace.agent"),
                  })}
                >
                  <span
                    className="ml-1.5 inline-flex items-center justify-center text-trust"
                    aria-label={t("secretary.sentByAgent", {
                      name: agentAttribution.agentName || t("agentWorkspace.agent"),
                    })}
                  >
                    <Bot size={13} strokeWidth={1.9} />
                  </span>
                </Tooltip>
              )}
            </div>

            <div className={styles["message-content-group"]}>
              <div className={styles["message-content-row"]}>
                {isSender && message.status === MessageStatus.Failed && (
                  <Tooltip title={t("retry")}>
                    <button
                      type="button"
                      className="mr-2 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#ef4444] transition-colors hover:bg-[#ef4444]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef4444]"
                      aria-label={t("retry")}
                      onClick={onRetry}
                    >
                      <CircleAlert size={18} fill="currentColor" stroke="white" />
                    </button>
                  </Tooltip>
                )}
                {isSender && (
                  <div className="mr-2">
                    <BurnCountdown message={message} conversationID={conversationID} />
                  </div>
                )}
                <div
                  className={clsx(
                    styles["message-bubble-wrap"],
                    hasReactions && styles["message-bubble-wrap-reaction-shell"],
                    hasReactions && styles["message-bubble-wrap-with-reactions"],
                  )}
                >
                  <MessageItemErrorBoundary message={message}>
                    <MessageRenderComponent
                      message={message}
                      isSender={isSender}
                      disabled={disabled}
                    />
                  </MessageItemErrorBoundary>
                  <MessageReactionBar
                    summary={reactionSummary}
                    isSender={isSender}
                    canReact={canReact}
                    isPending={isReactionPending}
                    onToggle={onToggleReaction}
                    onReply={
                      canReply ? () => void handleMenuAction("reply") : undefined
                    }
                    menuItems={menuItems}
                    onMenuClick={onMenuClick}
                    actionsDisabled={disabled || selectionMode}
                  />
                </div>
                {!isSender && (
                  <div className="ml-2">
                    <BurnCountdown message={message} conversationID={conversationID} />
                  </div>
                )}
              </div>

              <div className={styles["message-status-wrapper"]}>
                <MessageSuffix
                  message={message}
                  isSender={isSender}
                  disabled={false}
                  conversationID={conversationID}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default memo(MessageItem);

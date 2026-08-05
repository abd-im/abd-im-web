import {
  MessageItem as MessageItemType,
  MessageStatus,
  MessageType,
  SessionType,
} from "@abd-im/wasm-client-sdk";
import type { MenuProps } from "antd";
import clsx from "clsx";
import { FC, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { message as antMessage } from "@/AntdGlobalComp";
import type { MessageReactionSummary } from "@/api/messageReaction";
import OIMAvatar from "@/components/OIMAvatar";
import { IMSDK } from "@/layout/MainContentWrap";
import { useUserStore } from "@/store";
import { formatMessageTime } from "@/utils/imCommon";

import { deleteMessage } from "../useHistoryMessageList";
import BurnCountdown from "./BurnCountdown";
import CatchMessageRender from "./CatchMsgRenderer";
import FileMessageRender from "./FileMessageRender";
import MediaMessageRender from "./MediaMessageRender";
import styles from "./message-item.module.scss";
import MessageItemErrorBoundary from "./MessageItemErrorBoundary";
import MessageReactionBar from "./MessageReactionBar";
import MessageSuffix from "./MessageSuffix";
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
}

const components: Record<number, FC<IMessageItemProps>> = {
  [MessageType.TextMessage]: TextMessageRender,
  [MessageType.StreamMessage]: StreamMessageRender,
  [MessageType.PictureMessage]: MediaMessageRender,
  [MessageType.VideoMessage]: VideoMessageRender,
  [MessageType.FileMessage]: FileMessageRender,
};

const MessageItem: FC<IMessageItemProps> = ({
  message,
  disabled,
  conversationID,
  reactionSummary,
  isReactionPending,
  onToggleReaction,
}) => {
  const { t } = useTranslation();
  const selfUserID = useUserStore((state) => state.selfInfo.userID);
  const isSender = useMemo(
    () => selfUserID === message.sendID,
    [selfUserID, message.sendID],
  );

  const MessageRenderComponent = components[message.contentType] || CatchMessageRender;

  const isPrivate = message.attachedInfoElem?.isPrivateChat;
  const canReact =
    Boolean(onToggleReaction && isReactionPending) &&
    message.status === MessageStatus.Succeed &&
    Boolean(message.serverMsgID) &&
    !isPrivate;
  const hasReactions = canReact && Boolean(reactionSummary?.reactions.length);

  const menuItems = useMemo(() => {
    if (isPrivate) {
      return [{ key: "delete", label: t("placeholder.delete") }];
    }

    const items: MenuProps["items"] = [
      { key: "forward", label: t("placeholder.forward") },
    ];
    if (message.contentType === MessageType.TextMessage) {
      items.push({ key: "copy", label: t("placeholder.copy") });
    }
    items.push(
      { key: "check", label: t("placeholder.check") },
      { key: "reply", label: t("placeholder.reply") },
    );

    // Normalize sendTime to milliseconds
    const sendTimeMs =
      message.sendTime < 10000000000 ? message.sendTime * 1000 : message.sendTime;
    const canRevoke = isSender && Date.now() - sendTimeMs < 600000;

    if (canRevoke) {
      items.push({ key: "revoke", label: t("placeholder.revoke") });
    }
    items.push({ key: "delete", label: t("placeholder.delete") });
    return items;
  }, [message, isSender, isPrivate, t]);

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
      case "check":
      case "reply":
        // Placeholder for future implementation
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
          "relative flex select-text px-5 py-3",
          isPrivate && "!select-none",
          isSender && "justify-end",
        )}
      >
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
            </div>

            <div className={styles["message-content-group"]}>
              <div className="flex items-center">
                {isSender && (
                  <div className="mr-2">
                    <BurnCountdown message={message} conversationID={conversationID} />
                  </div>
                )}
                <div
                  className={clsx(
                    styles["message-bubble-wrap"],
                    canReact && styles["message-bubble-wrap-reaction-shell"],
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
                    onReply={() => void handleMenuAction("reply")}
                    menuItems={menuItems}
                    onMenuClick={onMenuClick}
                    actionsDisabled={disabled}
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

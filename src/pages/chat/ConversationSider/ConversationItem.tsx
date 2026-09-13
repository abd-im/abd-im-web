import { SessionType } from "@abd-im/wasm-client-sdk";
import type {
  ConversationItem as ConversationItemType,
  MessageItem,
} from "@abd-im/wasm-client-sdk/lib/types/entity";
import clsx from "clsx";
import { t } from "i18next";
import { Bot, Phone } from "lucide-react";
import { memo, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import OIMAvatar from "@/components/OIMAvatar";
import { useCallSummary } from "@/features/call/CallProvider";
import { useUserDisplayNameResolver } from "@/hooks/useUserDisplayName";
import { useConversationStore, useUserStore } from "@/store";
import { formatConversionTime, getConversationContent } from "@/utils/imCommon";

import styles from "./conversation-item.module.scss";

interface IConversationProps {
  isActive: boolean;
  isHosted: boolean;
  conversation: ConversationItemType;
}

const ConversationItem = ({ isActive, isHosted, conversation }: IConversationProps) => {
  const navigate = useNavigate();
  const callSummary = useCallSummary(
    conversation.groupID
      ? { type: SessionType.Group, id: conversation.groupID }
      : undefined,
  );
  const updateCurrentConversation = useConversationStore(
    (state) => state.updateCurrentConversation,
  );
  const currentUser = useUserStore((state) => state.selfInfo.userID);
  const resolveUserDisplayName = useUserDisplayNameResolver();
  const conversationName = conversation.groupID
    ? conversation.showName
    : resolveUserDisplayName({
        userID: conversation.userID,
        nickname: conversation.showName,
      });

  const toSpecifiedConversation = async () => {
    if (isActive) {
      return;
    }
    await updateCurrentConversation({ ...conversation });
    navigate(`/chat/${conversation.conversationID}`);
  };

  const latestMessageContent = useMemo(() => {
    let content = "";
    if (!conversation.latestMsg) {
      return t("messageDescription.noMessages");
    }
    try {
      content = getConversationContent(
        JSON.parse(conversation.latestMsg) as MessageItem,
        resolveUserDisplayName,
        currentUser,
      );
    } catch (error) {
      content = t("messageDescription.catchMessage");
    }
    return content;
  }, [conversation.latestMsg, currentUser, resolveUserDisplayName]);

  const latestMessageTime = formatConversionTime(conversation.latestMsgSendTime);

  return (
    <div
      className={clsx(
        styles["conversation-item"],
        "conversation-row",
        isActive ? "conversation-row-active" : "",
      )}
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void toSpecifiedConversation();
        }
      }}
      onClick={() => void toSpecifiedConversation()}
    >
      {callSummary?.call && (
        <span
          title={t("calls.people", { count: callSummary.call.participantCount })}
          className="flex items-center gap-1 text-xs text-foreground"
        >
          <Phone size={12} />
          {callSummary.call.participantCount}
        </span>
      )}
      <OIMAvatar
        size={36}
        src={conversation.faceURL}
        isgroup={Boolean(conversation.groupID)}
        text={conversationName}
      />

      <div className="ml-2.5 flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div
              className={clsx(
                "truncate text-[13px] leading-[20px]",
                conversation.unreadCount ? "font-semibold" : "font-medium",
              )}
            >
              {conversationName}
            </div>
            {isHosted && (
              <span
                className="inline-flex h-[17px] shrink-0 items-center gap-0.5 rounded border border-trust-border bg-trust-soft px-1 text-[9px] font-bold leading-none text-trust"
                title={t("secretary.hosting")}
              >
                <Bot size={10} strokeWidth={2} />
                AI
              </span>
            )}
          </div>
          <div className="ml-2 shrink-0 text-[10px] tabular-nums text-faint-foreground">
            {latestMessageTime}
          </div>
        </div>

        <div className="flex min-w-0 items-center">
          <div className="flex min-w-0 flex-1 items-center text-xs">
            <div
              className="conversation-preview min-w-0 truncate text-xs leading-[20px] text-muted-foreground"
              title={latestMessageContent}
            >
              {latestMessageContent}
            </div>
          </div>
          {conversation.unreadCount > 0 && (
            <span className="conversation-unread">
              {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(ConversationItem);

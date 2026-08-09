import type {
  ConversationItem,
  ConversationItem as ConversationItemType,
  MessageItem,
} from "@abd-im/wasm-client-sdk/lib/types/entity";
import { Badge } from "antd";
import clsx from "clsx";
import { t } from "i18next";
import { Bot } from "lucide-react";
import { memo, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import OIMAvatar from "@/components/OIMAvatar";
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
  const updateCurrentConversation = useConversationStore(
    (state) => state.updateCurrentConversation,
  );
  const currentUser = useUserStore((state) => state.selfInfo.userID);

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
      return "";
    }
    try {
      content = getConversationContent(
        JSON.parse(conversation.latestMsg) as MessageItem,
      );
    } catch (error) {
      content = t("messageDescription.catchMessage");
    }
    return content;
  }, [conversation.draftText, conversation.latestMsg, isActive, currentUser]);

  const latestMessageTime = formatConversionTime(conversation.latestMsgSendTime);

  return (
    <div
      className={clsx(
        styles["conversation-item"],
        "border border-transparent transition-colors rounded-lg px-2 py-2 my-0.5 cursor-pointer",
        isActive
          ? "bg-surface-selected shadow-sm text-foreground"
          : "hover:bg-surface-hover text-foreground",
      )}
      onClick={toSpecifiedConversation}
    >
      <Badge size="small" count={conversation.unreadCount}>
        <OIMAvatar
          src={conversation.faceURL}
          isgroup={Boolean(conversation.groupID)}
          text={conversation.showName}
        />
      </Badge>

      <div className="ml-3 flex h-11 flex-1 flex-col justify-between overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="text-body truncate font-medium">
              {conversation.showName}
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
          <div className="ml-2 text-[11px] text-muted-foreground">
            {latestMessageTime}
          </div>
        </div>

        <div className="flex items-center">
          <div className="flex min-h-[16px] flex-1 items-center overflow-hidden text-xs">
            <div
              className="truncate text-muted-foreground text-xs"
              dangerouslySetInnerHTML={{
                __html: latestMessageContent,
              }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(ConversationItem);

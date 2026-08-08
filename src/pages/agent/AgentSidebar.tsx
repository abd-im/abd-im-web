import type { ConversationItem } from "@abd-im/wasm-client-sdk/lib/types/entity";
import { Button, Input, Tooltip } from "antd";
import { Archive, Pencil, Pin, PinOff, Plus, Search, Waypoints } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import FlexibleSider from "@/components/FlexibleSider";
import { agentUserIDFromEx } from "@/features/agent/config";
import {
  renameAgentWorkspace,
  setAgentWorkspacePinned,
} from "@/features/agentWorkspace/actions";
import { splitConversationList } from "@/features/agentWorkspace/conversationLists";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";

import styles from "./agent-workspace.module.scss";

const AgentConversationRow = ({
  conversation,
  active,
}: {
  conversation: ConversationItem;
  active: boolean;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(conversation.showName);
  const updateCurrentConversation = useConversationStore(
    (state) => state.updateCurrentConversation,
  );
  const updateConversationList = useConversationStore(
    (state) => state.updateConversationList,
  );

  const openConversation = async () => {
    await updateCurrentConversation(conversation);
    navigate(`/agent/${conversation.conversationID}`);
  };

  const submitRename = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === conversation.showName) {
      setTitle(conversation.showName);
      setRenaming(false);
      return;
    }
    try {
      const { data } = await IMSDK.getSpecifiedGroupsInfo([conversation.groupID]);
      if (!data[0]) return;
      await renameAgentWorkspace(data[0], nextTitle);
      updateConversationList([{ ...conversation, showName: nextTitle }], "filter");
      setRenaming(false);
    } catch (error) {
      feedbackToast({ error });
    }
  };

  const updatePin = async () => {
    try {
      await setAgentWorkspacePinned(
        conversation.conversationID,
        !conversation.isPinned,
      );
      updateConversationList(
        [{ ...conversation, isPinned: !conversation.isPinned }],
        "filter",
      );
    } catch (error) {
      feedbackToast({ error });
    }
  };

  return (
    <div
      data-testid={`agent-conversation-${conversation.conversationID}`}
      className={`group relative flex min-h-[36px] items-center rounded-md px-2 py-1 ${
        active ? "bg-surface-selected" : "hover:bg-surface-hover"
      }`}
      onClick={() => {
        if (!renaming) void openConversation();
      }}
    >
      <div className="min-w-0 flex-1">
        {renaming ? (
          <Input
            size="small"
            value={title}
            autoFocus
            maxLength={64}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void submitRename()}
            onPressEnter={() => void submitRename()}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <div className="truncate text-xs font-normal text-muted-foreground group-hover:text-foreground">
            {conversation.showName || t("agentWorkspace.newConversation")}
          </div>
        )}
      </div>
      {!renaming && (
        <div
          className={`pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-px pl-3 opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 ${
            active ? "bg-surface-selected" : "bg-surface-hover"
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <Tooltip title={t("agentWorkspace.rename")}>
            <button
              className="grid h-6 w-6 place-items-center rounded text-xs text-muted-foreground hover:bg-surface-selected hover:text-foreground"
              type="button"
              aria-label={t("agentWorkspace.rename")}
              data-testid="agent-conversation-rename"
              onClick={(event) => {
                event.stopPropagation();
                setRenaming(true);
              }}
            >
              <Pencil size={14} strokeWidth={1.8} />
            </button>
          </Tooltip>
          <Tooltip
            title={
              conversation.isPinned
                ? t("agentWorkspace.unpin")
                : t("agentWorkspace.pin")
            }
          >
            <button
              className="grid h-6 w-6 place-items-center rounded text-xs text-muted-foreground hover:bg-surface-selected hover:text-foreground"
              type="button"
              aria-label={
                conversation.isPinned
                  ? t("agentWorkspace.unpin")
                  : t("agentWorkspace.pin")
              }
              data-testid="agent-conversation-pin"
              onClick={(event) => {
                event.stopPropagation();
                void updatePin();
              }}
            >
              {conversation.isPinned ? (
                <PinOff size={14} strokeWidth={1.8} />
              ) : (
                <Pin size={14} strokeWidth={1.8} />
              )}
            </button>
          </Tooltip>
          <Tooltip title={t("agentWorkspace.archiveUnavailable")}>
            <button
              className="grid h-6 w-6 place-items-center rounded text-xs text-muted-foreground hover:bg-surface-selected hover:text-foreground"
              type="button"
              aria-disabled="true"
              aria-label={t("agentWorkspace.archive")}
              data-testid="agent-conversation-archive"
              disabled
            >
              <Archive size={14} strokeWidth={1.8} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
};

const AgentSidebar = () => {
  const { t } = useTranslation();
  const { conversationID } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const selfInfo = useUserStore((state) => state.selfInfo);
  const conversationList = useConversationStore((state) => state.conversationList);
  const conversationKinds = useConversationStore((state) => state.conversationKinds);
  const updateCurrentConversation = useConversationStore(
    (state) => state.updateCurrentConversation,
  );
  const conversations = useMemo(() => {
    const list = splitConversationList(conversationList, conversationKinds).agent;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return normalizedQuery
      ? list.filter((item) =>
          item.showName.toLocaleLowerCase().includes(normalizedQuery),
        )
      : list;
  }, [conversationKinds, conversationList, query]);
  const conversationSections = [
    {
      label: t("agentWorkspace.pinned"),
      items: conversations.filter((item) => item.isPinned),
    },
    {
      label: t("agentWorkspace.recent"),
      items: conversations.filter((item) => !item.isPinned),
    },
  ].filter((section) => section.items.length > 0);

  const startDraftConversation = useCallback(async () => {
    const agentUserID = agentUserIDFromEx(selfInfo.ex);
    if (!agentUserID) {
      feedbackToast({ error: t("agent.settings.notConfigured") });
      return;
    }
    await updateCurrentConversation(undefined);
    navigate("/agent", {
      state: {
        agentWorkspaceDraft: {
          agentUserID,
        },
      },
    });
  }, [navigate, selfInfo.ex, t, updateCurrentConversation]);

  return (
    <FlexibleSider
      needHidden={Boolean(conversationID)}
      wrapClassName="left-2 right-2 top-1.5 flex flex-col"
    >
      <div className={styles.sidebarHeading}>
        <span className={styles.sidebarHeadingMark}>
          <Waypoints size={15} strokeWidth={1.8} />
        </span>
        <strong>{t("agentWorkspace.title")}</strong>
      </div>
      <Button
        className={styles.newConversationButton}
        type="primary"
        icon={<Plus size={15} strokeWidth={1.8} />}
        block
        data-testid="agent-new-conversation"
        onClick={() => void startDraftConversation()}
      >
        {t("agentWorkspace.newConversation")}
      </Button>
      <Input
        className={styles.sidebarSearch}
        prefix={<Search size={14} strokeWidth={1.8} />}
        value={query}
        allowClear
        placeholder={t("agentWorkspace.search")}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {conversationSections.map((section) => (
          <section key={section.label} className="mb-2">
            <h2 className="px-2 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
              {section.label}
            </h2>
            {section.items.map((conversation) => (
              <AgentConversationRow
                key={conversation.conversationID}
                conversation={conversation}
                active={conversation.conversationID === conversationID}
              />
            ))}
          </section>
        ))}
      </div>
    </FlexibleSider>
  );
};

export default AgentSidebar;

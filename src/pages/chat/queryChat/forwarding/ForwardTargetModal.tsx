import { SessionType } from "@abd-im/wasm-client-sdk";
import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Modal } from "antd";
import { FC, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import OIMAvatar from "@/components/OIMAvatar";
import { useContactStore, useConversationStore } from "@/store";

export type ForwardTarget = {
  id: string;
  sourceID: string;
  sessionType: SessionType;
  name: string;
  faceURL: string;
  isGroup: boolean;
};

interface ForwardTargetModalProps {
  open: boolean;
  messageCount: number;
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (targets: ForwardTarget[]) => Promise<boolean>;
}

const targetID = (sessionType: SessionType, sourceID: string) =>
  `${sessionType}:${sourceID}`;

const ForwardTargetModal: FC<ForwardTargetModalProps> = ({
  open,
  messageCount,
  submitting,
  onOpenChange,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const conversationList = useConversationStore((state) => state.conversationList);
  const friendList = useContactStore((state) => state.friendList);
  const groupList = useContactStore((state) => state.groupList);
  const [selectedIDs, setSelectedIDs] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setSelectedIDs([]);
      setQuery("");
    }
  }, [open]);

  const { recentTargets, friendTargets, groupTargets } = useMemo(() => {
    const existing = new Set<string>();
    const recentTargets: ForwardTarget[] = [];
    const friendTargets: ForwardTarget[] = [];
    const groupTargets: ForwardTarget[] = [];

    conversationList.forEach((conversation) => {
      const isGroup = conversation.conversationType === SessionType.Group;
      const sourceID = isGroup ? conversation.groupID : conversation.userID;
      if (
        !sourceID ||
        existing.has(targetID(conversation.conversationType, sourceID))
      ) {
        return;
      }
      existing.add(targetID(conversation.conversationType, sourceID));
      recentTargets.push({
        id: targetID(conversation.conversationType, sourceID),
        sourceID,
        sessionType: conversation.conversationType,
        name: conversation.showName,
        faceURL: conversation.faceURL,
        isGroup,
      });
    });

    friendList.forEach((friend) => {
      const id = targetID(SessionType.Single, friend.userID);
      if (existing.has(id)) return;
      existing.add(id);
      friendTargets.push({
        id,
        sourceID: friend.userID,
        sessionType: SessionType.Single,
        name: friend.remark || friend.nickname,
        faceURL: friend.faceURL,
        isGroup: false,
      });
    });

    groupList.forEach((group) => {
      const id = targetID(SessionType.Group, group.groupID);
      if (existing.has(id)) return;
      existing.add(id);
      groupTargets.push({
        id,
        sourceID: group.groupID,
        sessionType: SessionType.Group,
        name: group.groupName,
        faceURL: group.faceURL,
        isGroup: true,
      });
    });

    return { recentTargets, friendTargets, groupTargets };
  }, [conversationList, friendList, groupList]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filterTargets = (targets: ForwardTarget[]) =>
    normalizedQuery
      ? targets.filter((target) =>
          target.name.toLocaleLowerCase().includes(normalizedQuery),
        )
      : targets;

  const toggleTarget = (id: string) => {
    setSelectedIDs((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };
  const allTargets = [...recentTargets, ...friendTargets, ...groupTargets];
  const selectedTargets = allTargets.filter((target) =>
    selectedIDs.includes(target.id),
  );
  const submit = () => {
    void onSubmit(selectedTargets).then((succeeded) => {
      if (succeeded) onOpenChange(false);
    });
  };

  const renderSection = (title: string, targets: ForwardTarget[]) => {
    const visibleTargets = filterTargets(targets);
    if (!visibleTargets.length) return null;
    return (
      <section className="py-2" aria-label={title}>
        <h3 className="px-1 pb-1 text-xs font-medium text-[var(--sub-text)]">
          {title}
        </h3>
        {visibleTargets.map((target) => {
          const selected = selectedIDs.includes(target.id);
          return (
            <button
              key={target.id}
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-[var(--surface-hover)]"
              aria-pressed={selected}
              onClick={() => toggleTarget(target.id)}
            >
              <span
                aria-hidden
                className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[11px] ${
                  selected
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : "border-[var(--surface-border)]"
                }`}
              >
                {selected ? "✓" : ""}
              </span>
              <OIMAvatar
                size={36}
                src={target.faceURL}
                text={target.name}
                isgroup={target.isGroup}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">
                {target.name}
              </span>
            </button>
          );
        })}
      </section>
    );
  };

  return (
    <Modal
      title={t("placeholder.forwardTo")}
      open={open}
      onCancel={() => onOpenChange(false)}
      closable={!submitting}
      maskClosable={!submitting}
      keyboard={!submitting}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--sub-text)]">
            {t("placeholder.selectedMessageCount", { count: messageCount })}
          </span>
          <div className="flex gap-2">
            <Button disabled={submitting} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="primary"
              loading={submitting}
              disabled={!selectedTargets.length}
              onClick={submit}
            >
              {t("confirm")}
            </Button>
          </div>
        </div>
      }
    >
      <Input
        value={query}
        prefix={<SearchOutlined />}
        placeholder={t("placeholder.search")}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="mt-3 max-h-[360px] overflow-y-auto">
        {renderSection(t("placeholder.latestChat"), recentTargets)}
        {renderSection(t("placeholder.myFriend"), friendTargets)}
        {renderSection(t("placeholder.myGroup"), groupTargets)}
        {!filterTargets(allTargets).length && (
          <p className="py-10 text-center text-sm text-[var(--sub-text)]">
            {t("placeholder.noData")}
          </p>
        )}
      </div>
    </Modal>
  );
};

export default ForwardTargetModal;

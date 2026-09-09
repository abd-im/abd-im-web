import { SessionType } from "@abd-im/wasm-client-sdk";
import { Checkbox } from "antd";
import { CheckSquare, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type BusinessConnection,
  getBusinessConnection,
  updateChatManagement,
} from "@/api/secretary";
import OIMAvatar from "@/components/OIMAvatar";
import { Button } from "@/components/ui";
import { useUserDisplayNameResolver } from "@/hooks/useUserDisplayName";
import { useConversationStore } from "@/store";
import { feedbackToast } from "@/utils/common";

const SecretaryAccessSettings = () => {
  const { t } = useTranslation();
  const conversations = useConversationStore((state) => state.conversationList);
  const resolveUserDisplayName = useUserDisplayNameResolver();
  const [connection, setConnection] = useState<BusinessConnection>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const accessibleConversations = useMemo(
    () =>
      conversations.filter(
        (item) =>
          item.conversationType === SessionType.Single ||
          item.conversationType === SessionType.Group,
      ),
    [conversations],
  );
  const selectedIDs = useMemo(
    () =>
      new Set(
        connection?.chatManagement
          .filter((item) => item.historyAccessEnabled)
          .map((item) => item.conversationID) ?? [],
      ),
    [connection],
  );
  const allSelected =
    accessibleConversations.length > 0 &&
    accessibleConversations.every((item) => selectedIDs.has(item.conversationID));

  useEffect(() => {
    let active = true;
    void getBusinessConnection()
      .then((value) => {
        if (active) setConnection(value);
      })
      .catch((error: unknown) => feedbackToast({ error }))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async (
    items: Array<{ conversationID: string; historyAccessEnabled: boolean }>,
  ) => {
    if (!items.length) return;
    setSaving(true);
    try {
      setConnection(await updateChatManagement(items));
    } catch (error) {
      feedbackToast({ error });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="agent-access-settings">
      <div className="agent-access-heading">
        <div>
          <div className="text-sm font-semibold text-foreground">
            {t("secretary.historyAccess")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("secretary.selectedCount", { count: selectedIDs.size })}
          </div>
        </div>
        <Button
          size="small"
          disabled={loading || saving || accessibleConversations.length === 0}
          onClick={() =>
            void save(
              accessibleConversations.map((item) => ({
                conversationID: item.conversationID,
                historyAccessEnabled: !allSelected,
              })),
            )
          }
        >
          {allSelected ? <Square size={15} /> : <CheckSquare size={15} />}
          {allSelected ? t("secretary.disableAll") : t("secretary.enableAll")}
        </Button>
      </div>

      <div className="agent-access-list">
        {accessibleConversations.map((conversation) => {
          const checked = selectedIDs.has(conversation.conversationID);
          const displayName =
            conversation.conversationType === SessionType.Group
              ? conversation.showName
              : resolveUserDisplayName({
                  userID: conversation.userID,
                  nickname: conversation.showName,
                });
          return (
            <label
              key={conversation.conversationID}
              className="flex min-h-[48px] cursor-pointer items-center gap-3 border-b border-surface-border px-1 last:border-b-0 hover:bg-surface-hover"
            >
              <Checkbox
                checked={checked}
                disabled={loading || saving}
                onChange={(event) =>
                  void save([
                    {
                      conversationID: conversation.conversationID,
                      historyAccessEnabled: event.target.checked,
                    },
                  ])
                }
              />
              <OIMAvatar
                size={32}
                src={conversation.faceURL}
                text={displayName}
                isgroup={conversation.conversationType === SessionType.Group}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {displayName}
              </span>
            </label>
          );
        })}
        {!loading && accessibleConversations.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t("secretary.noConversations")}
          </div>
        )}
        {loading && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t("connect.syncing")}
          </div>
        )}
      </div>
    </div>
  );
};

export default SecretaryAccessSettings;

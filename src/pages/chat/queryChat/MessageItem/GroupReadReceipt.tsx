import type { GroupMemberItem } from "@abd-im/wasm-client-sdk";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import OIMAvatar from "@/components/OIMAvatar";
import { CircularProgress, Popover } from "@/components/ui";
import { useUserDisplayNameResolver } from "@/hooks/useUserDisplayName";
import { useGroupReadReceiptStore } from "@/store/groupReadReceipt";

import styles from "./group-read-receipt.module.scss";

const MemberList = ({
  members,
  title,
  emptyText,
  resolveName,
}: {
  members: GroupMemberItem[];
  title: string;
  emptyText: string;
  resolveName: (member: GroupMemberItem) => string;
}) => (
  <section className={styles.column}>
    <h3 className={styles.heading}>
      <strong>{members.length}</strong> {title}
    </h3>
    <div className={styles.members}>
      {members.length === 0 ? (
        <div className={styles.empty}>{emptyText}</div>
      ) : (
        members.map((member) => {
          const displayName = resolveName(member);
          return (
            <div key={member.userID} className={styles.member}>
              <OIMAvatar size={25} src={member.faceURL} text={displayName} />
              <span title={displayName}>{displayName}</span>
            </div>
          );
        })
      )}
    </div>
  </section>
);

export default function GroupReadReceipt({
  conversationID,
  clientMsgID,
}: {
  conversationID: string;
  clientMsgID: string;
}) {
  const { t } = useTranslation();
  const resolveUserDisplayName = useUserDisplayNameResolver();
  const group = useGroupReadReceiptStore((state) => state.groups[conversationID]);
  const [open, setOpen] = useState(false);
  const info = group?.groupMessageReadInfo.find(
    (item) => item.clientMsgID === clientMsgID,
  );
  if (!group?.enabled || !info) return null;

  const total = (info?.hasReadCount ?? 0) + (info?.unreadCount ?? 0);
  const ratio = total > 0 ? (info?.hasReadCount ?? 0) / total : 0;
  const resolveMemberName = (member: GroupMemberItem) => resolveUserDisplayName(member);
  const summary =
    info && info.hasReadCount > 0 && info.hasReadCount <= 3
      ? t("groupReadReceipt.names", {
          names: info.readMembers.map(resolveMemberName).join(", "),
        })
      : t("groupReadReceipt.summary", {
          read: info?.hasReadCount ?? 0,
          unread: info?.unreadCount ?? 0,
        });
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      className={styles.popover}
      trigger={
        <button
          type="button"
          data-read-receipt-trigger
          data-group-read-receipt-trigger
          className={styles.trigger}
          title={summary}
          aria-label={summary}
          aria-expanded={open}
        >
          <CircularProgress
            className={styles.progress}
            value={ratio * 100}
            label={summary}
          />
        </button>
      }
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <strong>{t("groupReadReceipt.status")}</strong>
        </header>
        <div className={styles.columns}>
          <MemberList
            members={info.readMembers}
            title={t("groupReadReceipt.read")}
            emptyText={t("groupReadReceipt.noReaders")}
            resolveName={resolveMemberName}
          />
          <MemberList
            members={info.unreadMembers}
            title={t("groupReadReceipt.unread")}
            emptyText={t("groupReadReceipt.allRead")}
            resolveName={resolveMemberName}
          />
        </div>
      </div>
    </Popover>
  );
}

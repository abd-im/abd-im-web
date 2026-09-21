import type { MessageReadMember } from "@abd-im/wasm-client-sdk";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import OIMAvatar from "@/components/OIMAvatar";
import { CircularProgress, Popover } from "@/components/ui";
import { useUserDisplayNameResolver } from "@/hooks/useUserDisplayName";
import { useMessageReadReceiptStore } from "@/store/messageReadReceipt";

import styles from "./message-read-receipt.module.scss";

const MemberList = ({
  members,
  title,
  emptyText,
  resolveName,
}: {
  members: MessageReadMember[];
  title: string;
  emptyText: string;
  resolveName: (member: MessageReadMember) => string;
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

export default function MessageReadReceipt({
  conversationID,
  seq,
}: {
  conversationID: string;
  seq: number;
}) {
  const { t } = useTranslation();
  const resolveUserDisplayName = useUserDisplayNameResolver();
  const receipt = useMessageReadReceiptStore(
    (state) => state.conversations[conversationID],
  );
  const [open, setOpen] = useState(false);
  const info = receipt?.messageReadInfo.find((item) => item.seq === seq);
  if (receipt?.status === "ready" && !receipt.enabled) return null;
  if (!info) {
    return (
      <span
        data-read-receipt-trigger
        data-message-read-receipt
        className={`${styles.trigger} ${styles.placeholder}`}
      >
        <CircularProgress
          className={styles.progress}
          value={0}
          label={t("placeholder.unread")}
        />
      </span>
    );
  }

  const total = info.hasReadCount + info.unreadCount;
  const ratio = total > 0 ? info.hasReadCount / total : 0;
  const resolveMemberName = (member: MessageReadMember) =>
    resolveUserDisplayName(member);
  const summary =
    info.hasReadCount > 0 && info.hasReadCount <= 3
      ? t("messageReadReceipt.names", {
          names: info.readMembers.map(resolveMemberName).join(", "),
        })
      : t("messageReadReceipt.summary", {
          read: info.hasReadCount,
          unread: info.unreadCount,
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
          data-message-read-receipt
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
          <strong>{t("messageReadReceipt.status")}</strong>
        </header>
        <div className={styles.columns}>
          <MemberList
            members={info.readMembers}
            title={t("messageReadReceipt.read")}
            emptyText={t("messageReadReceipt.noReaders")}
            resolveName={resolveMemberName}
          />
          <MemberList
            members={info.unreadMembers}
            title={t("messageReadReceipt.unread")}
            emptyText={t("messageReadReceipt.allRead")}
            resolveName={resolveMemberName}
          />
        </div>
      </div>
    </Popover>
  );
}

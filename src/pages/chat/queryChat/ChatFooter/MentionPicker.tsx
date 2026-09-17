import { GroupMemberRole } from "@abd-im/wasm-client-sdk";
import type { GroupMemberItem } from "@abd-im/wasm-client-sdk/lib/types/entity";
import { AtSign, LoaderCircle } from "lucide-react";
import { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import type { MentionQuery } from "@/components/CKEditor";
import OIMAvatar from "@/components/OIMAvatar";
import { useUserDisplayNameResolver } from "@/hooks/useUserDisplayName";

import { AT_ALL_TAG } from "../mentions";
import styles from "./mention-picker.module.scss";

export type MentionCandidate = GroupMemberItem | { userID: typeof AT_ALL_TAG };

export const getMentionWireName = (candidate: MentionCandidate, mentionAll: string) =>
  "nickname" in candidate ? candidate.nickname : mentionAll;

export default function MentionPicker({
  query,
  candidates,
  activeIndex,
  loading,
  onActiveIndexChange,
  onSelect,
}: {
  query: MentionQuery;
  candidates: MentionCandidate[];
  activeIndex: number;
  loading: boolean;
  onActiveIndexChange: (index: number) => void;
  onSelect: (candidate: MentionCandidate) => void;
}) {
  const { t } = useTranslation();
  const resolveUserDisplayName = useUserDisplayNameResolver();
  const rect = query.anchorRect;
  const width = Math.min(288, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect?.left ?? 16, window.innerWidth - width - 8));
  const bottom = Math.max(
    8,
    window.innerHeight - (rect?.top ?? window.innerHeight) + 8,
  );

  return createPortal(
    <div
      className={styles.picker}
      style={{ left, bottom, width } as CSSProperties}
      role="listbox"
      aria-label={t("placeholder.selectMember")}
      data-mention-picker
    >
      {loading && candidates.length === 0 ? (
        <div className={styles.state} role="status">
          <LoaderCircle className="animate-spin" size={15} />
        </div>
      ) : candidates.length === 0 ? (
        <div className={styles.state}>{t("empty.noSearchResults")}</div>
      ) : (
        candidates.map((candidate, index) => {
          const member = "nickname" in candidate ? candidate : undefined;
          const isAll = !member;
          const displayName = member
            ? resolveUserDisplayName(member)
            : t("placeholder.mentionAll");
          const role =
            member?.roleLevel === GroupMemberRole.Owner
              ? t("placeholder.groupOwner")
              : member?.roleLevel === GroupMemberRole.Admin
              ? t("placeholder.administrator")
              : "";
          return (
            <button
              id={`mention-option-${index}`}
              key={candidate.userID}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`${styles.option} ${
                index === activeIndex ? styles.active : ""
              }`}
              onMouseEnter={() => onActiveIndexChange(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(candidate)}
            >
              {isAll ? (
                <span className={styles.allAvatar} aria-hidden>
                  <AtSign size={15} />
                </span>
              ) : (
                <OIMAvatar size={28} src={member?.faceURL} text={displayName} />
              )}
              <span className={styles.name}>{displayName}</span>
              {role && <span className={styles.role}>{role}</span>}
            </button>
          );
        })
      )}
    </div>,
    document.body,
  );
}

import {
  EllipsisOutlined,
  PlusOutlined,
  RollbackOutlined,
  SmileOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Dropdown } from "antd";
import clsx from "clsx";
import { FC, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MessageReactionSummary } from "@/api/messageReactionTypes";
import { ALLOWED_REACTION_EMOJIS } from "@/api/messageReactionTypes";

import styles from "./message-item.module.scss";

interface MessageReactionBarProps {
  summary?: MessageReactionSummary;
  isSender: boolean;
  canReact?: boolean;
  isPending?: (emoji: string) => boolean;
  onToggle?: (emoji: string, reactedByMe: boolean) => void;
  onReply?: () => void;
  menuItems?: MenuProps["items"];
  onMenuClick?: MenuProps["onClick"];
  actionsDisabled?: boolean;
}

const formatCount = (count: number) => (count > 999 ? "999+" : String(count));

const MessageReactionBar: FC<MessageReactionBarProps> = ({
  summary,
  isSender,
  canReact = true,
  isPending,
  onToggle,
  onReply,
  menuItems,
  onMenuClick,
  actionsDisabled,
}) => {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reactions = summary?.reactions ?? [];
  const hasReactions = canReact && reactions.length > 0;

  const openPicker = () => {
    clearTimeout(closeTimer.current);
    setMoreOpen(false);
    setPickerOpen(true);
  };

  const schedulePickerClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPickerOpen(false), 500);
  };

  useEffect(() => {
    if (!pickerOpen) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapperRef.current?.contains(target)) return;
      setPickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
      clearTimeout(closeTimer.current);
    };
  }, [pickerOpen]);

  const picker = (
    <div
      className={clsx(
        styles["reaction-picker"],
        pickerOpen && styles["reaction-picker-open"],
      )}
      role="menu"
      onMouseEnter={() => clearTimeout(closeTimer.current)}
      onMouseLeave={schedulePickerClose}
    >
      {ALLOWED_REACTION_EMOJIS.map((emoji) => {
        const reaction = reactions.find((item) => item.emoji === emoji);
        const pending = isPending?.(emoji) ?? false;
        return (
          <button
            key={emoji}
            type="button"
            data-reaction-picker-emoji={emoji}
            role="menuitemcheckbox"
            className={clsx(
              styles["reaction-picker-option"],
              reaction?.reactedByMe && styles["reaction-selected"],
            )}
            aria-label={`${t("placeholder.addReaction")} ${emoji}`}
            aria-pressed={reaction?.reactedByMe ?? false}
            aria-checked={reaction?.reactedByMe ?? false}
            disabled={pending}
            onClick={() => {
              onToggle?.(emoji, reaction?.reactedByMe ?? false);
              setPickerOpen(false);
            }}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      className={clsx(
        styles["reaction-wrapper"],
        isSender && styles["reaction-wrapper-sender"],
      )}
    >
      {hasReactions && (
        <div className={styles["reaction-bar"]}>
          {reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              data-reaction-emoji={reaction.emoji}
              className={clsx(
                styles["reaction-chip"],
                reaction.reactedByMe && styles["reaction-chip-selected"],
              )}
              aria-pressed={reaction.reactedByMe}
              disabled={isPending?.(reaction.emoji) ?? false}
              onClick={() => onToggle?.(reaction.emoji, reaction.reactedByMe)}
            >
              <span className={styles["reaction-emoji"]} aria-hidden>
                {reaction.emoji}
              </span>
              <span className={styles["reaction-count"]}>
                {formatCount(reaction.count)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div
        className={clsx(
          styles["reaction-actions"],
          (pickerOpen || moreOpen) && styles["reaction-actions-open"],
        )}
      >
        {canReact && (
          <button
            type="button"
            data-testid="add-message-reaction"
            className={styles["reaction-action"]}
            title={t("placeholder.addReaction")}
            aria-label={t("placeholder.addReaction")}
            aria-haspopup="menu"
            aria-expanded={pickerOpen}
            onMouseEnter={openPicker}
            onMouseLeave={schedulePickerClose}
            onClick={openPicker}
          >
            <span className={styles["reaction-add-icon"]} aria-hidden>
              <SmileOutlined />
              <PlusOutlined className={styles["reaction-add-plus"]} />
            </span>
          </button>
        )}
        <button
          type="button"
          className={styles["reaction-action"]}
          title={t("placeholder.reply")}
          aria-label={t("placeholder.reply")}
          disabled={actionsDisabled || !onReply}
          onClick={onReply}
        >
          <RollbackOutlined />
        </button>
        <Dropdown
          menu={{ items: menuItems ?? [], onClick: onMenuClick }}
          trigger={["click"]}
          disabled={actionsDisabled}
          open={moreOpen}
          onOpenChange={(open) => {
            setMoreOpen(open);
            if (open) setPickerOpen(false);
          }}
        >
          <button
            type="button"
            className={styles["reaction-action"]}
            title={t("placeholder.viewMore")}
            aria-label={t("placeholder.viewMore")}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
          >
            <EllipsisOutlined />
          </button>
        </Dropdown>
      </div>
      {canReact && picker}
    </div>
  );
};

export default MessageReactionBar;

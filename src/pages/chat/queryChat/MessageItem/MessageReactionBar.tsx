import {
  EllipsisOutlined,
  PlusOutlined,
  RollbackOutlined,
  SmileOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Dropdown, Popover } from "antd";
import clsx from "clsx";
import { FC, useEffect, useState } from "react";
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
  const reactions = summary?.reactions ?? [];
  const hasReactions = canReact && reactions.length > 0;

  useEffect(() => {
    if (!pickerOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [pickerOpen]);

  const picker = (
    <div className={styles["reaction-picker"]} role="menu">
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

      {!actionsDisabled && (
        <div
          className={clsx(
            styles["reaction-actions"],
            (pickerOpen || moreOpen) && styles["reaction-actions-open"],
          )}
        >
          {canReact && (
            <Popover
              content={picker}
              trigger={["hover", "click"]}
              placement={isSender ? "bottomRight" : "bottomLeft"}
              arrow={false}
              autoAdjustOverflow
              getPopupContainer={() => document.body}
              overlayInnerStyle={{
                padding: 0,
                background: "transparent",
                boxShadow: "none",
              }}
              mouseEnterDelay={0}
              mouseLeaveDelay={0.5}
              open={pickerOpen}
              onOpenChange={(open) => {
                setPickerOpen(open);
                if (open) setMoreOpen(false);
              }}
            >
              <button
                type="button"
                data-testid="add-message-reaction"
                className={styles["reaction-action"]}
                aria-label={t("placeholder.addReaction")}
                aria-haspopup="menu"
                aria-expanded={pickerOpen}
              >
                <span className={styles["reaction-add-icon"]} aria-hidden>
                  <SmileOutlined />
                  <PlusOutlined className={styles["reaction-add-plus"]} />
                </span>
              </button>
            </Popover>
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
      )}
    </div>
  );
};

export default MessageReactionBar;

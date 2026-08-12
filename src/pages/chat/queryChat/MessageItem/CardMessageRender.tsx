import { UserRound } from "lucide-react";
import { FC } from "react";
import { useTranslation } from "react-i18next";

import OIMAvatar from "@/components/OIMAvatar";
import { emit } from "@/utils/events";

import { IMessageItemProps } from ".";

const CardMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const { t } = useTranslation();
  const card = message.cardElem;
  if (!card) return null;

  return (
    <button
      type="button"
      className="flex min-w-[240px] max-w-[280px] items-center gap-3 rounded-lg border border-surface-border bg-surface p-3 text-left text-foreground shadow-surface transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      onClick={() => emit("OPEN_USER_CARD", { userID: card.userID })}
    >
      <OIMAvatar size={44} src={card.faceURL} text={card.nickname} />
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-semibold text-inherit">
          {card.nickname}
        </strong>
        <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <UserRound size={13} strokeWidth={1.8} />
          {t("placeholder.personalCard")}
        </span>
      </span>
    </button>
  );
};

export default CardMessageRender;

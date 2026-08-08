import { Button, Tooltip } from "antd";
import { Forward, GitMerge, Trash2, X } from "lucide-react";
import { FC } from "react";
import { useTranslation } from "react-i18next";

interface ForwardSelectionBarProps {
  count: number;
  onMergeForward: () => void;
  onSingleForward: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const ForwardSelectionBar: FC<ForwardSelectionBarProps> = ({
  count,
  onMergeForward,
  onSingleForward,
  onDelete,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[58px] shrink-0 items-center justify-between border-t border-[var(--surface-border)] bg-[var(--surface-raised)] px-5 sm:px-8">
      <span className="text-sm text-[var(--sub-text)]">
        {t("placeholder.selectedMessageCount", { count })}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="text"
          icon={<GitMerge size={17} />}
          disabled={!count}
          onClick={onMergeForward}
        >
          {t("placeholder.mergeForward")}
        </Button>
        <Button
          type="text"
          icon={<Forward size={17} />}
          disabled={!count}
          onClick={onSingleForward}
        >
          {t("placeholder.forward")}
        </Button>
        <Tooltip title={t("placeholder.delete")}>
          <Button
            type="text"
            icon={<Trash2 size={17} />}
            aria-label={t("placeholder.delete")}
            disabled={!count}
            onClick={onDelete}
          />
        </Tooltip>
        <Tooltip title={t("placeholder.close")}>
          <Button
            type="text"
            icon={<X size={18} />}
            aria-label={t("placeholder.close")}
            onClick={onClose}
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default ForwardSelectionBar;

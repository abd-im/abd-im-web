import { useTranslation } from "react-i18next";

import { CircularProgress } from "@/components/ui";

import styles from "./group-read-receipt.module.scss";

export default function SingleReadReceipt({ isRead }: { isRead: boolean }) {
  const { t } = useTranslation();
  const label = isRead ? t("placeholder.isRead") : t("placeholder.unread");

  return (
    <span
      data-read-receipt-trigger
      data-single-read-receipt
      className={`${styles.trigger} ${styles.single}`}
      title={label}
    >
      <CircularProgress
        className={styles.progress}
        value={isRead ? 100 : 0}
        label={label}
      />
    </span>
  );
}

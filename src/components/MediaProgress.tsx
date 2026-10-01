import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui";
import type { useCachedMedia } from "@/hooks/useCachedMedia";
import { bytesToSize, feedbackToast } from "@/utils/common";

export function MediaProgress({ media }: { media: ReturnType<typeof useCachedMedia> }) {
  const { t } = useTranslation();
  if (!media.managed || (media.file && media.snapshot?.state === "completed"))
    return null;
  const busy =
    media.loading ||
    media.snapshot?.state === "downloading" ||
    media.snapshot?.state === "queued";
  return (
    <div
      className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"
      role="status"
    >
      <span>
        {busy
          ? media.snapshot && media.snapshot.size < 0
            ? bytesToSize(media.snapshot.downloaded)
            : `${bytesToSize(media.snapshot?.downloaded || 0)} / ${bytesToSize(
                media.snapshot?.size || 0,
              )}`
          : t(media.error ? "mediaCache.failed" : "mediaCache.notCached")}
      </span>
      {busy ? (
        <Button
          size="small"
          onClick={() => void media.cancel().catch((error) => feedbackToast({ error }))}
        >
          {t("mediaCache.cancel")}
        </Button>
      ) : (
        <Button size="small" onClick={media.download}>
          {t(media.error ? "filePreview.retry" : "mediaCache.download")}
        </Button>
      )}
    </div>
  );
}

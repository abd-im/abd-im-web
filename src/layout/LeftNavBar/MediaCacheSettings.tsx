import type { MediaCacheUsage } from "@abd-im/wasm-client-sdk";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Input } from "@/components/ui";
import { IMSDK } from "@/layout/MainContentWrap";
import { bytesToSize, feedbackToast } from "@/utils/common";

export function MediaCacheSettings() {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<MediaCacheUsage>();
  const [limit, setLimit] = useState<number>();
  const [busy, setBusy] = useState(false);
  const validLimit = limit !== undefined && Number.isSafeInteger(limit) && limit >= 1;
  useEffect(() => {
    void IMSDK.getMediaCacheUsage()
      .then(({ data }) => {
        setUsage(data);
        setLimit(data.settings.maxBytes / 1024 / 1024);
      })
      .catch((error) => feedbackToast({ error }));
  }, []);
  const update = async (clear: boolean) => {
    setBusy(true);
    try {
      let result;
      if (clear) {
        result = await IMSDK.clearMediaCache();
      } else {
        if (!validLimit) return;
        result = await IMSDK.setMediaCacheSettings({ maxBytes: limit * 1024 * 1024 });
      }
      const { data } = result;
      setUsage(data);
      setLimit(data.settings.maxBytes / 1024 / 1024);
    } catch (error) {
      feedbackToast({ error });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-section">
      <h3>{t("mediaCache.title")}</h3>
      <div className="settings-row">
        <span>{t("mediaCache.usage")}</span>
        <span>{usage ? bytesToSize(usage.bytes) : "—"}</span>
      </div>
      <div className="settings-row">
        <label htmlFor="media-cache-limit">{t("mediaCache.limit")}</label>
        <div className="flex min-w-0 items-center gap-2">
          <Input
            id="media-cache-limit"
            className="w-24"
            type="number"
            min={1}
            step={1}
            value={limit ?? ""}
            aria-invalid={limit !== undefined && !validLimit}
            disabled={busy}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              setLimit(Number.isFinite(value) ? value : undefined);
            }}
          />
          <span>MB</span>
        </div>
        <Button
          size="small"
          disabled={busy || !validLimit}
          onClick={() => void update(false)}
        >
          {t("mediaCache.apply")}
        </Button>
      </div>
      <p className="px-3 text-xs text-muted-foreground">{t("mediaCache.clearHint")}</p>
      <button
        className="settings-row settings-link"
        disabled={busy || !usage}
        onClick={() => void update(true)}
      >
        {t("mediaCache.clear")}
      </button>
    </section>
  );
}

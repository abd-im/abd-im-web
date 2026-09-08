import { Button, Modal, Popover, Tooltip } from "antd";
import { CircleAlert, CircleCheck, Download, RefreshCw } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDesktopUpdate } from "@/store/desktopUpdate";
import "./app-update.scss";

const invoke = (action: (() => Promise<void>) | undefined) => {
  void action?.().catch(() => undefined);
};

export function UpdateDetails({ mandatory = false }: { mandatory?: boolean }) {
  const { t } = useTranslation();
  const { state, setOpen } = useDesktopUpdate();
  if (!state) return null;
  const api = window.electronAPI?.updates;
  const busy = ["checking", "downloading", "verifying", "installing"].includes(
    state.phase,
  );
  const ready = state.phase === "downloaded";
  const Icon = state.error ? CircleAlert : ready ? CircleCheck : Download;
  return (
    <div className="app-update-details" data-testid="update-details">
      <div className="app-update-heading" aria-live="polite">
        <Icon size={16} aria-hidden />
        <strong>
          {t(
            mandatory ? "desktopUpdate.required" : `desktopUpdate.phase.${state.phase}`,
          )}
        </strong>
      </div>
      <div className="app-update-version">
        {state.release
          ? `${state.currentVersion} → ${state.release.version}`
          : state.currentVersion}
      </div>
      {state.error && (
        <p className="app-update-error" role="status">
          {t(`desktopUpdate.error.${state.error}`)}
        </p>
      )}
      {["downloading", "verifying"].includes(state.phase) && (
        <div>
          <div className="app-update-progress-label">
            <span>{t(`desktopUpdate.phase.${state.phase}`)}</span>
            <span>
              {state.phase === "downloading" && state.total
                ? `${Math.floor(state.progress || 0)}%`
                : ""}
            </span>
          </div>
          <div
            className="app-update-progress"
            role="progressbar"
            aria-label={t("desktopUpdate.progress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.total ? Math.floor(state.progress || 0) : undefined}
          >
            <div
              className={!state.total ? "indeterminate" : ""}
              style={{ width: `${state.progress || 0}%` }}
            />
          </div>
        </div>
      )}
      {state.release?.text && (
        <details className="app-update-notes">
          <summary>{t("desktopUpdate.notes")}</summary>
          <div>{state.release.text}</div>
        </details>
      )}
      {ready && <p className="app-update-hint">{t("desktopUpdate.onQuit")}</p>}
      <div className="app-update-actions">
        {ready ? (
          <Button
            type="primary"
            size="small"
            icon={<RefreshCw size={14} />}
            onClick={() => invoke(api?.install)}
          >
            {t("desktopUpdate.restart")}
          </Button>
        ) : (
          <Button
            type="primary"
            size="small"
            disabled={state.phase === "disabled" || busy}
            loading={busy}
            onClick={() => invoke(api?.check)}
          >
            {t(
              busy
                ? `desktopUpdate.phase.${state.phase}`
                : state.release
                ? "desktopUpdate.retry"
                : "desktopUpdate.check",
            )}
          </Button>
        )}
        {mandatory ? (
          <Button size="small" type="text" onClick={() => invoke(api?.quit)}>
            {t("desktopUpdate.quit")}
          </Button>
        ) : (
          <Button size="small" type="text" onClick={() => setOpen(false)}>
            {t("desktopUpdate.later")}
          </Button>
        )}
      </div>
      {state.error && state.release && (
        <button
          className="app-update-download"
          onClick={() => invoke(api?.openDownload)}
        >
          {t("desktopUpdate.manualDownload")}
        </button>
      )}
    </div>
  );
}

export function MandatoryUpdate() {
  const { t } = useTranslation();
  const state = useDesktopUpdate((value) => value.state);
  const mandatory = Boolean(state?.release?.force && state.phase !== "upToDate");
  return (
    <Modal
      title={<span className="sr-only">{t("desktopUpdate.required")}</span>}
      open={mandatory}
      footer={null}
      closable={false}
      maskClosable={false}
      keyboard={false}
      width={360}
      zIndex={900}
      centered
      className="app-update-modal"
    >
      <UpdateDetails mandatory />
    </Modal>
  );
}

export function UpdateAboutRow() {
  const { t } = useTranslation();
  const state = useDesktopUpdate((value) => value.state);
  const setOpen = useDesktopUpdate((value) => value.setOpen);
  if (!window.electronAPI?.updates) return null;
  return (
    <div className="app-update-about">
      <span>
        {t(state ? `desktopUpdate.phase.${state.phase}` : "desktopUpdate.check")}
      </span>
      <Button
        size="small"
        onClick={() => {
          setOpen(true);
          invoke(window.electronAPI?.updates?.check);
        }}
      >
        {t("desktopUpdate.check")}
      </Button>
    </div>
  );
}

export default function AppUpdateBar() {
  const { t } = useTranslation();
  const { state, open, setOpen } = useDesktopUpdate();
  const button = useRef<HTMLButtonElement>(null);
  if (!window.electronAPI?.updates || !state || state.phase === "disabled") return null;
  const ready = state.phase === "downloaded";
  const label = ready
    ? t("desktopUpdate.readyVersion", { version: state.release?.version })
    : t(`desktopUpdate.phase.${state.phase}`);
  const Icon = state.error ? CircleAlert : ready ? RefreshCw : Download;
  return (
    <div
      className="app-update-entry"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <Popover
        open={open && !state.release?.force}
        onOpenChange={setOpen}
        trigger="click"
        placement="rightBottom"
        arrow={false}
        overlayClassName="app-update-popover"
        content={<UpdateDetails />}
      >
        <Tooltip title={!open ? label : undefined} placement="right">
          <button
            ref={button}
            className="app-update-trigger"
            aria-label={label}
            aria-expanded={open}
            data-testid="update-trigger"
          >
            <Icon size={16} />
            {ready && <span className="app-update-dot" />}
          </button>
        </Tooltip>
      </Popover>
    </div>
  );
}

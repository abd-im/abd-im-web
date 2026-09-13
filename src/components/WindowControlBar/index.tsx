import { Platform } from "@abd-im/wasm-client-sdk";
import { useKeyPress } from "ahooks";
import { t } from "i18next";
import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";

const WindowControlBar = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const isMacOS = window.electronAPI?.getPlatform() === Platform.MacOSX;

  useKeyPress("esc", (event) => {
    if (
      event.defaultPrevented ||
      document.querySelector(
        '[role="dialog"], .app-update-popover:not(.ant-popover-hidden)',
      )
    )
      return;
    window.electronAPI?.ipcInvoke("minimizeWindow");
  });

  useEffect(() => {
    if (!window.electronAPI || isMacOS) return;
    return window.electronAPI.subscribe("windowMaximizedChanged", setIsMaximized);
  }, [isMacOS]);

  if (!window.electronAPI || isMacOS) {
    return null;
  }

  const toggleMaximize = async () => {
    const maximized = await window.electronAPI?.ipcInvoke<boolean>("maxmizeWindow");
    if (typeof maximized === "boolean") {
      setIsMaximized(maximized);
    }
  };

  const minimizeLabel = t("workspace.windowControls.minimize");
  const maximizeLabel = t(
    isMaximized
      ? "workspace.windowControls.restore"
      : "workspace.windowControls.maximize",
  );
  const closeLabel = t("workspace.windowControls.close");

  return (
    <div
      className="app-no-drag window-controls"
      role="group"
      aria-label={t("workspace.windowControls.label")}
    >
      <button
        type="button"
        className="window-control-button"
        aria-label={minimizeLabel}
        title={minimizeLabel}
        onClick={() => void window.electronAPI?.ipcInvoke("minimizeWindow")}
      >
        <Minus size={15} strokeWidth={1.4} />
      </button>
      <button
        type="button"
        className="window-control-button"
        aria-label={maximizeLabel}
        title={maximizeLabel}
        onClick={() => void toggleMaximize()}
      >
        {isMaximized ? (
          <Copy size={12} strokeWidth={1.35} />
        ) : (
          <Square size={11} strokeWidth={1.35} />
        )}
      </button>
      <button
        type="button"
        className="window-control-button window-control-close"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={() => void window.electronAPI?.ipcInvoke("closeWindow")}
      >
        <X size={15} strokeWidth={1.35} />
      </button>
    </div>
  );
};

export default WindowControlBar;

import { app, ipcMain, net, powerMonitor, session, shell } from "electron";
import { randomUUID } from "node:crypto";
import { autoUpdater } from "electron-updater";
import { getMainWindow, sendEvent } from "./windowManage";
import { logger } from ".";
import {
  UpdateController,
  trustedUpdateURL,
  trustedUpdaterRequest,
  validateUpdateManifest,
} from "./updateController";

const channel = "desktop-update:";
const apiURL = import.meta.env.VITE_UPDATE_API_URL as string | undefined;
const origins = ((import.meta.env.VITE_UPDATE_ORIGINS as string) || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const platform =
  process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
    ? "mac"
    : "unsupported";
const supported =
  (platform === "windows" && process.arch === "x64") ||
  (platform === "mac" && process.arch === "arm64");
let controller: UpdateController | undefined;
let initialized = false;
let allowQuit = false;
let preparing = false;
let pending:
  | { id: string; resolve: (value: "ready" | "busy" | "failed") => void }
  | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryAttempt = 0;

async function checkUpdates() {
  clearTimeout(retryTimer);
  await controller?.check();
  clearTimeout(retryTimer);
  if (controller?.state.phase === "error") {
    const delay = Math.min(15 * 60_000, 60_000 * 2 ** retryAttempt++);
    retryTimer = setTimeout(() => void checkUpdates(), delay);
    retryTimer.unref();
  } else {
    retryAttempt = 0;
  }
}

export function initDesktopUpdates() {
  if (initialized) return;
  initialized = true;
  const enabled =
    app.isPackaged &&
    supported &&
    Boolean(apiURL?.startsWith("https://") && origins.length);
  autoUpdater.autoDownload = false;
  // Delay native installation handoff until drafts and active tasks have been checked.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = logger;
  autoUpdater.on("error", (error) => {
    logger.error("desktop update failed", error);
    if (controller?.state.phase === "installing") {
      allowQuit = false;
      global.forceQuit = false;
      controller.set({ phase: "downloaded", error: "install" });
      sendEvent(channel + "resume");
    }
  });
  session
    .fromPartition("electron-updater", { cache: false })
    .webRequest.onBeforeRequest((details, callback) => {
      try {
        trustedUpdaterRequest(details.url, origins);
        callback({ cancel: false });
      } catch {
        callback({ cancel: true });
      }
    });
  controller = new UpdateController({
    version: app.getVersion(),
    platform,
    arch: process.arch,
    origins,
    enabled,
    publish: (state) => sendEvent(channel + "state", state),
    log: (error) => logger.warn("desktop update", error),
    query: async () => {
      const response = await net.fetch(apiURL!, {
        method: "POST",
        redirect: "error",
        credentials: "omit",
        headers: { "Content-Type": "application/json", operationID: randomUUID() },
        body: JSON.stringify({
          platform,
          version: app.getVersion(),
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Update service HTTP ${response.status}`);
      const body = await response.json();
      if (body.errCode !== 0 || !body.data)
        throw new Error("Invalid update service response");
      return body.data;
    },
    download: async (release, onProgress) => {
      autoUpdater.setFeedURL({ provider: "generic", url: release.feedUrl });
      const result = await autoUpdater.checkForUpdates();
      if (!result) throw new Error("Updater is unavailable");
      validateUpdateManifest(result.updateInfo, release, origins);
      const progress = (info: {
        percent: number;
        transferred: number;
        total: number;
      }) => onProgress(info.percent, info.transferred, info.total);
      autoUpdater.on("download-progress", progress);
      try {
        await autoUpdater.downloadUpdate();
      } finally {
        autoUpdater.removeListener("download-progress", progress);
      }
    },
  });

  const handle = (name: string, action: (...args: any[]) => unknown) => {
    ipcMain.handle(channel + name, (event, ...args) => {
      const window = getMainWindow();
      if (
        !window ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      )
        throw new Error("Untrusted update IPC sender");
      return action(...args);
    });
  };
  handle("getState", () => controller!.state);
  handle("check", () => checkUpdates());
  handle("install", () => requestUpdateExit(true));
  handle("quit", () => requestUpdateExit(false));
  handle("openDownload", async () => {
    const url = controller!.state.release?.url;
    if (url) {
      trustedUpdateURL(url, origins);
      await shell.openExternal(url);
    }
  });
  handle("prepared", (id, result) => {
    if (
      typeof id === "string" &&
      pending?.id === id &&
      ["ready", "busy", "failed"].includes(result)
    )
      pending.resolve(result);
  });

  app.on("before-quit", (event) => {
    if (allowQuit) return;
    if (controller!.state.phase === "downloaded" || preparing) {
      event.preventDefault();
      void requestUpdateExit(false);
    } else {
      global.forceQuit = true;
    }
  });
  if (enabled) {
    setTimeout(() => void checkUpdates(), 10_000).unref();
    setInterval(() => void checkUpdates(), 4 * 60 * 60 * 1000).unref();
    powerMonitor.on("resume", () => {
      if (Date.now() - (controller!.state.checkedAt || 0) > 5 * 60 * 1000)
        void checkUpdates();
    });
  }
}

async function requestUpdateExit(restart: boolean) {
  if (!controller || preparing || controller.state.phase === "installing") return;
  if (restart && controller.state.phase !== "downloaded") return;
  const hasUpdate = controller.state.phase === "downloaded";
  const candidateID = hasUpdate ? controller.state.release?.id : undefined;
  preparing = true;
  const id = randomUUID();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await new Promise<"ready" | "busy" | "failed">((resolve) => {
    pending = { id, resolve };
    timer = setTimeout(() => resolve("failed"), 5000);
    sendEvent(channel + "prepare", id);
  });
  clearTimeout(timer);
  pending = undefined;
  preparing = false;
  if (result !== "ready") {
    global.forceQuit = false;
    controller.set({ error: result === "busy" ? "busy" : "prepare" });
    sendEvent(channel + "resume");
    getMainWindow()?.show();
    return;
  }
  if (
    hasUpdate &&
    (controller.state.phase !== "downloaded" ||
      controller.state.release?.id !== candidateID)
  ) {
    global.forceQuit = false;
    sendEvent(channel + "resume");
    return;
  }
  allowQuit = true;
  global.forceQuit = true;
  if (!hasUpdate) {
    app.quit();
    return;
  }
  controller.set({ phase: "installing", error: undefined });
  autoUpdater.autoRunAppAfterInstall = restart;
  try {
    autoUpdater.quitAndInstall(true, restart);
  } catch (error) {
    logger.error("update installation failed", error);
    allowQuit = false;
    global.forceQuit = false;
    controller.set({ phase: "downloaded", error: "install" });
    sendEvent(channel + "resume");
  }
}

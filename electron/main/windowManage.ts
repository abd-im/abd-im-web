import { createHash } from "node:crypto";
import { join } from "node:path";
import { app, BrowserWindow, Notification, shell } from "electron";
import { IpcMainToRender } from "../constants";
import { isMac } from "../utils";
import { destroyTray } from "./trayManage";
import { getIsForceQuit } from "./appManage";
import { registerShortcuts, unregisterShortcuts } from "./shortcutManage";
import { logger } from ".";

const url = process.env.VITE_DEV_SERVER_URL;
let mainWindow: BrowserWindow | null = null;
export const getMainWindow = () => mainWindow;
let splashWindow: BrowserWindow | null = null;

type MessageNotificationParams = {
  title: string;
  body: string;
  sourceID: string;
  sessionType: number;
};

type PendingMessageNotification = {
  params: MessageNotificationParams;
  timer: ReturnType<typeof setTimeout>;
};

const MESSAGE_NOTIFICATION_DEBOUNCE_MS = 300;
const MESSAGE_NOTIFICATION_GROUP_ID = "abd-im-messages";
const messageNotifications = new Map<string, Notification>();
const pendingMessageNotifications = new Map<string, PendingMessageNotification>();

const getMessageNotificationID = (params: MessageNotificationParams) =>
  createHash("sha256")
    .update(`${params.sessionType}:${params.sourceID}`)
    .digest("hex")
    .slice(0, 16);

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    frame: false,
    width: 200,
    height: 200,
    resizable: false,
    transparent: true,
  });
  splashWindow.loadFile(global.pathConfig.splashHtml);
  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

export function createMainWindow() {
  createSplashWindow();
  mainWindow = new BrowserWindow({
    title: app.getName(),
    icon: join(global.pathConfig.publicPath, "icons", "icon.png"),
    frame: false,
    show: false,
    width: 1024,
    height: 726,
    minWidth: 1024,
    minHeight: 726,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: global.pathConfig.preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: true,
      webSecurity: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    // Open devTool if the app is not packaged
    mainWindow.loadURL(url);
  } else {
    mainWindow.loadFile(global.pathConfig.indexHtml);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("focus", () => {
    for (const { timer } of pendingMessageNotifications.values()) {
      clearTimeout(timer);
    }
    pendingMessageNotifications.clear();
    for (const notification of messageNotifications.values()) {
      notification.close();
    }
    messageNotifications.clear();
    mainWindow?.flashFrame(false);
    registerShortcuts();
  });

  mainWindow.on("blur", () => {
    unregisterShortcuts();
  });

  mainWindow.on("close", (e) => {
    const window = mainWindow;
    if (!window) return;

    if (!global.forceQuit && (getIsForceQuit() || !window.isVisible())) {
      // Keep the renderer alive for the update manager's before-quit preparation.
      e.preventDefault();
      app.quit();
      return;
    }
    if (global.forceQuit) {
      mainWindow = null;
      destroyTray();
    } else {
      e.preventDefault();
      if (isMac && window.isFullScreen()) {
        window.setFullScreen(false);
      }
      window.hide();
    }
  });
  return mainWindow;
}

export function splashEnd() {
  splashWindow?.close();
  mainWindow?.show();
}

// utils
export const isExistMainWindow = (): boolean =>
  !!mainWindow && !mainWindow?.isDestroyed();

export const closeWindow = () => {
  if (!mainWindow) return;
  mainWindow.close();
};

export const sendEvent = (name: string, ...args: any[]) => {
  if (!mainWindow) return;
  mainWindow.webContents.send(name, ...args);
};

export const showMessageNotification = (params: MessageNotificationParams) => {
  if (!mainWindow || mainWindow.isFocused() || !Notification.isSupported()) {
    return;
  }

  const notificationID = getMessageNotificationID(params);
  const pendingNotification = pendingMessageNotifications.get(notificationID);
  if (pendingNotification) {
    clearTimeout(pendingNotification.timer);
  }
  const timer = setTimeout(() => {
    const pendingParams = pendingMessageNotifications.get(notificationID)?.params;
    pendingMessageNotifications.delete(notificationID);
    if (!pendingParams || !mainWindow || mainWindow.isFocused()) return;

    const notification = new Notification({
      id: notificationID,
      groupId: MESSAGE_NOTIFICATION_GROUP_ID,
      title: pendingParams.title,
      body: pendingParams.body,
      icon: join(global.pathConfig.publicPath, "icons", "icon.png"),
      silent: true,
    });
    notification.on("click", () => {
      showWindow();
      sendEvent(IpcMainToRender.messageNotificationClicked, {
        sourceID: pendingParams.sourceID,
        sessionType: pendingParams.sessionType,
      });
    });
    notification.on("show", () => {
      logger.debug("message notification shown");
    });
    notification.on("failed", (_, error) => {
      if (messageNotifications.get(notificationID) === notification) {
        messageNotifications.delete(notificationID);
      }
      logger.error("message notification failed", error);
    });
    notification.on("close", () => {
      if (messageNotifications.get(notificationID) === notification) {
        messageNotifications.delete(notificationID);
      }
    });
    messageNotifications.set(notificationID, notification);
    notification.show();
  }, MESSAGE_NOTIFICATION_DEBOUNCE_MS);
  pendingMessageNotifications.set(notificationID, { params, timer });
};

export const minimize = () => {
  if (!mainWindow) return;
  mainWindow.minimize();
};
export const updateMaximize = () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
};
export const showWindow = () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (mainWindow.isVisible()) {
    mainWindow.focus();
  } else {
    mainWindow.show();
  }
};
export const hideWindow = () => {
  if (!mainWindow) return;
  mainWindow.hide();
};
export const toggleDevTools = () => {
  if (!mainWindow) return;
  if (mainWindow.webContents.isDevToolsOpened()) {
    mainWindow.webContents.closeDevTools();
  } else {
    mainWindow.webContents.openDevTools({
      mode: "detach",
    });
  }
};

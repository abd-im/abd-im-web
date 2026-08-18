import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { isMac } from "../utils";
import { destroyTray } from "./trayManage";
import { getIsForceQuit } from "./appManage";
import { registerShortcuts, unregisterShortcuts } from "./shortcutManage";

const url = process.env.VITE_DEV_SERVER_URL;
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

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
    mainWindow?.flashFrame(false);
    registerShortcuts();
  });

  mainWindow.on("blur", () => {
    unregisterShortcuts();
  });

  mainWindow.on("close", (e) => {
    const window = mainWindow;
    if (!window) return;

    if (getIsForceQuit() || !window.isVisible()) {
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

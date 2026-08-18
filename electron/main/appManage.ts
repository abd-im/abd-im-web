import { app, powerMonitor } from "electron";
import { isExistMainWindow, sendEvent, showWindow } from "./windowManage";
import { join } from "node:path";
import fs from "fs";
import { isMac, isProd, isWin } from "../utils";
import { getStore } from "./storeManage";
import { IpcMainToRender } from "../constants";
import { logger } from ".";

const store = getStore();

export const setSingleInstance = () => {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
  }

  app.on("second-instance", () => {
    showWindow();
  });
};

export const setAppListener = (startApp: () => void) => {
  app.on("activate", () => {
    if (isExistMainWindow()) {
      showWindow();
    } else {
      startApp();
    }
  });

  app.on("window-all-closed", () => {
    if (isMac && !getIsForceQuit()) return;

    app.quit();
  });

  powerMonitor.on("suspend", () => {
    logger.debug("app suspend");
  });

  powerMonitor.on("resume", () => {
    logger.debug("app resume");
    sendEvent(IpcMainToRender.appResume);
  });
};

export const setAppGlobalData = () => {
  const electronDistPath = join(__dirname, "../");
  const distPath = join(electronDistPath, "../dist");
  const publicPath = isProd ? distPath : join(electronDistPath, "../public");

  global.pathConfig = {
    publicPath,
    logsPath: join(app.getPath("userData"), `/OpenIMData/logs`),
    sdkResourcesPath: join(app.getPath("userData"), `/OpenIMData/sdkResources`),
    trayIcon: join(publicPath, `/icons/${isWin ? "icon.png" : "tray.png"}`),
    indexHtml: join(distPath, "index.html"),
    splashHtml: join(distPath, "splash.html"),
    preload: join(__dirname, "../preload/index.js"),
  };

  if (isProd) {
    fs.mkdirSync(global.pathConfig.logsPath, { recursive: true });
    fs.mkdirSync(global.pathConfig.sdkResourcesPath, { recursive: true });
  }
};

export const getIsForceQuit = () =>
  store.get("closeAction") === "quit" || global.forceQuit;

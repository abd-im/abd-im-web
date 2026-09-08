import { app } from "electron";
import { join } from "node:path";
import { createMainWindow } from "./windowManage";
import { createTray } from "./trayManage";
import { setIpcMainListener } from "./ipcHandlerManage";
import { setAppGlobalData, setAppListener, setSingleInstance } from "./appManage";
import createAppMenu from "./menuManage";
import { isLinux } from "../utils";
import { getLogger } from "../utils/log";
import { initI18n } from "../i18n";
import { initDesktopUpdates } from "./updateManage";

export const logger = getLogger(join(app.getPath("userData"), `/OpenIMData/logs`));

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const init = () => {
  initI18n();
  createMainWindow();
  createAppMenu();
  createTray();
};

setAppGlobalData();
setIpcMainListener();
setSingleInstance();
setAppListener(init);

app.whenReady().then(() => {
  initDesktopUpdates();
  isLinux ? setTimeout(init, 300) : init();
});

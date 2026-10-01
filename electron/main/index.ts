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
import { closeMediaIO, initMediaIO, registerMediaScheme } from "./media";

export const logger = getLogger(join(app.getPath("userData"), `/OpenIMData/logs`));

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
registerMediaScheme();

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
  initMediaIO();
  initDesktopUpdates();
  let mediaClosed = false;
  let closingMedia = false;
  app.on("before-quit", (event) => {
    if (mediaClosed || event.defaultPrevented) return;
    event.preventDefault();
    if (closingMedia) return;
    closingMedia = true;
    void closeMediaIO()
      .catch((error) => logger.error("Media cleanup failed", error))
      .finally(() => {
        mediaClosed = true;
        app.quit();
      });
  });
  isLinux ? setTimeout(init, 300) : init();
});

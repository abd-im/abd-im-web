import log from "electron-log/main";
import { join } from "node:path";

const getLogger = (logsPath: string) => {
  log.transports.file.level = "debug";
  log.transports.file.maxSize = 104857600; // max size 100M
  log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}]{scope} {text}";
  log.transports.file.resolvePathFn = () => join(logsPath, `OpenIM.log`);
  log.initialize({ preload: true });
  return log.scope("ipcMain");
};

export { getLogger };

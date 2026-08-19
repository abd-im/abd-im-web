import fs from "fs";
import path from "path";
import type { DataPath, IElectronAPI } from "./../../src/types/globalExpose.d";
import { contextBridge, ipcRenderer } from "electron";
import { isProd } from "../utils";

const OpenIMPlatform = {
  Windows: 3,
  MacOSX: 4,
  Linux: 7,
} as const;

const getPlatform = () => {
  if (process.platform === "darwin") {
    return OpenIMPlatform.MacOSX;
  }
  if (process.platform === "win32") {
    return OpenIMPlatform.Windows;
  }
  return OpenIMPlatform.Linux;
};

const getDataPath = (key: DataPath) => {
  switch (key) {
    case "public":
      return isProd ? ipcRenderer.sendSync("getDataPath", "public") : "";
    case "sdkResources":
      return isProd ? ipcRenderer.sendSync("getDataPath", "sdkResources") : "";
    case "logsPath":
      return isProd ? ipcRenderer.sendSync("getDataPath", "logsPath") : "";
    default:
      return "";
  }
};

const subscribe = (channel: string, callback: (...args: any[]) => void) => {
  const subscription = (_: Electron.IpcRendererEvent, ...args: any[]) =>
    callback(...args);
  ipcRenderer.on(channel, subscription);
  return () => ipcRenderer.removeListener(channel, subscription);
};

const ipcInvoke = (channel: string, ...arg: any) => {
  return ipcRenderer.invoke(channel, ...arg);
};

const ipcSendSync = (channel: string, ...arg: any) => {
  return ipcRenderer.sendSync(channel, ...arg);
};

const getUniqueSavePath = (originalPath: string) => {
  let counter = 0;
  let savePath = originalPath;
  let fileDir = path.dirname(originalPath);
  let fileName = path.basename(originalPath);
  let fileExt = path.extname(originalPath);
  let baseName = path.basename(fileName, fileExt);

  while (fs.existsSync(savePath)) {
    counter++;
    fileName = `${baseName}(${counter})${fileExt}`;
    savePath = path.join(fileDir, fileName);
  }

  return savePath;
};

const saveFileToDisk = async ({ file }: { file: File }): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const saveDir = ipcRenderer.sendSync("getDataPath", "sdkResources");
  const savePath = path.join(saveDir, file.name);
  const uniqueSavePath = getUniqueSavePath(savePath);
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }
  await fs.promises.writeFile(uniqueSavePath, Buffer.from(arrayBuffer));
  return uniqueSavePath;
};

const Api: IElectronAPI = {
  getDataPath,
  getPlatform,
  subscribe,
  ipcInvoke,
  ipcSendSync,
  saveFileToDisk,
};

contextBridge.exposeInMainWorld("electronAPI", Api);

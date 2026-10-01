import fs from "fs";
import path from "path";
import type { DataPath, IElectronAPI } from "./../../src/types/globalExpose.d";
import { contextBridge, ipcRenderer } from "electron";
import { isProd } from "../utils";
import type { MediaStorageReader, MediaStorageRequest } from "@abd-im/wasm-client-sdk";
import { randomUUID } from "node:crypto";

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

const mediaReaders = new Map<string, MediaStorageReader>();
const mediaRefs = new Map<string, string>();
ipcRenderer.on("media:read", (_event, owner: string, id: string, offset: number) => {
  const read = mediaReaders.get(owner);
  const result = read
    ? read(offset)
    : Promise.reject(new Error("Media reader released"));
  void result.then(
    (data) => ipcRenderer.send("media:read-result", id, data),
    (error: Error) => ipcRenderer.send("media:read-result", id, "", error.message),
  );
});

const Api: IElectronAPI = {
  media: {
    storage: async (request, onProgress, read) => {
      const operation: MediaStorageRequest = JSON.parse(request);
      const id = randomUUID();
      if (read) mediaReaders.set(id, read);
      const unsubscribe = subscribe(
        "media:progress",
        (requestID: string, bytes: number) => {
          if (requestID === id) onProgress(bytes);
        },
      );
      try {
        const result: string = await ipcInvoke("media:io", id, request);
        if (read) mediaRefs.set(JSON.parse(result).ref, id);
        if (operation.method === "release") {
          const owner = mediaRefs.get(operation.args);
          if (owner) mediaReaders.delete(owner);
          mediaRefs.delete(operation.args);
        }
        if (operation.method === "close") {
          mediaReaders.clear();
          mediaRefs.clear();
        }
        return result;
      } catch (error) {
        mediaReaders.delete(id);
        throw error;
      } finally {
        unsubscribe();
      }
    },
    save: (ref, name) => ipcInvoke("media:save", ref, name),
  },
  updates: {
    getState: () => ipcInvoke("desktop-update:getState"),
    check: () => ipcInvoke("desktop-update:check"),
    install: () => ipcInvoke("desktop-update:install"),
    quit: () => ipcInvoke("desktop-update:quit"),
    openDownload: () => ipcInvoke("desktop-update:openDownload"),
    subscribe: callback => subscribe("desktop-update:state", callback),
    onPrepare: callback => subscribe("desktop-update:prepare", callback),
    prepared: (id, result) => ipcInvoke("desktop-update:prepared", id, result),
    onResume: callback => subscribe("desktop-update:resume", callback),
  },
  getDataPath,
  getPlatform,
  subscribe,
  ipcInvoke,
  ipcSendSync,
  saveFileToDisk,
};

contextBridge.exposeInMainWorld("electronAPI", Api);

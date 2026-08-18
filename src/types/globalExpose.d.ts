import { Platform } from "@abd-im/wasm-client-sdk";

export type DataPath = "public" | "sdkResources" | "logsPath";

export interface IElectronAPI {
  getDataPath: (key: DataPath) => string;
  getPlatform: () => Platform;
  subscribe: (channel: string, callback: (...args: any[]) => void) => () => void;
  ipcInvoke: <T = unknown>(channel: string, ...arg: any) => Promise<T>;
  ipcSendSync: <T = unknown>(channel: string, ...arg: any) => T;
  saveFileToDisk: (params: { file: File }) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
    userClick: (userID?: string, groupID?: string) => void;
    editRevoke: (clientMsgID: string) => void;
    screenshotPreview: (results: string) => void;
  }
}

declare module "i18next" {
  interface TFunction {
    (key: string, options?: object): string;
  }
}

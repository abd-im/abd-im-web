/// <reference types="vite-electron-plugin/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    VSCODE_DEBUG?: "true";
  }
}

interface PathConfig {
  publicPath: string;
  logsPath: string;
  sdkResourcesPath: string;
  trayIcon: string;
  indexHtml: string;
  splashHtml: string;
  preload: string;
}

declare var pathConfig: PathConfig;
declare var forceQuit: boolean | undefined;

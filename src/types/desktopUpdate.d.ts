export interface DesktopRelease {
  id: string;
  platform: "windows" | "mac";
  arch: "x64" | "arm64";
  version: string;
  url: string;
  feedUrl: string;
  text: string;
  force: boolean;
}

export type UpdatePhase =
  | "idle"
  | "checking"
  | "upToDate"
  | "downloading"
  | "verifying"
  | "downloaded"
  | "installing"
  | "error"
  | "disabled";
export type UpdateError =
  | "check"
  | "download"
  | "validation"
  | "install"
  | "busy"
  | "prepare";
export interface DesktopUpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  release?: DesktopRelease;
  progress?: number;
  transferred?: number;
  total?: number;
  checkedAt?: number;
  error?: UpdateError;
  revision: number;
}

export interface DesktopUpdateAPI {
  getState: () => Promise<DesktopUpdateState>;
  check: () => Promise<void>;
  install: () => Promise<void>;
  quit: () => Promise<void>;
  openDownload: () => Promise<void>;
  subscribe: (callback: (state: DesktopUpdateState) => void) => () => void;
  onPrepare: (callback: (requestID: string) => void) => () => void;
  prepared: (requestID: string, result: "ready" | "busy" | "failed") => Promise<void>;
  onResume: (callback: () => void) => () => void;
}

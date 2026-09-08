import { Platform } from "@abd-im/wasm-client-sdk";
import { gt, valid } from "semver";

const platformNames: Partial<Record<Platform, string>> = {
  [Platform.Windows]: "windows",
  [Platform.MacOSX]: "mac",
  [Platform.Linux]: "linux",
};

export const getApplicationPlatform = (platform: Platform) => platformNames[platform];

export const isNewerVersion = (candidate: string, current: string) => {
  const next = valid(candidate.trim());
  const base = valid(current.trim());
  return Boolean(next && base && gt(next, base));
};

export const APP_NAME = "ABD IM";
export const APP_VERSION = "v1.0.0";
export const SDK_VERSION = "SDK(ffi) v3.8.3";
export const isSaveLog = process.env.NODE_ENV !== "development";

// Dynamically resolve backend URLs based on browser location if env variables are empty or default to placeholders
const getRuntimeUrls = () => {
  const isBrowser = typeof window !== "undefined";

  let api = (import.meta.env.VITE_API_URL as string) || "";
  let ws = (import.meta.env.VITE_WS_URL as string) || "";
  let chat = (import.meta.env.VITE_CHAT_URL as string) || "";

  if (isBrowser) {
    const hostname = window.location.hostname;
    const isHttps = window.location.protocol === "https:";

    // Detect if we are using the default placeholder configurations
    const isApiPlaceholder =
      !api || api.includes("your-server") || api.includes("PLACEHOLDER");
    const isWsPlaceholder =
      !ws || ws.includes("your-server") || ws.includes("PLACEHOLDER");
    const isChatPlaceholder =
      !chat || chat.includes("your-server") || chat.includes("PLACEHOLDER");

    if (isApiPlaceholder) {
      api = isHttps ? `https://${hostname}/api` : `http://${hostname}:10002`;
    }
    if (isWsPlaceholder) {
      ws = isHttps ? `wss://${hostname}/msg_gateway` : `ws://${hostname}:10001`;
    }
    if (isChatPlaceholder) {
      chat = isHttps ? `https://${hostname}/chat` : `http://${hostname}:10008`;
    }
  }

  return { api, ws, chat };
};

export const {
  api: RUNTIME_API_URL,
  ws: RUNTIME_WS_URL,
  chat: RUNTIME_CHAT_URL,
} = getRuntimeUrls();

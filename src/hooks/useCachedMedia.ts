import type {
  MediaFile,
  MediaMessageRef,
  MediaSnapshot,
  MessageItem,
  WSEvent,
} from "@abd-im/wasm-client-sdk";
import { CbEvents, MessageStatus } from "@abd-im/wasm-client-sdk";
import { createContext, useContext, useEffect, useState } from "react";

import { IMSDK } from "@/layout/MainContentWrap";
import { getConversationIDByMsg } from "@/utils/imCommon";

export const MediaCacheEnabledContext = createContext(true);

export function useCachedMedia(
  message: MessageItem | undefined,
  variant: MediaMessageRef["variant"],
  active: boolean,
  automatic = false,
) {
  const cacheEnabled = useContext(MediaCacheEnabledContext);
  const managed = Boolean(
    cacheEnabled &&
      window.electronAPI &&
      message?.status === MessageStatus.Succeed &&
      !message.attachedInfoElem?.isPrivateChat,
  );
  const conversationID = message ? getConversationIDByMsg(message) : "";
  const clientMsgID = message?.clientMsgID || "";
  const [snapshot, setSnapshot] = useState<MediaSnapshot>();
  const [file, setFile] = useState<MediaFile>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFile(undefined);
    setSnapshot(undefined);
    setError(false);
    setLoading(false);
    if (!managed || !active) return;
    let disposed = false;
    let opened: MediaFile | undefined;
    let opening: Promise<void> | undefined;
    let key = "";
    const ref = { conversationID, clientMsgID, variant };
    const release = (file: MediaFile) => {
      void IMSDK.closeMedia(file.ref).catch((reason) =>
        console.error("Close media preview failed", reason),
      );
    };
    const open = () => {
      if (opening) return opening;
      opening = IMSDK.openMedia(ref).then(({ data }) => {
        if (disposed) release(data);
        else {
          opened = data;
          setFile(data);
        }
      });
      return opening;
    };
    const receive = ({ data }: WSEvent<MediaSnapshot>) => {
      if (disposed || data.key !== key) return;
      setSnapshot(data);
      if (data.state === "completed") {
        void open().catch((reason) => {
          console.error("Open media preview failed", reason);
          if (!disposed) setError(true);
        });
      }
    };
    IMSDK.on(CbEvents.OnMediaChanged, receive);
    setLoading(true);
    void (async () => {
      let { data } = await IMSDK.getMedia(ref);
      key = data.key;
      if (disposed) return;
      setSnapshot(data);
      if (variant === "video") await open();
      if (data.state !== "completed" && (automatic || attempt > 0)) {
        ({ data } = await IMSDK.cacheMedia(ref));
        if (disposed) return;
        setSnapshot(data);
      }
      if (data.state === "completed") await open();
    })()
      .catch((reason) => {
        console.error("Media load failed", reason);
        if (!disposed) setError(true);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      IMSDK.off(CbEvents.OnMediaChanged, receive);
      if (opened) release(opened);
    };
  }, [managed, active, automatic, conversationID, clientMsgID, variant, attempt]);

  return {
    managed,
    file,
    snapshot,
    loading,
    error,
    download: () => setAttempt((value) => value + 1),
    cancel: async () => {
      if (snapshot) await IMSDK.cancelMedia(snapshot.key);
    },
  };
}

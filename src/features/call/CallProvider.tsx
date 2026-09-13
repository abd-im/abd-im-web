import "@livekit/components-styles";
import "./call.scss";

import { CbEvents, SessionType } from "@abd-im/wasm-client-sdk";
import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import { Modal } from "antd";
import { Participant, RoomEvent, Track } from "livekit-client";
import {
  Maximize2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import OIMAvatar from "@/components/OIMAvatar";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";
import { getRtcDeviceFailure } from "@/utils/rtcMedia";

import {
  Call,
  CallTarget,
  createCallApi,
  loadCallStatus,
  parseCallEvent,
  targetKey,
} from "./api";
import { CallSession, updateSubscriptions } from "./session";

interface Summary {
  call: Call | null;
  stale: boolean;
}
interface CallContextValue {
  session: CallSession;
  summaries: Record<string, Summary>;
  watch: (target: CallTarget) => () => void;
  start: (target: CallTarget) => Promise<void>;
  join: (call: Call) => Promise<void>;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
}
const callErrorCodes = new Set([20201, 20202, 20203, 20205]);
const forbiddenCallStatusCode = 20012;
const CallContext = createContext<CallContextValue | null>(null);
export function useCall() {
  const value = useContext(CallContext);
  if (!value) throw new Error("CallProvider is missing");
  return value;
}
export const conversationTarget = (c: {
  groupID?: string;
  userID?: string;
}): CallTarget | undefined =>
  c.groupID
    ? { type: SessionType.Group, id: c.groupID }
    : c.userID
    ? { type: SessionType.Single, id: c.userID }
    : undefined;

export function CallProvider({ children }: { children: ReactNode }) {
  const userID = useUserStore((s) => s.selfInfo.userID);
  // A login change replaces the whole lifecycle, including captured API credentials.
  return (
    <SignedInCalls key={userID || "signed-out"} userID={userID}>
      {children}
    </SignedInCalls>
  );
}
function SignedInCalls({ userID, children }: { userID: string; children: ReactNode }) {
  const { t } = useTranslation();
  const [, render] = useReducer((n: number) => n + 1, 0);
  const translate = useRef(t);
  translate.current = t;
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [expanded, setExpanded] = useState(false);
  const mounted = useRef(true);
  const watches = useRef(new Map<string, { target: CallTarget; count: number }>());
  const sequences = useRef(new Map<string, number>());
  const refreshRef = useRef<(targets?: CallTarget[]) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const scheduleRef = useRef<ReturnType<typeof setTimeout>>();
  const connectState = useUserStore((s) => s.connectState);
  const api = useMemo(() => createCallApi(), []);
  const session = useMemo(
    () =>
      new CallSession(
        userID,
        api,
        () => {
          if (mounted.current) render();
        },
        (error) => {
          const key = getRtcDeviceFailure(error);
          const code = (error as { errCode?: number })?.errCode;
          feedbackToast({
            msg: translate.current(
              code && callErrorCodes.has(code)
                ? `calls.errors.${code}`
                : key === "other"
                ? "calls.failed"
                : `rtcCall.error.${key}`,
            ),
          });
        },
      ),
    [api, userID],
  );
  const current = useConversationStore((s) => s.currentConversation);

  const watch = useMemo(
    () => (target: CallTarget) => {
      const key = targetKey(target);
      const prior = watches.current.get(key);
      watches.current.set(key, { target, count: (prior?.count ?? 0) + 1 });
      clearTimeout(scheduleRef.current);
      scheduleRef.current = setTimeout(() => void refreshRef.current(), 100);
      return () => {
        const item = watches.current.get(key);
        if (item && --item.count <= 0) watches.current.delete(key);
      };
    },
    [],
  );
  const groupID = current?.groupID,
    peerID = current?.userID;
  useEffect(() => {
    const target = conversationTarget({ groupID, userID: peerID });
    return target ? watch(target) : undefined;
  }, [groupID, peerID, watch]);

  refreshRef.current = async (requested) => {
    if (!userID || !mounted.current || document.hidden) return;
    const targets = new Map(watches.current);
    if (session.current)
      targets.set(targetKey(session.current.target), {
        target: session.current.target,
        count: 1,
      });
    const list = requested ?? [...targets.values()].map((v) => v.target);
    for (let offset = 0; offset < list.length; offset += 50) {
      const batch = list.slice(offset, offset + 50);
      const versions = new Map(
        batch.map((target) => {
          const key = targetKey(target),
            seq = (sequences.current.get(key) ?? 0) + 1;
          sequences.current.set(key, seq);
          return [key, seq];
        }),
      );
      const expectedAttempt = session.current?.id;
      const valid = (key: string) =>
        mounted.current && sequences.current.get(key) === versions.get(key);
      try {
        const { items } = await api.status(batch);
        for (const item of items) {
          const key = targetKey(item.target);
          if (!valid(key)) continue;
          if (item.error) {
            const forbidden = item.error.errCode === forbiddenCallStatusCode;
            setSummaries((old) => ({
              ...old,
              [key]: {
                call: forbidden ? null : old[key]?.call ?? null,
                stale: !forbidden,
              },
            }));
          } else {
            setSummaries((old) => ({
              ...old,
              [key]: { call: item.call, stale: false },
            }));
            if (
              expectedAttempt &&
              session.current?.id === expectedAttempt &&
              targetKey(session.current.target) === key
            )
              session.reconcile(item.call);
          }
        }
      } catch {
        if (!mounted.current) return;
        setSummaries((old) => {
          const next = { ...old };
          for (const target of batch) {
            const key = targetKey(target);
            if (valid(key)) next[key] = { call: old[key]?.call ?? null, stale: true };
          }
          return next;
        });
      }
    }
  };

  useEffect(() => {
    mounted.current = true;
    const queued = new Map<string, CallTarget>();
    let timer: ReturnType<typeof setTimeout>;
    const handler = ({ data }: { data: unknown }) => {
      const event = parseCallEvent(data);
      if (!event || !userID) return;
      // Only the SDK's dedicated server business-notification callback enters here.
      queued.set(targetKey(event.target), event.target);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const targets = [...queued.values()];
        queued.clear();
        void refreshRef.current(targets);
      }, 80);
      if (event.key !== "call.invited") return;
      void loadCallStatus(api.status, event.target)
        .then((call) => {
          if (!mounted.current || !call) return;
          void session.incoming(call);
        })
        .catch(() => undefined);
    };
    const foreground = () => {
      if (!document.hidden) void refreshRef.current();
    };
    IMSDK.on(CbEvents.OnRecvCustomBusinessMessage, handler);
    document.addEventListener("visibilitychange", foreground);
    const poll = setInterval(foreground, 15000);
    foreground();
    return () => {
      mounted.current = false;
      clearInterval(poll);
      clearTimeout(timer);
      clearTimeout(scheduleRef.current);
      IMSDK.off(CbEvents.OnRecvCustomBusinessMessage, handler);
      document.removeEventListener("visibilitychange", foreground);
      session.dispose();
    };
  }, [api, session, userID]);
  useEffect(() => {
    void refreshRef.current();
  }, [connectState]);
  const attempt = session.current;

  const switchIfNeeded = async (target: CallTarget) => {
    const active = session.current;
    if (!active) return true;
    if (targetKey(active.target) === targetKey(target)) {
      setExpanded(true);
      return false;
    }
    if (active.target.type !== SessionType.Group || target.type !== SessionType.Group) {
      feedbackToast({ msg: t("calls.busy") });
      return false;
    }
    const confirmed = await new Promise<boolean>((resolve) =>
      Modal.confirm({
        title: t("calls.switchTitle"),
        content: t("calls.switchDescription"),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      }),
    );
    if (!confirmed || session.current !== active) return false;
    await session.leave();
    return !session.current;
  };
  const value: CallContextValue = {
    session,
    summaries,
    watch,
    expanded,
    setExpanded,
    start: async (target) => {
      if (await switchIfNeeded(target)) await session.start(target);
    },
    join: async (call) => {
      if (await switchIfNeeded(call.target)) await session.join(call);
    },
  };
  return (
    <CallContext.Provider value={value}>
      {children}
      {attempt?.room && (
        <RoomContext.Provider value={attempt.room}>
          <RoomAudioRenderer />
        </RoomContext.Provider>
      )}
    </CallContext.Provider>
  );
}

export function useCallSummary(target?: CallTarget) {
  const { watch, summaries } = useCall();
  const type = target?.type,
    id = target?.id;
  useEffect(() => (type && id ? watch({ type, id }) : undefined), [type, id, watch]);
  return target ? summaries[targetKey(target)] : undefined;
}
export function GroupCallBar() {
  const { t } = useTranslation();
  const current = useConversationStore((s) => s.currentConversation);
  const target = current?.groupID
    ? { type: SessionType.Group as const, id: current.groupID }
    : undefined;
  const summary = useCallSummary(target);
  const { join, session, setExpanded } = useCall();
  if (!summary?.call) return null;
  const call = summary.call;
  const joined =
    session.current !== undefined &&
    targetKey(session.current.target) === targetKey(call.target);
  return (
    <div className="group-call-bar">
      <Phone size={16} />
      <span>
        {t("calls.people", { count: call.participantCount })}
        {summary.stale && ` · ${t("calls.stale")}`}
      </span>
      <button
        type="button"
        onClick={() => (joined ? setExpanded(true) : void join(call))}
      >
        {t(joined ? "calls.expand" : "calls.join")}
      </button>
    </div>
  );
}
export function CallHost() {
  const { t } = useTranslation();
  const { session, expanded, setExpanded } = useCall();
  const attempt = session.current,
    room = attempt?.room;
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [page, setPage] = useState(0);
  const [mediaBusy, setMediaBusy] = useState(false);
  const conversations = useConversationStore((s) => s.conversationList);
  const name =
    conversations.find((c) => {
      const target = conversationTarget(c);
      return target && attempt && targetKey(target) === targetKey(attempt.target);
    })?.showName ??
    attempt?.target.id ??
    "";
  const participants: Participant[] = room
    ? [room.localParticipant, ...room.remoteParticipants.values()].sort((a, b) =>
        a.identity.localeCompare(b.identity),
      )
    : [];
  const pages = Math.max(1, Math.ceil(participants.length / 9));
  const currentPage = Math.min(page, pages - 1);
  const visible = participants.slice(currentPage * 9, currentPage * 9 + 9);
  const visibleKey = expanded ? visible.map((p) => p.identity).join(",") : "";
  useEffect(() => {
    setPage(0);
  }, [attempt?.id]);
  useEffect(() => {
    if (!room) return;
    const changed = () => redraw();
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.Reconnected,
      RoomEvent.AudioPlaybackStatusChanged,
    ];
    events.forEach((event) => room.on(event, changed));
    return () => {
      events.forEach((event) => room.off(event, changed));
    };
  }, [room]);
  useEffect(() => {
    if (!room) return;
    const visibleIDs = new Set(visibleKey ? visibleKey.split(",") : []);
    const update = () => updateSubscriptions(room, visibleIDs);
    update();
    const events = [
      RoomEvent.TrackPublished,
      RoomEvent.ParticipantConnected,
      RoomEvent.Reconnected,
    ];
    events.forEach((event) => room.on(event, update));
    return () => {
      events.forEach((event) => room.off(event, update));
    };
  }, [room, visibleKey, attempt?.phase]);
  if (!attempt) return null;
  const toggleMedia = async (camera: boolean) => {
    if (!room || mediaBusy || attempt.phase !== "connected") return;
    setMediaBusy(true);
    try {
      if (camera)
        await room.localParticipant.setCameraEnabled(
          !room.localParticipant.isCameraEnabled,
        );
      else
        await room.localParticipant.setMicrophoneEnabled(
          !room.localParticipant.isMicrophoneEnabled,
        );
      if (session.current !== attempt || session.current.room !== room) {
        room.localParticipant.trackPublications.forEach((p) => p.track?.stop());
        await room.disconnect();
      }
    } catch {
      feedbackToast({ msg: t("calls.deviceFailed") });
    } finally {
      setMediaBusy(false);
      redraw();
    }
  };
  const controls = (
    <>
      {attempt.phase === "incoming" && (
        <button type="button" onClick={() => void session.accept()}>
          {t("calls.accept")}
        </button>
      )}
      {attempt.phase === "disconnected" && (
        <button type="button" onClick={() => void session.retry()}>
          {t("calls.rejoin")}
        </button>
      )}
      {attempt.phase === "connected" && (
        <>
          <button
            type="button"
            disabled={mediaBusy}
            title={t("calls.microphone")}
            aria-label={t("calls.microphone")}
            aria-pressed={room?.localParticipant.isMicrophoneEnabled}
            onClick={() => void toggleMedia(false)}
          >
            {room?.localParticipant.isMicrophoneEnabled ? (
              <Mic size={18} />
            ) : (
              <MicOff size={18} />
            )}
          </button>
          <button
            type="button"
            disabled={mediaBusy}
            title={t("calls.camera")}
            aria-label={t("calls.camera")}
            aria-pressed={room?.localParticipant.isCameraEnabled}
            onClick={() => void toggleMedia(true)}
          >
            {room?.localParticipant.isCameraEnabled ? (
              <Video size={18} />
            ) : (
              <VideoOff size={18} />
            )}
          </button>
        </>
      )}
      {room && !room.canPlaybackAudio && (
        <button
          type="button"
          aria-label={t("calls.playAudio")}
          onClick={() =>
            void room
              .startAudio()
              .catch(() => feedbackToast({ msg: t("calls.failed") }))
          }
        >
          <Volume2 size={18} />
          {t("calls.playAudio")}
        </button>
      )}
      <button
        type="button"
        className="call-leave"
        aria-label={t("calls.leave")}
        onClick={() => void session.leave()}
      >
        <PhoneOff size={18} />
        {t(attempt.phase === "incoming" ? "calls.reject" : "calls.leave")}
      </button>
    </>
  );
  const showDialog =
    expanded || attempt.phase === "incoming" || attempt.phase === "outgoing";
  return (
    <>
      <div className="call-dock" role="region" aria-label={t("calls.current")}>
        <Phone size={18} />
        <div className="call-dock-title">
          <strong>{name}</strong>
          <span>
            {t(`calls.phase.${attempt.phase}`)}
            {participants.length > 0 && ` · ${participants.length}`}
          </span>
        </div>
        <div className="call-actions">
          {controls}
          <button
            type="button"
            aria-label={t("calls.expand")}
            onClick={() => setExpanded(true)}
          >
            <Maximize2 size={18} />
          </button>
        </div>
      </div>
      <Modal
        open={showDialog}
        title={name}
        mask={false}
        footer={null}
        onCancel={() => setExpanded(false)}
        closable={!["incoming", "outgoing"].includes(attempt.phase)}
        width={760}
        destroyOnClose
        className="call-modal"
        wrapClassName="call-modal-wrap"
      >
        <p aria-live="polite">{t(`calls.phase.${attempt.phase}`)}</p>
        {room && (
          <RoomContext.Provider value={room}>
            <div className="call-grid">
              {visible.map((participant) => {
                const publication = participant.getTrackPublication(
                  Track.Source.Camera,
                );
                return (
                  <div className="call-tile" key={participant.identity}>
                    {publication?.track && !publication.isMuted ? (
                      <ParticipantVideo track={publication.track} />
                    ) : (
                      <OIMAvatar
                        size={64}
                        text={participant.name || participant.identity}
                      />
                    )}
                    <span>
                      {participant.name || participant.identity}
                      {!participant.isMicrophoneEnabled && <MicOff size={14} />}
                    </span>
                  </div>
                );
              })}
            </div>
          </RoomContext.Provider>
        )}
        {pages > 1 && (
          <div className="call-pagination">
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              {t("calls.previous")}
            </button>
            <span>
              {currentPage + 1} / {pages}
            </span>
            <button
              disabled={currentPage === pages - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              {t("calls.next")}
            </button>
          </div>
        )}
        <div className="call-actions">{controls}</div>
      </Modal>
    </>
  );
}

function ParticipantVideo({ track }: { track: Track }) {
  const element = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = element.current;
    if (!video) return;
    track.attach(video);
    return () => {
      track.detach(video);
    };
  }, [track]);
  return <video ref={element} autoPlay playsInline muted />;
}

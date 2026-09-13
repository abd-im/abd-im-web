import { SessionType } from "@abd-im/wasm-client-sdk";
import {
  createLocalTracks,
  DisconnectReason,
  LocalTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { v4 as uuid } from "uuid";

import { beginDesktopTask, canStartDesktopTask } from "@/utils/desktopTasks";

import type { Call, CallApi, CallTarget } from "./api";

const waitingForPeer = (call: Call) =>
  call.target.type === SessionType.Single && call.participantCount < 2;
const sameTarget = (a: CallTarget, b: CallTarget) => a.type === b.type && a.id === b.id;
const directCallAnswerTimeout = 60_000;
const terminalDisconnectReasons = new Set([
  DisconnectReason.DUPLICATE_IDENTITY,
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.ROOM_DELETED,
  DisconnectReason.ROOM_CLOSED,
]);

export type CallPhase =
  | "checking"
  | "incoming"
  | "outgoing"
  | "connecting"
  | "connected"
  | "disconnected";
export interface CallAttempt {
  id: string;
  target: CallTarget;
  call?: Call;
  phase: CallPhase;
  tracks: LocalTrack[];
  room?: Room;
  accepting?: boolean;
  authorized?: boolean;
  outgoing?: boolean;
  startRequested?: boolean;
  answerTimer?: ReturnType<typeof setTimeout>;
  releaseTask: () => void;
}
interface Dependencies {
  capture: () => Promise<LocalTrack[]>;
  room: () => Room;
}

// The provider owns exactly one session. UI mounting and routing never own media.
export class CallSession {
  current?: CallAttempt;
  private disposed = false;
  constructor(
    readonly userID: string,
    readonly api: CallApi,
    private changed: () => void,
    private failure: (error: unknown) => void,
    private dependencies: Dependencies = {
      capture: () => createLocalTracks({ audio: true, video: false }),
      room: () => new Room(),
    },
  ) {}

  private active(attempt: CallAttempt) {
    return !this.disposed && this.current === attempt;
  }
  private reserve(target: CallTarget, phase: CallPhase) {
    if (this.disposed || this.current || !canStartDesktopTask())
      throw new Error("callBusy");
    const attempt: CallAttempt = {
      id: uuid(),
      target,
      phase,
      tracks: [],
      releaseTask: beginDesktopTask(),
    };
    this.current = attempt;
    this.changed();
    return attempt;
  }
  private async capture(attempt: CallAttempt) {
    const tracks = await this.dependencies.capture();
    if (!this.active(attempt)) {
      tracks.forEach((track) => track.stop());
      return false;
    }
    attempt.tracks = tracks;
    return true;
  }
  private release(attempt: CallAttempt) {
    clearTimeout(attempt.answerTimer);
    const room = attempt.room;
    attempt.room = undefined;
    room?.removeAllListeners();
    void room?.disconnect().catch(() => undefined);
    attempt.tracks.forEach((track) => track.stop());
    attempt.tracks = [];
    attempt.releaseTask();
    if (this.current === attempt) {
      this.current = undefined;
      this.changed();
    }
  }
  private async endRemote(target: CallTarget) {
    const current = this.current;
    if (current && sameTarget(current.target, target)) return;

    for (let retry = 0; retry < 2; retry++) {
      try {
        await this.api.leave(target);
        return;
      } catch (error) {
        if (retry === 1 && !this.disposed) this.failure(error);
      }
    }
  }
  async start(target: CallTarget) {
    let attempt: CallAttempt | undefined;
    try {
      attempt = this.reserve(target, "checking");
      attempt.outgoing = target.type === SessionType.Single;
      if (!(await this.capture(attempt))) return;
      let result;
      attempt.startRequested = true;
      try {
        result = await this.api.start(target);
      } catch (error) {
        if ((error as { errCode?: number })?.errCode !== undefined) {
          attempt.startRequested = false;
          throw error;
        }
        result = await this.api.start(target);
      }
      const { call } = result;
      if (!this.active(attempt)) {
        if (call.target.type === SessionType.Single) await this.endRemote(call.target);
        return;
      }
      attempt.call = call;
      if (attempt.outgoing)
        attempt.answerTimer = setTimeout(() => {
          if (this.active(attempt)) void this.leave();
        }, directCallAnswerTimeout);
      await this.connect(attempt);
    } catch (error) {
      if (!attempt) this.failure(error);
      else if (this.active(attempt)) {
        this.failure(error);
        await this.leave();
      } else if (attempt.startRequested && target.type === SessionType.Single) {
        await this.endRemote(target);
      }
    }
  }
  async incoming(call: Call) {
    if (this.disposed || !waitingForPeer(call)) return;
    if (this.current && sameTarget(this.current.target, call.target)) return;
    if (this.current || !canStartDesktopTask()) {
      await this.endRemote(call.target);
      return;
    }
    const attempt = this.reserve(call.target, "incoming");
    attempt.call = call;
    this.changed();
  }
  async join(call: Call) {
    let attempt: CallAttempt | undefined;
    try {
      attempt = this.reserve(call.target, "checking");
      attempt.call = call;
      if (!(await this.capture(attempt))) return;
      await this.connect(attempt);
    } catch (error) {
      if (!attempt) this.failure(error);
      else if (this.active(attempt)) {
        this.failure(error);
        await this.leave();
      }
    }
  }
  async accept() {
    const attempt = this.current;
    if (!attempt?.call || attempt.phase !== "incoming") return;
    attempt.phase = "checking";
    this.changed();
    try {
      if (!(await this.capture(attempt))) return;
      await this.connect(attempt);
    } catch (error) {
      if (this.active(attempt)) {
        this.failure(error);
        await this.leave();
      }
    }
  }
  private async connect(attempt: CallAttempt) {
    if (!attempt.call || !this.active(attempt) || attempt.accepting) return;
    const call = attempt.call;
    attempt.accepting = true;
    attempt.phase = "connecting";
    this.changed();
    const { auth } = await this.api.join(call.target);
    if (!this.active(attempt)) {
      await this.endRemote(call.target);
      return;
    }
    attempt.authorized = true;
    const room = this.dependencies.room();
    attempt.room = room;
    this.changed();
    const tracks = attempt.tracks;
    const ownsRoom = () => this.active(attempt) && attempt.room === room;
    room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      if (!ownsRoom()) return;
      if (reason !== undefined && terminalDisconnectReasons.has(reason)) {
        this.release(attempt);
        return;
      }
      attempt.tracks.forEach((track) => track.stop());
      attempt.tracks = [];
      attempt.phase = "disconnected";
      attempt.accepting = false;
      this.changed();
    });
    room.on(RoomEvent.ParticipantConnected, () => {
      if (!ownsRoom() || attempt.phase !== "outgoing") return;
      clearTimeout(attempt.answerTimer);
      attempt.phase = "connected";
      this.changed();
    });
    try {
      await room.connect(auth.serverUrl, auth.token, { autoSubscribe: false });
      if (!ownsRoom()) {
        await room.disconnect();
        return;
      }
      for (const track of tracks) {
        if (!ownsRoom()) {
          track.stop();
          continue;
        }
        await room.localParticipant.publishTrack(track);
      }
      if (!ownsRoom()) {
        await room.disconnect();
        return;
      }
      if (!room.localParticipant.isMicrophoneEnabled)
        throw new Error("microphonePublishFailed");
      attempt.phase =
        attempt.outgoing && room.remoteParticipants.size === 0
          ? "outgoing"
          : "connected";
      if (attempt.phase === "connected") clearTimeout(attempt.answerTimer);
      attempt.accepting = false;
      this.changed();
    } catch (error) {
      tracks.forEach((track) => track.stop());
      await room.disconnect();
      if (ownsRoom()) {
        attempt.tracks = [];
        throw error;
      }
    }
  }

  reconcile(call: Call | null) {
    const attempt = this.current;
    if (!attempt?.call) return;
    if (!call) {
      // Empty group summaries also occur during initial connection/reconnection.
      if (
        attempt.target.type === SessionType.Single ||
        (attempt.phase !== "checking" && attempt.phase !== "connecting")
      )
        this.release(attempt);
      return;
    }
    if (attempt.phase === "incoming" && !waitingForPeer(call)) {
      this.release(attempt); // Accepted on another device; do not compete for media.
      return;
    }
    attempt.call = call;
    if (attempt.phase === "outgoing" && !waitingForPeer(call)) {
      clearTimeout(attempt.answerTimer);
      attempt.phase = "connected";
    }
    this.changed();
  }
  async retry() {
    const attempt = this.current;
    if (!attempt?.call || attempt.phase !== "disconnected") return;
    attempt.phase = "checking";
    this.changed();
    try {
      attempt.room?.removeAllListeners();
      await attempt.room?.disconnect();
      attempt.room = undefined;
      if (!(await this.capture(attempt))) return;
      await this.connect(attempt);
    } catch (error) {
      if (this.active(attempt)) {
        attempt.phase = "disconnected";
        this.changed();
        this.failure(error);
      }
    }
  }
  async leave() {
    const attempt = this.current;
    if (!attempt) return;
    const cleanRemote = attempt.call !== undefined || attempt.startRequested;
    const target = attempt.target;
    this.release(attempt);
    if (cleanRemote) await this.endRemote(target);
  }
  dispose() {
    this.disposed = true;
    void this.leave();
  }
}

export function updateSubscriptions(
  room: Room,
  visibleIdentities: ReadonlySet<string>,
) {
  room.remoteParticipants.forEach((participant) => {
    participant.trackPublications.forEach((publication) => {
      const wanted =
        publication.kind === Track.Kind.Audio ||
        visibleIdentities.has(participant.identity);
      if (publication.isSubscribed !== wanted) publication.setSubscribed(wanted);
    });
  });
}

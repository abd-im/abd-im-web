import { SessionType } from "@abd-im/wasm-client-sdk";
/* eslint-disable @typescript-eslint/unbound-method -- Assertions inspect mocked methods without invoking them. */
import { DisconnectReason, LocalTrack, Room, RoomEvent, Track } from "livekit-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Call, CallApi } from "./api";
import { CallSession, updateSubscriptions } from "./session";

const activeCall = (overrides: Partial<Call> = {}): Call => ({
  target: { type: SessionType.Group, id: "g" },
  participantCount: 0,
  ...overrides,
});
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const sessions: CallSession[] = [];
afterEach(() => {
  sessions.splice(0).forEach((s) => s.dispose());
  vi.useRealTimers();
});
function setup(call = activeCall()) {
  const track = { stop: vi.fn(), kind: Track.Kind.Audio } as unknown as LocalTrack;
  const events = new Map<string, (reason?: DisconnectReason) => void>();
  const room = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    removeAllListeners: vi.fn(),
    on: vi.fn((event: string, fn: (reason?: DisconnectReason) => void) =>
      events.set(event, fn),
    ),
    remoteParticipants: new Map(),
    localParticipant: {
      isMicrophoneEnabled: true,
      publishTrack: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Room;
  const api = {
    start: vi.fn().mockResolvedValue({ call }),
    join: vi.fn().mockResolvedValue({
      auth: { serverUrl: "wss://media", token: "ephemeral" },
    }),
    leave: vi.fn().mockResolvedValue({}),
    status: vi.fn(),
  } satisfies CallApi;
  const dependencies = {
    capture: vi.fn().mockResolvedValue([track]),
    room: vi.fn(() => room),
  };
  const failure = vi.fn();
  const session = new CallSession("b", api, vi.fn(), failure, dependencies);
  sessions.push(session);
  return { session, api, track, room, events, dependencies, failure };
}
describe("single media lifecycle", () => {
  it("connects the caller immediately and waits for the remote participant", async () => {
    const call = activeCall({
      target: { type: SessionType.Single, id: "a" },
    });
    const s = setup(call);
    await s.session.start(call.target);
    expect(s.api.join).toHaveBeenCalledWith(call.target);
    expect(s.room.connect).toHaveBeenCalled();
    expect(s.session.current?.phase).toBe("outgoing");

    s.events.get(RoomEvent.ParticipantConnected)?.();
    expect(s.session.current?.phase).toBe("connected");
  });
  it("releases a late device result after cancellation and never requests a token", async () => {
    const s = setup();
    const capture = deferred<LocalTrack[]>();
    s.dependencies.capture.mockReturnValue(capture.promise);
    const pending = s.session.start({ type: SessionType.Group, id: "g" });
    await s.session.leave();
    capture.resolve([s.track]);
    await pending;
    expect(s.track.stop).toHaveBeenCalled();
    expect(s.api.start).not.toHaveBeenCalled();
    expect(s.api.join).not.toHaveBeenCalled();
  });
  it("rejects a ringing call when credentials arrive after cancellation", async () => {
    const ringing = activeCall({
      target: { type: SessionType.Single, id: "a" },
      participantCount: 1,
    });
    const s = setup(ringing);
    const join = deferred<Awaited<ReturnType<CallApi["join"]>>>();
    s.api.join.mockReturnValue(join.promise);
    await s.session.incoming(ringing);
    const pending = s.session.accept();
    await vi.waitFor(() => expect(s.api.join).toHaveBeenCalled());
    await s.session.leave();
    join.resolve({
      auth: { serverUrl: "wss://media", token: "late" },
    });
    await pending;
    expect(s.dependencies.room).not.toHaveBeenCalled();
    expect(s.api.leave).toHaveBeenCalledWith(ringing.target);
    expect(s.track.stop).toHaveBeenCalled();
  });
  it("disconnects a connection that resolves after leaving", async () => {
    const s = setup();
    const connect = deferred<void>();
    vi.mocked(s.room.connect).mockReturnValue(connect.promise);
    const pending = s.session.join(activeCall());
    await vi.waitFor(() => expect(s.room.connect).toHaveBeenCalled());
    await s.session.leave();
    connect.resolve();
    await pending;
    expect(s.room.localParticipant.publishTrack).not.toHaveBeenCalled();
    expect(s.room.disconnect).toHaveBeenCalled();
    expect(s.session.current).toBeUndefined();
  });
  it("does not request devices or credentials for an incoming invitation", async () => {
    const ringing = activeCall({
      target: { type: SessionType.Single, id: "a" },
      participantCount: 1,
    });
    const s = setup(ringing);
    await s.session.incoming(ringing);
    expect(s.session.current?.phase).toBe("incoming");
    expect(s.dependencies.capture).not.toHaveBeenCalled();
    expect(s.api.join).not.toHaveBeenCalled();
  });
  it("rejects an incoming direct call while retaining the active group", async () => {
    const s = setup();
    await s.session.join(activeCall());
    const room = s.session.current?.room;
    await s.session.incoming(
      activeCall({
        target: { type: SessionType.Single, id: "a" },
        participantCount: 1,
      }),
    );
    expect(s.api.leave).toHaveBeenCalledWith({ type: SessionType.Single, id: "a" });
    expect(s.session.current?.room).toBe(room);
  });
  it("retries an uncertain start for the same conversation", async () => {
    const s = setup();
    s.api.start.mockRejectedValueOnce(new Error("network"));
    await s.session.start({ type: SessionType.Group, id: "g" });
    expect(s.api.start).toHaveBeenCalledTimes(2);
    expect(s.api.start.mock.calls[0]).toEqual(s.api.start.mock.calls[1]);
  });
  it("cleans up a direct call when both start responses are uncertain", async () => {
    const call = activeCall({ target: { type: SessionType.Single, id: "a" } });
    const s = setup(call);
    s.api.start.mockRejectedValue(new Error("network"));
    await s.session.start(call.target);
    expect(s.api.start).toHaveBeenCalledTimes(2);
    expect(s.api.leave).toHaveBeenCalledWith(call.target);
    expect(s.session.current).toBeUndefined();
  });
  it("does not clean up a start explicitly rejected by the backend", async () => {
    const call = activeCall({ target: { type: SessionType.Single, id: "a" } });
    const s = setup(call);
    s.api.start.mockRejectedValue({ errCode: 20012 });
    await s.session.start(call.target);
    expect(s.api.start).toHaveBeenCalledTimes(1);
    expect(s.api.leave).not.toHaveBeenCalled();
  });
  it("ends an unanswered direct call after one minute", async () => {
    vi.useFakeTimers();
    const call = activeCall({ target: { type: SessionType.Single, id: "a" } });
    const s = setup(call);
    await s.session.start(call.target);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.api.leave).toHaveBeenCalledWith(call.target);
    expect(s.session.current).toBeUndefined();
  });
  it("does not auto-rejoin after a terminal disconnect", async () => {
    const s = setup();
    await s.session.join(activeCall());
    s.events.get(RoomEvent.Disconnected)?.();
    expect(s.session.current?.phase).toBe("disconnected");
    expect(s.api.join).toHaveBeenCalledTimes(1);
    await s.session.retry();
    expect(s.api.join).toHaveBeenCalledTimes(2);
    expect(s.api.start).not.toHaveBeenCalled();
  });
  it("releases a call removed by LiveKit instead of offering rejoin", async () => {
    const s = setup();
    await s.session.join(activeCall());
    s.events.get(RoomEvent.Disconnected)?.(DisconnectReason.PARTICIPANT_REMOVED);
    expect(s.session.current).toBeUndefined();
    expect(s.api.leave).not.toHaveBeenCalled();
  });
  it("does not advertise connected when microphone publication failed", async () => {
    const s = setup();
    vi.mocked(s.room.localParticipant.publishTrack).mockRejectedValue(
      new Error("microphone failed"),
    );
    await s.session.join(activeCall());
    expect(s.failure).toHaveBeenCalled();
    expect(s.session.current).toBeUndefined();
    expect(s.track.stop).toHaveBeenCalled();
  });
  it("a late connection cannot publish into or replace an explicit rejoin", async () => {
    const s = setup(),
      replacement = setup();
    const first = deferred<void>();
    vi.mocked(s.room.connect).mockReturnValue(first.promise);
    const pending = s.session.join(activeCall());
    await vi.waitFor(() => expect(s.room.connect).toHaveBeenCalled());
    s.events.get(RoomEvent.Disconnected)?.();
    s.dependencies.room.mockReturnValue(replacement.room);
    s.dependencies.capture.mockResolvedValue([replacement.track]);
    await s.session.retry();
    first.resolve();
    await pending;
    expect(s.room.localParticipant.publishTrack).not.toHaveBeenCalled();
    expect(s.session.current?.room).toBe(replacement.room);
    expect(s.session.current?.phase).toBe("connected");
  });
  it("dismisses a pending invitation accepted on another device without hanging up", async () => {
    const ringing = activeCall({
      target: { type: SessionType.Single, id: "a" },
      participantCount: 1,
    });
    const s = setup(ringing);
    await s.session.incoming(ringing);
    s.session.reconcile({ ...ringing, participantCount: 2 });
    expect(s.session.current).toBeUndefined();
    expect(s.api.join).not.toHaveBeenCalled();
    expect(s.api.leave).not.toHaveBeenCalled();
  });
  it("keeps a group while its initial connection is pending", async () => {
    const s = setup();
    const join = deferred<Awaited<ReturnType<CallApi["join"]>>>();
    s.api.join.mockReturnValue(join.promise);
    const pending = s.session.join(activeCall());
    await vi.waitFor(() => expect(s.api.join).toHaveBeenCalled());
    s.session.reconcile(null);
    expect(s.session.current?.phase).toBe("connecting");
    join.resolve({ auth: { serverUrl: "wss://media", token: "ephemeral" } });
    await pending;
  });
  it("releases a connected group after its room ends", async () => {
    const s = setup();
    await s.session.join(activeCall());
    s.session.reconcile(null);
    expect(s.session.current).toBeUndefined();
  });
});
it("keeps every remote audio subscription when the video page changes", () => {
  const audio = { kind: Track.Kind.Audio, isSubscribed: false, setSubscribed: vi.fn() };
  const camera = { kind: Track.Kind.Video, isSubscribed: true, setSubscribed: vi.fn() };
  const room = {
    remoteParticipants: new Map([
      [
        "off-page",
        {
          identity: "off-page",
          trackPublications: new Map([
            ["mic", audio],
            ["camera", camera],
          ]),
        },
      ],
    ]),
  } as unknown as Room;
  updateSubscriptions(room, new Set(["on-page"]));
  expect(audio.setSubscribed).toHaveBeenCalledWith(true);
  expect(camera.setSubscribed).toHaveBeenCalledWith(false);
});

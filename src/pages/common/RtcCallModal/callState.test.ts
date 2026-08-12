import { describe, expect, it } from "vitest";

import { callReducer, initialCallState } from "./callState";

const authData = { serverUrl: "ws://livekit.test", token: "token" };

describe("callReducer", () => {
  it("keeps an incoming invitation ringing until the user explicitly accepts", () => {
    const ringing = callReducer(initialCallState, {
      type: "open",
      roomID: "room-1",
      isReceiver: true,
    });

    expect(ringing.phase).toBe("ringing");
    expect(ringing.authData.token).toBe("");

    const ignoredRemoteAccept = callReducer(ringing, {
      type: "remoteAccept",
      roomID: "room-1",
      authData,
    });
    expect(ignoredRemoteAccept).toBe(ringing);

    expect(
      callReducer(ringing, {
        type: "localAccept",
        roomID: "room-1",
        authData,
      }).phase,
    ).toBe("connecting");
  });

  it("only lets an outgoing call connect after the matching remote accept", () => {
    const outgoing = callReducer(initialCallState, {
      type: "open",
      roomID: "room-2",
      isReceiver: false,
    });

    expect(
      callReducer(outgoing, {
        type: "localAccept",
        roomID: "room-2",
        authData,
      }),
    ).toBe(outgoing);
    expect(
      callReducer(outgoing, {
        type: "remoteAccept",
        roomID: "room-2",
        authData,
      }).phase,
    ).toBe("connecting");
  });

  it("ignores stale events from a previous room", () => {
    const newCall = callReducer(
      callReducer(initialCallState, {
        type: "open",
        roomID: "old-room",
        isReceiver: false,
      }),
      { type: "open", roomID: "new-room", isReceiver: true },
    );

    const afterStaleAccept = callReducer(newCall, {
      type: "remoteAccept",
      roomID: "old-room",
      authData,
    });
    const afterStaleReset = callReducer(afterStaleAccept, {
      type: "reset",
      roomID: "old-room",
    });

    expect(afterStaleReset).toBe(newCall);
    expect(afterStaleReset.phase).toBe("ringing");
    expect(afterStaleReset.authData.token).toBe("");
  });

  it("does not carry accepted state into the next incoming call", () => {
    const ringing = callReducer(initialCallState, {
      type: "open",
      roomID: "room-3",
      isReceiver: true,
    });
    const connecting = callReducer(ringing, {
      type: "localAccept",
      roomID: "room-3",
      authData,
    });
    const closed = callReducer(connecting, { type: "reset", roomID: "room-3" });
    const nextCall = callReducer(closed, {
      type: "open",
      roomID: "room-4",
      isReceiver: true,
    });

    expect(nextCall).toEqual({
      authData: { serverUrl: "", token: "" },
      phase: "ringing",
      roomID: "room-4",
    });
  });

  it("treats duplicate accepts as idempotent", () => {
    const outgoing = callReducer(initialCallState, {
      type: "open",
      roomID: "room-5",
      isReceiver: false,
    });
    const connecting = callReducer(outgoing, {
      type: "remoteAccept",
      roomID: "room-5",
      authData,
    });

    expect(
      callReducer(connecting, {
        type: "remoteAccept",
        roomID: "room-5",
        authData: { serverUrl: "other", token: "other" },
      }),
    ).toBe(connecting);
  });
});

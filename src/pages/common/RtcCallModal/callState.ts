import { AuthData } from "./data";

export type CallPhase = "idle" | "ringing" | "outgoing" | "connecting" | "connected";

export interface CallState {
  authData: AuthData;
  phase: CallPhase;
  roomID: string;
}

export type CallAction =
  | { type: "open"; roomID: string; isReceiver: boolean }
  | { type: "localAccept"; roomID: string; authData: AuthData }
  | { type: "remoteAccept"; roomID: string; authData: AuthData }
  | { type: "connected"; roomID: string }
  | { type: "reset"; roomID?: string };

const emptyAuthData: AuthData = { serverUrl: "", token: "" };

export const initialCallState: CallState = {
  authData: emptyAuthData,
  phase: "idle",
  roomID: "",
};

export const callReducer = (state: CallState, action: CallAction): CallState => {
  if (action.type === "open") {
    return {
      authData: emptyAuthData,
      phase: action.isReceiver ? "ringing" : "outgoing",
      roomID: action.roomID,
    };
  }

  if (action.type === "reset") {
    if (action.roomID && state.roomID !== action.roomID) return state;
    return initialCallState;
  }

  if (state.roomID !== action.roomID) return state;

  if (action.type === "localAccept") {
    if (state.phase !== "ringing") return state;
    return { ...state, authData: action.authData, phase: "connecting" };
  }

  if (action.type === "remoteAccept") {
    if (state.phase !== "outgoing") return state;
    return { ...state, authData: action.authData, phase: "connecting" };
  }

  if (action.type === "connected" && state.phase === "connecting") {
    return { ...state, phase: "connected" };
  }

  return state;
};

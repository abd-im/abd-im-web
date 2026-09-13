import { SessionType } from "@abd-im/wasm-client-sdk";
import { v4 as uuid } from "uuid";

import { RUNTIME_CHAT_URL } from "@/config";
import createAxiosInstance from "@/utils/request";
import { getChatToken } from "@/utils/storage";

export type CallTarget = { type: SessionType.Single | SessionType.Group; id: string };
export interface Call {
  target: CallTarget;
  participantCount: number;
}
export type StatusItem =
  | { target: CallTarget; call: Call | null; error?: never }
  | { target: CallTarget; error: { errCode: number; errMsg: string }; call?: never };
export const targetKey = (target: CallTarget) => `${target.type}:${target.id}`;

// Bind requests to this login, including cleanup of a late result after logout.
// Media credentials are returned only to the active in-memory session.
export function createCallApi() {
  const token = getChatToken();
  const request = createAxiosInstance(RUNTIME_CHAT_URL);
  const post = async <T>(path: string, body: unknown) => {
    const response = await request.post<T>(`/user/rtc/${path}`, body, {
      headers: { token: String((await token) ?? ""), operationID: uuid() },
    });
    return response.data;
  };
  return {
    start: (target: CallTarget) => post<{ call: Call }>("start", { target }),
    join: (target: CallTarget) =>
      post<{ auth: { serverUrl: string; token: string } }>("join", {
        target,
      }),
    leave: (target: CallTarget) => post<Record<string, never>>("leave", { target }),
    status: (targets: CallTarget[]) =>
      post<{ items: StatusItem[] }>("status_batch", { targets }),
  };
}
export type CallApi = ReturnType<typeof createCallApi>;

export async function loadCallStatus(
  status: CallApi["status"],
  target: CallTarget,
): Promise<Call | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { items } = await status([target]);
      return items[0]?.call ?? null;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  return null;
}

function object(value: unknown): Record<string, unknown> | null {
  const decoded: unknown = typeof value === "string" ? JSON.parse(value) : value;
  return decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)
    ? (decoded as Record<string, unknown>)
    : null;
}

export function parseCallEvent(
  value: unknown,
): { key: "call.invited" | "call.changed"; target: CallTarget } | null {
  try {
    const envelope = object(value);
    if (
      !envelope ||
      (envelope.key !== "call.invited" && envelope.key !== "call.changed")
    )
      return null;
    const data = object(envelope.data),
      target = object(data?.target);
    if (
      !data ||
      !target ||
      (target.type !== SessionType.Group && target.type !== SessionType.Single) ||
      typeof target.id !== "string" ||
      !target.id
    )
      return null;
    if (envelope.key === "call.invited" && target.type !== SessionType.Single)
      return null;
    return {
      key: envelope.key,
      target: { type: target.type, id: target.id },
    };
  } catch {
    return null;
  }
}

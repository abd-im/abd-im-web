import { SessionType } from "@abd-im/wasm-client-sdk";
import { expect, it, vi } from "vitest";
vi.mock("@/utils/request", () => ({ default: vi.fn() }));
vi.mock("@/utils/storage", () => ({ getChatToken: vi.fn() }));
vi.mock("@/config", () => ({ RUNTIME_CHAT_URL: "" }));
import { loadCallStatus, parseCallEvent } from "./api";
it("accepts the SDK's string and object business envelopes", () => {
  const data = { target: { type: SessionType.Group, id: "g" } };
  expect(
    parseCallEvent({ key: "call.changed", data: JSON.stringify(data) })?.target.id,
  ).toBe("g");
  expect(
    parseCallEvent(JSON.stringify({ key: "call.changed", data }))?.target.type,
  ).toBe(SessionType.Group);
});
it("isolates corrupt notifications and never turns a group update into an invitation", () => {
  for (const value of [
    "{",
    null,
    {},
    { key: "call.changed", data: "broken" },
    {
      key: "call.changed",
      data: { target: { type: SessionType.Notification, id: "g" } },
    },
    {
      key: "call.changed",
      data: { target: { type: "group", id: "g" } },
    },
    {
      key: "call.invited",
      data: { target: { type: SessionType.Group, id: "g" } },
    },
  ])
    expect(parseCallEvent(value)).toBeNull();
});
it("retries an invitation status request once", async () => {
  const target = { type: SessionType.Single, id: "a" } as const;
  const status = vi
    .fn()
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValue({ items: [{ target, call: { target, participantCount: 1 } }] });
  await expect(loadCallStatus(status, target)).resolves.toEqual({
    target,
    participantCount: 1,
  });
  expect(status).toHaveBeenCalledTimes(2);
});

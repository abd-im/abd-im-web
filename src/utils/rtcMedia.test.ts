import { describe, expect, it } from "vitest";
import { getRtcDeviceFailure } from "./rtcMedia";

describe("getRtcDeviceFailure", () => {
  it.each([
    ["PermissionDenied", "permissionDenied"],
    ["NotAllowedError", "permissionDenied"],
    ["PermissionDeniedError", "permissionDenied"],
    ["NotFound", "notFound"],
    ["NotFoundError", "notFound"],
    ["DevicesNotFoundError", "notFound"],
    ["DeviceInUse", "deviceInUse"],
    ["NotReadableError", "deviceInUse"],
    ["TrackStartError", "deviceInUse"],
    ["Other", "other"],
  ])("maps %s to a specific device failure", (failure, expected) => {
    expect(getRtcDeviceFailure(failure)).toBe(expected);
  });
});

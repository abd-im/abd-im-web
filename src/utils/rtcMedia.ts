export const checkRtcMediaAccess = async (mediaType: string) => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Media devices are unavailable in this browser context");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: mediaType === "video",
  });
  stream.getTracks().forEach((track) => track.stop());
};

export type RtcDeviceFailure =
  | "permissionDenied"
  | "notFound"
  | "deviceInUse"
  | "other";

export const getRtcDeviceFailure = (error: unknown): RtcDeviceFailure => {
  const failure =
    typeof error === "string" ? error : error instanceof Error ? error.name : "";

  if (
    failure === "PermissionDenied" ||
    failure === "NotAllowedError" ||
    failure === "PermissionDeniedError"
  ) {
    return "permissionDenied";
  }
  if (
    failure === "NotFound" ||
    failure === "NotFoundError" ||
    failure === "DevicesNotFoundError"
  ) {
    return "notFound";
  }
  if (
    failure === "DeviceInUse" ||
    failure === "NotReadableError" ||
    failure === "TrackStartError"
  ) {
    return "deviceInUse";
  }
  return "other";
};

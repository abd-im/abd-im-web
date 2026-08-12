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

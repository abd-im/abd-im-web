import { MessageItem } from "@abd-im/wasm-client-sdk";
import { v4 as uuidV4 } from "uuid";

import { IMSDK } from "@/layout/MainContentWrap";

import { registerMessageRetry } from "../messageRetry";

export interface FileWithPath extends File {
  path?: string;
}

export function useFileMessage() {
  const getImageMessage = async (file: FileWithPath): Promise<MessageItem> => {
    const { width, height } = await getPicInfo(file);
    const blobUrl = URL.createObjectURL(file);
    const baseInfo = {
      uuid: uuidV4(),
      type: file.type,
      size: file.size,
      width,
      height,
      url: blobUrl,
    };

    const options = {
      sourcePicture: baseInfo,
      bigPicture: baseInfo,
      snapshotPicture: baseInfo,
      sourcePath: "",
      file,
    };

    const message = (await IMSDK.createImageMessageByFile(options)).data;
    if (message.pictureElem) {
      message.pictureElem.sourcePicture = { ...baseInfo };
      message.pictureElem.bigPicture = { ...baseInfo };
      message.pictureElem.snapshotPicture = { ...baseInfo };
    }
    registerMessageRetry(message.clientMsgID, () => getImageMessage(file));
    return message;
  };

  const getVideoMessage = async (file: FileWithPath): Promise<MessageItem> => {
    const { duration, snapshotFile, width, height } = await getVideoInfo(file);
    const videoUrl = URL.createObjectURL(file);
    const snapshotUrl = URL.createObjectURL(snapshotFile);
    const options = {
      videoPath: "",
      videoFile: file,
      videoType: file.type || "video/mp4",
      duration,
      videoSize: file.size,
      videoUUID: uuidV4(),
      videoUrl,
      snapshotPath: "",
      snapshotFile,
      snapshotUUID: uuidV4(),
      snapshotSize: snapshotFile.size,
      snapshotUrl,
      snapshotWidth: width,
      snapshotHeight: height,
      snapShotType: snapshotFile.type,
    };
    const message = (await IMSDK.createVideoMessageByFile(options)).data;
    if (message.videoElem) {
      Object.assign(message.videoElem, {
        videoUrl,
        videoSize: file.size,
        duration,
        snapshotUrl,
        snapshotSize: snapshotFile.size,
        snapshotWidth: width,
        snapshotHeight: height,
      });
    }
    registerMessageRetry(message.clientMsgID, () => getVideoMessage(file));
    return message;
  };

  const getFileMessage = async (file: FileWithPath): Promise<MessageItem> => {
    const options = {
      file,
      filePath: file.path || "",
      fileName: file.name,
      uuid: uuidV4(),
      sourceUrl: URL.createObjectURL(file),
      fileSize: file.size,
      fileType: file.type,
    };
    const message = (await IMSDK.createFileMessageByFile(options)).data;
    if (message.fileElem) {
      Object.assign(message.fileElem, {
        sourceUrl: options.sourceUrl,
        fileName: file.name,
        fileSize: file.size,
      });
    }
    registerMessageRetry(message.clientMsgID, () => getFileMessage(file));
    return message;
  };

  const recreateFileBackedMessage = async (message: MessageItem) => {
    let sourceUrl = "";
    let fileName = "attachment";
    let createMessage: (file: File) => Promise<MessageItem>;

    if (message.pictureElem) {
      const source = message.pictureElem.sourcePicture;
      sourceUrl = source.url;
      fileName = `image.${source.type.split("/")[1] || "png"}`;
      createMessage = getImageMessage;
    } else if (message.videoElem) {
      sourceUrl = message.videoElem.videoUrl || message.videoElem.videoPath;
      fileName = `video.${message.videoElem.videoType.split("/")[1] || "mp4"}`;
      createMessage = getVideoMessage;
    } else if (message.fileElem) {
      sourceUrl = message.fileElem.sourceUrl || message.fileElem.filePath;
      fileName = message.fileElem.fileName || fileName;
      createMessage = getFileMessage;
    } else {
      return undefined;
    }

    if (!sourceUrl) return undefined;
    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) return undefined;
      const blob = await response.blob();
      return createMessage(new File([blob], fileName, { type: blob.type }));
    } catch {
      return undefined;
    }
  };

  const getPicInfo = (file: File): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const _URL = window.URL || window.webkitURL;
      const img = new Image();
      const objectUrl = _URL.createObjectURL(file);
      img.onload = function () {
        _URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = function () {
        _URL.revokeObjectURL(objectUrl);
        reject(new Error("Unable to read image metadata"));
      };
      img.src = objectUrl;
    });

  const getVideoInfo = (file: File) =>
    new Promise<{
      duration: number;
      snapshotFile: File;
      width: number;
      height: number;
    }>((resolve, reject) => {
      const video = document.createElement("video");
      const objectUrl = URL.createObjectURL(file);
      video.muted = true;
      video.preload = "auto";
      video.playsInline = true;

      const cleanup = () => URL.revokeObjectURL(objectUrl);
      video.onerror = () => {
        cleanup();
        reject(new Error("Unable to read video metadata"));
      };
      video.onloadedmetadata = () => {
        if (
          !Number.isFinite(video.duration) ||
          video.duration <= 0 ||
          video.videoWidth <= 0 ||
          video.videoHeight <= 0
        ) {
          cleanup();
          reject(new Error("Invalid video metadata"));
          return;
        }
        video.currentTime = Math.min(1, video.duration * 0.1);
      };
      video.onseeked = () => {
        const maxSnapshotEdge = 640;
        const scale = Math.min(
          1,
          maxSnapshotEdge / Math.max(video.videoWidth, video.videoHeight),
        );
        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (!blob) {
              reject(new Error("Unable to create video snapshot"));
              return;
            }
            resolve({
              duration: Math.max(1, Math.ceil(video.duration)),
              snapshotFile: new File([blob], `${file.name}.jpg`, {
                type: "image/jpeg",
              }),
              width,
              height,
            });
          },
          "image/jpeg",
          0.82,
        );
      };
      video.src = objectUrl;
    });

  return {
    getImageMessage,
    getVideoMessage,
    getFileMessage,
    recreateFileBackedMessage,
  };
}

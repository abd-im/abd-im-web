import { MessageItem } from "@abd-im/wasm-client-sdk";
import { v4 as uuidV4 } from "uuid";

import { IMSDK } from "@/layout/MainContentWrap";

import { AttachmentType, getAttachmentType } from "../attachmentType";
import { registerMessageRetry } from "../messageRetry";

export interface FileWithPath extends File {
  path?: string;
}

// Keep successful uploads reusable if another part of the draft fails to prepare.
const uploadedAttachments = new WeakMap<
  File,
  Partial<Record<AttachmentType, Promise<MessageItem>>>
>();

export function useFileMessage() {
  const upload = async (file: File) => {
    const uploadID = uuidV4();
    const { data } = await IMSDK.uploadFile({
      name: `${uploadID}/${file.name}`,
      contentType: file.type || "application/octet-stream",
      uuid: uploadID,
      file,
    });
    if (!/^https?:\/\//i.test(data.url))
      throw new Error("Invalid attachment upload URL");
    return data.url;
  };

  // Nested merge parts are not uploaded by sendMessage. Upload them first and
  // create URL-backed messages; never transmit local blob URLs to the recipient.
  const getUploadedAttachmentMessage = (file: File, type: AttachmentType) => {
    const cached = uploadedAttachments.get(file) || {};
    const existing = cached[type];
    if (existing) return existing;
    const pending = getAttachmentMessage(file, type, true).catch((error) => {
      delete cached[type];
      throw error;
    });
    cached[type] = pending;
    uploadedAttachments.set(file, cached);
    return pending;
  };

  const getImageMessage = async (
    file: FileWithPath,
    uploadFirst = false,
  ): Promise<MessageItem> => {
    const { width, height } = await getPicInfo(file);
    const baseInfo = {
      uuid: uuidV4(),
      type: file.type,
      size: file.size,
      width,
      height,
      url: uploadFirst ? await upload(file) : URL.createObjectURL(file),
    };

    const options = {
      sourcePicture: baseInfo,
      bigPicture: baseInfo,
      snapshotPicture: baseInfo,
      sourcePath: "",
    };

    const message = (
      await (uploadFirst
        ? IMSDK.createImageMessageByURL(options)
        : IMSDK.createImageMessageByFile({ ...options, file }))
    ).data;
    if (message.pictureElem) {
      message.pictureElem.sourcePicture = { ...baseInfo };
      message.pictureElem.bigPicture = { ...baseInfo };
      message.pictureElem.snapshotPicture = { ...baseInfo };
    }
    if (!uploadFirst)
      registerMessageRetry(message.clientMsgID, () => getImageMessage(file));
    return message;
  };

  const getVideoMessage = async (
    file: FileWithPath,
    uploadFirst = false,
  ): Promise<MessageItem> => {
    const { duration, snapshotFile, width, height } = await getVideoInfo(file);
    const videoUrl = uploadFirst ? await upload(file) : URL.createObjectURL(file);
    const snapshotUrl = uploadFirst
      ? await upload(snapshotFile)
      : URL.createObjectURL(snapshotFile);
    const options = {
      videoPath: "",
      videoType: file.type || "video/mp4",
      duration,
      videoSize: file.size,
      videoUUID: uuidV4(),
      videoUrl,
      snapshotPath: "",
      snapshotUUID: uuidV4(),
      snapshotSize: snapshotFile.size,
      snapshotUrl,
      snapshotWidth: width,
      snapshotHeight: height,
      snapShotType: snapshotFile.type,
    };
    const message = (
      await (uploadFirst
        ? IMSDK.createVideoMessageByURL(options)
        : IMSDK.createVideoMessageByFile({ ...options, videoFile: file, snapshotFile }))
    ).data;
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
    if (!uploadFirst)
      registerMessageRetry(message.clientMsgID, () => getVideoMessage(file));
    return message;
  };

  const getFileMessage = async (
    file: FileWithPath,
    uploadFirst = false,
  ): Promise<MessageItem> => {
    const options = {
      filePath: uploadFirst ? "" : file.path || "",
      fileName: file.name,
      uuid: uuidV4(),
      sourceUrl: uploadFirst ? await upload(file) : URL.createObjectURL(file),
      fileSize: file.size,
      fileType: file.type,
    };
    const message = (
      await (uploadFirst
        ? IMSDK.createFileMessageByURL(options)
        : IMSDK.createFileMessageByFile({ ...options, file }))
    ).data;
    if (message.fileElem) {
      Object.assign(message.fileElem, {
        sourceUrl: options.sourceUrl,
        fileName: file.name,
        fileSize: file.size,
      });
    }
    if (!uploadFirst)
      registerMessageRetry(message.clientMsgID, () => getFileMessage(file));
    return message;
  };

  const getAttachmentMessage = (
    file: FileWithPath,
    requestedType?: AttachmentType,
    uploadFirst = false,
  ): Promise<MessageItem> => {
    const attachmentType = requestedType ?? getAttachmentType(file);
    if (attachmentType === "image") return getImageMessage(file, uploadFirst);
    if (attachmentType === "video") return getVideoMessage(file, uploadFirst);
    return getFileMessage(file, uploadFirst);
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
    getAttachmentMessage,
    getUploadedAttachmentMessage,
    recreateFileBackedMessage,
  };
}

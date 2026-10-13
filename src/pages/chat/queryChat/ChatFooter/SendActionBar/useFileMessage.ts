import {
  AttachmentV2,
  ComponentMessageParams,
  MessageItem,
  MessageType,
} from "@abd-im/wasm-client-sdk";
import { v4 as uuidV4 } from "uuid";

import { IMSDK } from "@/layout/MainContentWrap";

import {
  registerUploadTask,
  setUploadProgress,
  unregisterUploadTask,
} from "../../uploadProgress";
import { AttachmentType, getAttachmentType } from "../attachmentType";
import { registerMessageRetry } from "../messageRetry";

export interface FileWithPath extends File {
  path?: string;
}

// Keep successful uploads reusable if another part of the draft fails to prepare.
const uploadedAttachments = new WeakMap<
  File,
  Partial<Record<AttachmentType, Promise<ComponentMessageParams>>>
>();

export function useFileMessage() {
  const upload = async (file: File, progressID = uuidV4()) => {
    const operationID = uuidV4();
    const total = Math.max(file.size, 1);
    registerUploadTask(progressID, operationID, () => {
      IMSDK.cancelUploadFile(operationID);
    });
    try {
      const { data } = await IMSDK.uploadFile(
        {
          name: `${progressID}/${file.name}`,
          contentType: file.type || "application/octet-stream",
          uuid: progressID,
          file,
        },
        operationID,
        {
          onProgress: ({ current, total, percent }) =>
            setUploadProgress(progressID, { current, total, percent }),
        },
      );
      // The local UI preview returns a blob URL; production uploads must be remote.
      const isPreviewURL = import.meta.env.DEV && /^blob:/i.test(data.url);
      if (!/^https?:\/\//i.test(data.url) && !isPreviewURL)
        throw new Error("Invalid attachment upload URL");
      setUploadProgress(progressID, {
        current: total,
        total,
        percent: 100,
      });
      return data.url;
    } finally {
      unregisterUploadTask(progressID, operationID);
    }
  };

  const getUploadedAttachmentBody = (
    file: File,
    type: AttachmentType,
    progressID = uuidV4(),
  ) => {
    const cached = uploadedAttachments.get(file) || {};
    if (cached[type]) return cached[type]!;
    const pending = (async (): Promise<ComponentMessageParams> => {
      const url = await upload(file, progressID);
      const attachment: AttachmentV2 = {
        id: progressID,
        filename: file.name,
        size: file.size,
        url,
        proxy_url: url,
        content_type: file.type || "application/octet-stream",
      };
      const attachments = [attachment];
      if (type === "image") {
        const { width, height } = await getPicInfo(file);
        Object.assign(attachment, { width, height });
      } else if (type === "video") {
        const { duration, snapshotFile, width, height } = await getVideoInfo(file);
        attachment.duration_secs = duration;
        const coverUrl = await upload(snapshotFile, `${progressID}:poster`);
        attachments.push({
          id: `${progressID}:poster`,
          filename: snapshotFile.name,
          size: snapshotFile.size,
          url: coverUrl,
          proxy_url: coverUrl,
          content_type: snapshotFile.type,
          width,
          height,
        });
      }
      const media = { url, proxy_url: url, attachment_id: attachment.id };
      return {
        attachments,
        components: [
          type === "image" || type === "video"
            ? { type: 12, id: 1, items: [{ media, description: null, spoiler: false }] }
            : {
                type: 13,
                id: 1,
                file: media,
                name: file.name,
                size: file.size,
                spoiler: false,
              },
        ],
      };
    })().catch((error) => {
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
    // Component attachments are already uploaded; retry the same body and ID.
    if (message.contentType === MessageType.ComponentMessage) return undefined;
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
    getUploadedAttachmentBody,
    recreateFileBackedMessage,
  };
}

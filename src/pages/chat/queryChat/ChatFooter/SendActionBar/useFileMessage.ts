import { MessageItem } from "@openim/wasm-client-sdk";
import { v4 as uuidV4 } from "uuid";

import { IMSDK } from "@/layout/MainContentWrap";

export interface FileWithPath extends File {
  path?: string;
}

export function useFileMessage() {
  const getImageMessage = async (file: FileWithPath) => {
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

    if (window.electronAPI && file.path) {
      const { data: imageMessage } = await IMSDK.createImageMessageFromFullPath(
        file.path,
      );
      if (imageMessage.pictureElem) {
        imageMessage.pictureElem.sourcePicture = { ...baseInfo };
        imageMessage.pictureElem.bigPicture = { ...baseInfo };
        imageMessage.pictureElem.snapshotPicture = { ...baseInfo };
      }
      return imageMessage;
    }

    const options = {
      sourcePicture: baseInfo,
      bigPicture: baseInfo,
      snapshotPicture: baseInfo,
      sourcePath: "",
      file,
    };

    return (await IMSDK.createImageMessageByFile(options)).data;
  };

  const getVideoMessage = async (file: FileWithPath) => {
    if (window.electronAPI && file.path) {
      const { data: videoMessage } = await IMSDK.createVideoMessageFromFullPath({
        videoFullPath: file.path,
        videoType: file.type,
        duration: 0,
        snapshotFullPath: "",
      });
      return videoMessage;
    }
    const options = {
      videoFile: file,
      videoType: file.type,
      duration: 0,
      videoSize: file.size,
      videoUUID: uuidV4(),
      snapshotFile: file,
    };
    return (await IMSDK.createVideoMessageByFile(options)).data;
  };

  const getFileMessage = async (file: FileWithPath) => {
    if (window.electronAPI && file.path) {
      const { data: fileMessage } = await IMSDK.createFileMessageFromFullPath({
        fileFullPath: file.path,
        fileName: file.name,
      });
      return fileMessage;
    }
    const options = {
      file,
      fileName: file.name,
      fileUUID: uuidV4(),
    };
    return (await IMSDK.createFileMessageByFile(options)).data;
  };

  const getPicInfo = (file: File): Promise<HTMLImageElement> =>
    new Promise((resolve) => {
      const _URL = window.URL || window.webkitURL;
      const img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.src = _URL.createObjectURL(file);
    });

  return {
    getImageMessage,
    getVideoMessage,
    getFileMessage,
  };
}

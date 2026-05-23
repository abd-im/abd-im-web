import { PlayCircleOutlined } from "@ant-design/icons";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { secondsToMS } from "@/utils/common";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const VideoMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const videoElem = message.videoElem;
  if (!videoElem) return null;

  const playVideo = () => {
    const url = videoElem.videoUrl || videoElem.videoPath;
    if (url) {
      window.open(url);
    }
  };

  return (
    <div
      className="relative max-w-[200px] cursor-pointer overflow-hidden rounded-md"
      onClick={playVideo}
    >
      <img
        src={videoElem.snapshotUrl}
        className="min-h-[100px] max-w-[200px] bg-black/10 object-cover"
        alt="video-snapshot"
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-all hover:bg-black/30">
        <PlayCircleOutlined style={{ fontSize: 48, color: "#fff" }} />
      </div>
      <div className="absolute bottom-1 right-1 rounded bg-black/50 px-1 text-[10px] text-white">
        {secondsToMS(videoElem.duration)}
      </div>
    </div>
  );
};

export default VideoMessageRender;

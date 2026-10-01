import "media-chrome/lang/zh-CN";

import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  MediaControlBar,
  MediaController,
  MediaErrorDialog,
  MediaFullscreenButton,
  MediaLoadingIndicator,
  MediaMuteButton,
  MediaPlayButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import styles from "./video-player.module.scss";

export function VideoPlayer({ src }: { src: string }) {
  const { i18n } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const lang = i18n.language.startsWith("zh") ? "zh-CN" : "en";

  useEffect(() => {
    const video = videoRef.current;
    return () => video?.pause();
  }, [src]);

  return (
    <MediaController className={styles.player} lang={lang}>
      <video
        ref={videoRef}
        slot="media"
        className="h-full w-full object-contain"
        src={src}
        autoPlay
        playsInline
      />
      <MediaLoadingIndicator slot="centered-chrome" />
      <MediaErrorDialog slot="dialog" />
      <MediaControlBar className={styles.controls}>
        <MediaPlayButton className="rounded-md">
          <span slot="play">
            <Play size={20} aria-hidden="true" />
          </span>
          <span slot="pause">
            <Pause size={20} aria-hidden="true" />
          </span>
        </MediaPlayButton>
        <MediaTimeRange className="min-w-0 flex-1" />
        <MediaTimeDisplay showDuration className="tabular-nums" />
        <MediaMuteButton className="rounded-md">
          <span slot="off">
            <VolumeX size={20} aria-hidden="true" />
          </span>
          <span slot="low">
            <Volume1 size={20} aria-hidden="true" />
          </span>
          <span slot="medium">
            <Volume1 size={20} aria-hidden="true" />
          </span>
          <span slot="high">
            <Volume2 size={20} aria-hidden="true" />
          </span>
        </MediaMuteButton>
        <MediaVolumeRange className={styles.volume} />
        <MediaFullscreenButton className="rounded-md">
          <span slot="enter">
            <Maximize size={20} aria-hidden="true" />
          </span>
          <span slot="exit">
            <Minimize size={20} aria-hidden="true" />
          </span>
        </MediaFullscreenButton>
      </MediaControlBar>
    </MediaController>
  );
}

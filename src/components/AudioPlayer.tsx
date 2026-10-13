import "media-chrome/lang/zh-CN";

import { FileMusic, Pause, Play, Volume2, VolumeX } from "lucide-react";
import {
  MediaControlBar,
  MediaController,
  MediaErrorDialog,
  MediaMuteButton,
  MediaPlayButton,
  MediaTimeDisplay,
  MediaTimeRange,
} from "media-chrome/react";
import { useTranslation } from "react-i18next";

import styles from "./video-player.module.scss";

export function AudioPlayer({ src, name }: { src: string; name: string }) {
  const { i18n } = useTranslation();
  return (
    <div className={styles.audioCard}>
      <div className={styles.audioTitle}>
        <FileMusic size={18} />
        <span title={name}>{name}</span>
      </div>
      <MediaController
        audio
        className={`${styles.player} ${styles.audio}`}
        lang={i18n.language.startsWith("zh") ? "zh-CN" : "en"}
      >
        <audio slot="media" src={src} preload="metadata" />
        <MediaErrorDialog slot="dialog" />
        <MediaControlBar className={styles.controls}>
          <MediaPlayButton>
            <span slot="play">
              <Play size={18} />
            </span>
            <span slot="pause">
              <Pause size={18} />
            </span>
          </MediaPlayButton>
          <MediaTimeRange className="min-w-0 flex-1" />
          <MediaTimeDisplay
            showDuration
            className={`tabular-nums ${styles.timeDisplay}`}
          />
          <MediaMuteButton>
            <span slot="off">
              <VolumeX size={18} />
            </span>
            <span slot="high">
              <Volume2 size={18} />
            </span>
          </MediaMuteButton>
        </MediaControlBar>
      </MediaController>
    </div>
  );
}

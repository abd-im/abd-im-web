import { PublicUserItem } from "@abd-im/wasm-client-sdk/lib/types/entity";
import {
  RoomAudioRenderer,
  TrackLoop,
  TrackRefContext,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import clsx from "clsx";
import { LocalParticipant, Participant, ParticipantEvent, Track } from "livekit-client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import OIMAvatar from "@/components/OIMAvatar";
import { CustomType } from "@/constants";

import { CallPhase } from "./callState";
import { AuthData, InviteData } from "./data";
import { RtcControl } from "./RtcControl";

const localVideoClasses =
  "absolute right-3 top-16 z-20 !h-auto !w-[clamp(88px,24%,128px)] aspect-[3/4] rounded-md border border-white/20 bg-black object-cover shadow-floating sm:right-4 sm:top-[72px]";
const remoteVideoClasses = "absolute inset-0 z-0 !h-full !w-full bg-black object-cover";

interface IRtcLayoutProps {
  phase: CallPhase;
  isRecv: boolean;
  inviteData?: InviteData;
  connectionError: string;
  retryConnection: () => void;
  closeOverlay: () => void;
  sendCustomSignal: (recvID: string, customType: CustomType) => Promise<void>;
  acceptIncomingCall: (roomID: string, authData: AuthData) => void;
  handleRemoteAccepted: (roomID: string, authData: AuthData) => void;
  setConnectionError: (error: string) => void;
}

export const RtcLayout = ({
  phase,
  isRecv,
  inviteData,
  connectionError,
  retryConnection,
  acceptIncomingCall,
  handleRemoteAccepted,
  sendCustomSignal,
  closeOverlay,
  setConnectionError,
}: IRtcLayoutProps) => {
  const { t } = useTranslation();
  const isVideoCall = inviteData?.invitation?.mediaType === "video";
  const isConnected = phase === "connected";
  const tracks = useTracks([Track.Source.Camera]);
  const remoteTrack = tracks.find((track) => !isLocal(track.participant));
  const [isRemoteVideoMuted, setIsRemoteVideoMuted] = useState(true);

  useEffect(() => {
    const participant = remoteTrack?.participant;
    if (!participant?.identity) {
      setIsRemoteVideoMuted(true);
      return;
    }

    const updateMutedState = () => setIsRemoteVideoMuted(!participant.isCameraEnabled);
    participant.on(ParticipantEvent.TrackMuted, updateMutedState);
    participant.on(ParticipantEvent.TrackUnmuted, updateMutedState);
    updateMutedState();

    return () => {
      participant.off(ParticipantEvent.TrackMuted, updateMutedState);
      participant.off(ParticipantEvent.TrackUnmuted, updateMutedState);
    };
  }, [remoteTrack?.participant]);

  const showRemoteVideo =
    isConnected && isVideoCall && Boolean(remoteTrack) && !isRemoteVideoMuted;
  const callType = isVideoCall ? t("rtcCall.video") : t("rtcCall.audio");

  return (
    <div
      className={clsx(
        "relative flex h-[min(620px,calc(100vh-32px))] w-[min(560px,calc(100vw-32px))] overflow-hidden border border-surface-border bg-page-canvas shadow-floating",
        { "sm:w-[480px]": !isVideoCall },
      )}
    >
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className={clsx(
            "relative z-30 flex h-16 shrink-0 items-center justify-between border-b border-surface-border bg-surface-raised px-4",
            { "border-white/10 bg-black/65": showRemoteVideo },
          )}
        >
          <div className="min-w-0">
            <div
              className={clsx("truncate text-sm font-medium text-foreground", {
                "text-white": showRemoteVideo,
              })}
            >
              {inviteData?.participant?.userInfo.nickname || callType}
            </div>
            <div
              className={clsx("mt-0.5 text-xs text-muted-foreground", {
                "text-white/70": showRemoteVideo,
              })}
            >
              {callType}
            </div>
          </div>
          <div
            className={clsx("text-xs font-medium text-muted-foreground", {
              "text-white/80": showRemoteVideo,
            })}
            aria-live="polite"
          >
            {t(`rtcCall.phase.${phase}`)}
          </div>
        </header>

        <main
          className={clsx(
            "relative flex min-h-0 flex-1 items-center justify-center bg-page-canvas px-6 pb-24",
            { "bg-app-shell": isConnected },
          )}
        >
          {!showRemoteVideo && (
            <SingleProfile
              userInfo={inviteData?.participant?.userInfo}
              callType={callType}
              status={
                connectionError ? t(connectionError) : t(`rtcCall.phase.${phase}`)
              }
              hasError={Boolean(connectionError)}
            />
          )}

          {isConnected && (
            <TrackLoop tracks={tracks}>
              <TrackRefContext.Consumer>
                {(track) =>
                  track && (
                    <VideoTrack
                      {...track}
                      className={
                        isLocal(track.participant)
                          ? localVideoClasses
                          : clsx(remoteVideoClasses, { hidden: !showRemoteVideo })
                      }
                    />
                  )
                }
              </TrackRefContext.Consumer>
            </TrackLoop>
          )}
        </main>

        <RtcControl
          phase={phase}
          isRecv={isRecv}
          invitation={inviteData?.invitation}
          connectionError={connectionError}
          retryConnection={retryConnection}
          setConnectionError={setConnectionError}
          closeOverlay={closeOverlay}
          acceptIncomingCall={acceptIncomingCall}
          handleRemoteAccepted={handleRemoteAccepted}
          sendCustomSignal={sendCustomSignal}
        />
      </div>
      <RoomAudioRenderer />
    </div>
  );
};

interface ISingleProfileProps {
  userInfo?: PublicUserItem;
  callType: string;
  status: string;
  hasError: boolean;
}

const SingleProfile = ({
  userInfo,
  callType,
  status,
  hasError,
}: ISingleProfileProps) => (
  <div className="relative z-10 flex max-w-[320px] flex-col items-center text-center">
    <div className="rounded-full border border-surface-border bg-surface p-1 shadow-surface">
      <OIMAvatar size={88} src={userInfo?.faceURL} text={userInfo?.nickname} />
    </div>
    <div className="mt-5 max-w-full truncate text-base font-semibold text-foreground">
      {userInfo?.nickname || callType}
    </div>
    <div
      className={clsx("mt-1.5 text-sm text-muted-foreground", {
        "text-red-600 dark:text-red-400": hasError,
      })}
      role={hasError ? "alert" : undefined}
    >
      {status}
    </div>
  </div>
);

const isLocal = (participant: Participant) => participant instanceof LocalParticipant;

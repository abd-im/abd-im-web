import { CbEvents, MessageType } from "@abd-im/wasm-client-sdk";
import {
  MessageItem,
  RtcInvite,
  WSEvent,
} from "@abd-im/wasm-client-sdk/lib/types/entity";
import {
  TrackToggle,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import { Tooltip } from "antd";
import { RemoteParticipant, RoomEvent, Track } from "livekit-client";
import {
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RotateCcw,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getRtcConnectData } from "@/api/imApi";
import { CustomType } from "@/constants";
import { IMSDK } from "@/layout/MainContentWrap";
import { checkRtcMediaAccess, getRtcDeviceFailure } from "@/utils/rtcMedia";

import { CallPhase } from "./callState";
import { CounterHandle, ForwardCounter } from "./Counter";
import { AuthData } from "./data";

interface IRtcControlProps {
  phase: CallPhase;
  isRecv: boolean;
  invitation?: RtcInvite;
  connectionError: string;
  retryConnection: () => void;
  setConnectionError: (error: string) => void;
  acceptIncomingCall: (roomID: string, authData: AuthData) => void;
  handleRemoteAccepted: (roomID: string, authData: AuthData) => void;
  closeOverlay: () => void;
  sendCustomSignal: (recvID: string, customType: CustomType) => Promise<void>;
}

export const RtcControl = ({
  phase,
  isRecv,
  invitation,
  connectionError,
  retryConnection,
  setConnectionError,
  acceptIncomingCall,
  handleRemoteAccepted,
  closeOverlay,
  sendCustomSignal,
}: IRtcControlProps) => {
  const { t } = useTranslation();
  const room = useRoomContext();
  const localParticipantState = useLocalParticipant();
  const counterRef = useRef<CounterHandle>(null);
  const acceptingRef = useRef(false);
  const activeRef = useRef(true);
  const [isAccepting, setIsAccepting] = useState(false);

  const isWaiting = phase === "ringing" || phase === "outgoing";
  const isConnected = phase === "connected";
  const isFailed = phase === "failed";
  const recvID = isRecv ? invitation?.inviterUserID : invitation?.inviteeUserIDList[0];
  const isVideoCall = invitation?.mediaType === "video";

  useEffect(
    () => () => {
      activeRef.current = false;
    },
    [],
  );

  const closeControl = useCallback(() => {
    activeRef.current = false;
    closeOverlay();
  }, [closeOverlay]);

  const loadRemoteAccepted = useCallback(async () => {
    if (!invitation) return;
    setConnectionError("");
    setIsAccepting(true);
    try {
      const { data } = await getRtcConnectData(invitation.roomID);
      if (!activeRef.current) return;
      handleRemoteAccepted(invitation.roomID, data);
    } catch {
      if (activeRef.current) setConnectionError("rtcCall.error.connection");
    } finally {
      if (activeRef.current) setIsAccepting(false);
    }
  }, [handleRemoteAccepted, invitation, setConnectionError]);

  useEffect(() => {
    if (!invitation || !recvID) return;

    const acceptHandler = ({ roomID }: RtcInvite) => {
      if (isRecv || invitation.roomID !== roomID) return;
      void loadRemoteAccepted();
    };
    const rejectHandler = ({ roomID }: RtcInvite) => {
      if (invitation.roomID === roomID) closeControl();
    };
    const hangupHandler = ({ roomID }: RtcInvite) => {
      if (invitation.roomID !== roomID) return;
      room.disconnect();
      closeControl();
    };
    const cancelHandler = ({ roomID }: RtcInvite) => {
      if (invitation.roomID === roomID && isWaiting) closeControl();
    };
    const participantDisconnectedHandler = (participant: RemoteParticipant) => {
      if (
        participant.identity === invitation.inviterUserID ||
        participant.identity === invitation.inviteeUserIDList[0]
      ) {
        room.disconnect();
      }
    };
    const handleCallMessages = (data: MessageItem | MessageItem[]) => {
      const messages = Array.isArray(data) ? data : [data];
      messages.forEach((message) => {
        if (message.sendID !== recvID) return;
        if (
          message.contentType !== MessageType.CustomMessage ||
          !message.customElem?.data
        ) {
          return;
        }
        const customData = JSON.parse(message.customElem.data) as {
          data: RtcInvite;
          customType: CustomType;
        };
        if (customData.customType === CustomType.CallingAccept) {
          acceptHandler(customData.data);
        }
        if (customData.customType === CustomType.CallingReject) {
          rejectHandler(customData.data);
        }
        if (customData.customType === CustomType.CallingCancel) {
          cancelHandler(customData.data);
        }
        if (customData.customType === CustomType.CallingHungup) {
          hangupHandler(customData.data);
        }
      });
    };
    const newMessageHandler = ({ data }: WSEvent<MessageItem[]>) =>
      handleCallMessages(data);
    const onlineOnlyMessageHandler = ({ data }: WSEvent<MessageItem>) =>
      handleCallMessages(data);

    IMSDK.on(CbEvents.OnRecvNewMessages, newMessageHandler);
    IMSDK.on(CbEvents.OnRecvOnlineOnlyMessage, onlineOnlyMessageHandler);
    room.on(RoomEvent.ParticipantDisconnected, participantDisconnectedHandler);
    return () => {
      IMSDK.off(CbEvents.OnRecvNewMessages, newMessageHandler);
      IMSDK.off(CbEvents.OnRecvOnlineOnlyMessage, onlineOnlyMessageHandler);
      room.off(RoomEvent.ParticipantDisconnected, participantDisconnectedHandler);
    };
  }, [closeControl, invitation, isRecv, isWaiting, loadRemoteAccepted, recvID, room]);

  const hungup = () => {
    if (!recvID) return;
    if (isWaiting) {
      const customType = isRecv ? CustomType.CallingReject : CustomType.CallingCancel;
      void sendCustomSignal(recvID, customType);
      closeControl();
      return;
    }
    void sendCustomSignal(recvID, CustomType.CallingHungup);
    room.disconnect();
    closeControl();
  };

  const acceptInvitation = async () => {
    if (!invitation || !recvID || acceptingRef.current) return;
    acceptingRef.current = true;
    setIsAccepting(true);
    setConnectionError("");

    try {
      await checkRtcMediaAccess(invitation.mediaType);
    } catch (error) {
      if (!activeRef.current) return;
      setConnectionError(`rtcCall.error.${getRtcDeviceFailure(error)}`);
      acceptingRef.current = false;
      setIsAccepting(false);
      return;
    }

    try {
      const { data } = await getRtcConnectData(invitation.roomID);
      if (!activeRef.current) return;
      await sendCustomSignal(recvID, CustomType.CallingAccept);
      if (!activeRef.current) return;
      acceptIncomingCall(invitation.roomID, data);
    } catch {
      if (!activeRef.current) return;
      setConnectionError("rtcCall.error.connection");
    } finally {
      acceptingRef.current = false;
      if (activeRef.current) setIsAccepting(false);
    }
  };

  const retry = () => {
    if (isFailed) {
      retryConnection();
    } else if (isRecv) {
      void acceptInvitation();
    } else {
      void loadRemoteAccepted();
    }
  };

  if (!invitation) return null;

  return (
    <div className="ignore-drag bg-surface-raised/95 absolute inset-x-0 bottom-0 z-40 flex h-24 items-center justify-center gap-7 border-t border-surface-border px-4 backdrop-blur-sm sm:gap-10">
      {connectionError ? (
        <>
          <ControlButton
            label={t("close")}
            icon={<X size={21} />}
            onClick={closeControl}
          />
          <ControlButton
            label={t("retry")}
            icon={
              isAccepting ? (
                <LoaderCircle className="animate-spin" size={21} />
              ) : (
                <RotateCcw size={21} />
              )
            }
            onClick={retry}
            disabled={isAccepting}
            emphasis="brand"
          />
        </>
      ) : (
        <>
          {isConnected && (
            <>
              <Tooltip title={t("placeholder.microphone")}>
                <TrackToggle
                  aria-label={t("placeholder.microphone")}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-surface-border bg-surface text-foreground shadow-surface transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  source={Track.Source.Microphone}
                  showIcon={false}
                >
                  {localParticipantState.isMicrophoneEnabled ? (
                    <Mic size={21} />
                  ) : (
                    <MicOff size={21} />
                  )}
                </TrackToggle>
              </Tooltip>
              <span className="sr-only">{t("placeholder.microphone")}</span>
            </>
          )}

          <ControlButton
            label={isWaiting ? t("cancel") : t("hangUp")}
            icon={<PhoneOff size={22} />}
            onClick={hungup}
            emphasis="danger"
          />

          {isRecv && phase === "ringing" && (
            <ControlButton
              label={isAccepting ? t("rtcCall.accepting") : t("answer")}
              icon={
                isAccepting ? (
                  <LoaderCircle className="animate-spin" size={22} />
                ) : (
                  <Phone size={22} />
                )
              }
              onClick={() => void acceptInvitation()}
              disabled={isAccepting}
              emphasis="accept"
            />
          )}

          {isConnected && isVideoCall && (
            <>
              <Tooltip title={t("placeholder.camera")}>
                <TrackToggle
                  aria-label={t("placeholder.camera")}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-surface-border bg-surface text-foreground shadow-surface transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  source={Track.Source.Camera}
                  showIcon={false}
                >
                  {localParticipantState.isCameraEnabled ? (
                    <Video size={21} />
                  ) : (
                    <VideoOff size={21} />
                  )}
                </TrackToggle>
              </Tooltip>
              <span className="sr-only">{t("placeholder.camera")}</span>
            </>
          )}
        </>
      )}

      {(phase === "connecting" || isConnected) && !connectionError && (
        <ForwardCounter
          ref={counterRef}
          className="absolute left-1/2 top-1 -translate-x-1/2"
          isConnected={isConnected}
        />
      )}
    </div>
  );
};

interface ControlButtonProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  emphasis?: "default" | "brand" | "accept" | "danger";
}

const ControlButton = ({
  label,
  icon,
  onClick,
  disabled,
  emphasis = "default",
}: ControlButtonProps) => {
  const styles = {
    default: "border-surface-border bg-surface text-foreground hover:bg-surface-hover",
    brand: "border-brand bg-brand text-white hover:brightness-95",
    accept: "border-[var(--trust)] bg-[var(--trust)] text-white hover:brightness-95",
    danger: "border-red-600 bg-red-600 text-white hover:bg-red-700",
  }[emphasis];

  return (
    <div className="flex w-16 flex-col items-center gap-1.5">
      <Tooltip title={label}>
        <button
          type="button"
          aria-label={label}
          className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${styles}`}
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
        </button>
      </Tooltip>
      <span className="w-full truncate text-center text-xs text-muted-foreground">
        {label}
      </span>
    </div>
  );
};

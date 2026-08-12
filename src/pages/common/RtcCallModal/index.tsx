import "@livekit/components-styles";

import { LiveKitRoom } from "@livekit/components-react";
import { t } from "i18next";
import {
  forwardRef,
  ForwardRefRenderFunction,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";

import DraggableModalWrap from "@/components/DraggableModalWrap";
import { CustomType } from "@/constants";
import { OverlayVisibleHandle, useOverlayVisible } from "@/hooks/useOverlayVisible";
import { IMSDK } from "@/layout/MainContentWrap";
import { useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";

import { callReducer, initialCallState } from "./callState";
import { AuthData, InviteData } from "./data";
import { RtcLayout } from "./RtcLayout";

interface IRtcCallModalProps {
  inviteData: InviteData;
}

const RtcCallModal: ForwardRefRenderFunction<
  OverlayVisibleHandle,
  IRtcCallModalProps
> = ({ inviteData }, ref) => {
  const { invitation } = inviteData;
  const inviteeUserID = invitation?.inviteeUserIDList[0];
  const inviteTimeout = invitation?.timeout ?? 30;
  const [callState, dispatchCall] = useReducer(callReducer, initialCallState);
  const selfID = useUserStore((state) => state.selfInfo.userID);
  const { isOverlayOpen, closeOverlay } = useOverlayVisible(ref);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const visibleRoomID = isOverlayOpen ? invitation?.roomID : undefined;
  const visibleRoomIDRef = useRef(visibleRoomID);
  visibleRoomIDRef.current = visibleRoomID;

  const isRecv = selfID !== invitation?.inviterUserID;

  const clearTimer = useCallback(() => clearTimeout(timer.current), []);

  const closeCall = useCallback(
    (roomID: string) => {
      if (visibleRoomIDRef.current !== roomID) return;
      visibleRoomIDRef.current = undefined;
      clearTimer();
      dispatchCall({ type: "reset", roomID });
      closeOverlay();
    },
    [clearTimer, closeOverlay],
  );

  const sendCustomSignal = useCallback(
    async (recvID: string, customType: CustomType) => {
      const data = {
        customType,
        data: {
          ...invitation,
        },
      };
      const { data: message } = await IMSDK.createCustomMessage({
        data: JSON.stringify(data),
        extension: "",
        description: "",
      });
      await IMSDK.sendMessage({
        recvID,
        message,
        groupID: "",
        isOnlineOnly: true,
      });
    },
    [invitation],
  );

  useEffect(() => {
    if (!isOverlayOpen || !invitation?.roomID) return;

    const roomID = invitation.roomID;
    dispatchCall({ type: "open", roomID, isReceiver: isRecv });

    if (!isRecv && inviteeUserID) {
      const invite = async () => {
        try {
          await sendCustomSignal(inviteeUserID, CustomType.CallingInvite);
          if (visibleRoomIDRef.current !== roomID) return;
          clearTimer();
          timer.current = setTimeout(() => {
            if (visibleRoomIDRef.current !== roomID) return;
            void sendCustomSignal(inviteeUserID, CustomType.CallingCancel);
            closeCall(roomID);
          }, inviteTimeout * 1000);
        } catch (error) {
          feedbackToast({ msg: t("toast.inviteUserFailed"), error });
          closeCall(roomID);
        }
      };

      void invite();
    }
  }, [
    clearTimer,
    closeCall,
    invitation?.roomID,
    inviteeUserID,
    inviteTimeout,
    isOverlayOpen,
    isRecv,
    sendCustomSignal,
  ]);

  useEffect(() => {
    if (isOverlayOpen) return;
    visibleRoomIDRef.current = undefined;
    clearTimer();
    dispatchCall({ type: "reset" });
  }, [isOverlayOpen, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const acceptIncomingCall = useCallback(
    (roomID: string, authData: AuthData) => {
      if (visibleRoomIDRef.current !== roomID) return;
      clearTimer();
      dispatchCall({ type: "localAccept", roomID, authData });
    },
    [clearTimer],
  );

  const handleRemoteAccepted = useCallback(
    (roomID: string, authData: AuthData) => {
      if (visibleRoomIDRef.current !== roomID) return;
      clearTimer();
      dispatchCall({ type: "remoteAccept", roomID, authData });
    },
    [clearTimer],
  );

  const isCurrentRoom = callState.roomID === invitation?.roomID;
  const connect =
    isCurrentRoom &&
    (callState.phase === "connecting" || callState.phase === "connected");
  const isConnected = isCurrentRoom && callState.phase === "connected";
  const authData = isCurrentRoom ? callState.authData : initialCallState.authData;

  return (
    <DraggableModalWrap
      title={null}
      footer={null}
      open={isOverlayOpen}
      closable={false}
      maskClosable={false}
      keyboard={false}
      mask={false}
      centered
      width="auto"
      onCancel={() => invitation?.roomID && closeCall(invitation.roomID)}
      destroyOnClose
      ignoreClasses=".ignore-drag, .no-padding-modal, .cursor-pointer"
      className="no-padding-modal rtc-single-modal"
      wrapClassName="pointer-events-none"
    >
      <div>
        {isOverlayOpen && invitation?.roomID && (
          <LiveKitRoom
            key={invitation.roomID}
            serverUrl={authData.serverUrl}
            token={authData.token}
            video={invitation.mediaType === "video"}
            audio={true}
            connect={connect}
            options={{
              publishDefaults: {
                videoCodec: "vp9",
                backupCodec: { codec: "vp8" },
              },
            }}
            onConnected={() =>
              dispatchCall({ type: "connected", roomID: invitation.roomID })
            }
            onError={(error) => {
              feedbackToast({ msg: t("toast.rtcConnectFailed"), error });
              closeCall(invitation.roomID);
            }}
            onMediaDeviceFailure={(failure) => {
              feedbackToast({
                msg: t("toast.rtcDeviceFailed"),
                error: failure ?? t("toast.rtcDeviceFailed"),
              });
              closeCall(invitation.roomID);
            }}
            onDisconnected={() => closeCall(invitation.roomID)}
          >
            <RtcLayout
              connect={connect}
              isConnected={isConnected}
              isRecv={isRecv}
              inviteData={inviteData}
              sendCustomSignal={sendCustomSignal}
              acceptIncomingCall={acceptIncomingCall}
              handleRemoteAccepted={handleRemoteAccepted}
              closeOverlay={() => closeCall(invitation.roomID)}
            />
          </LiveKitRoom>
        )}
      </div>
    </DraggableModalWrap>
  );
};

export default forwardRef(RtcCallModal);

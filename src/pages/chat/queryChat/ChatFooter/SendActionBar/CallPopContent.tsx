import { SessionType } from "@abd-im/wasm-client-sdk";
import { PublicUserItem } from "@abd-im/wasm-client-sdk/lib/types/entity";
import { t } from "i18next";
import { memo } from "react";
import { v4 as uuidV4 } from "uuid";

import call_audio from "@/assets/images/chatFooter/call_audio.png";
import call_video from "@/assets/images/chatFooter/call_video.png";
import { useConversationStore, useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";
import emitter from "@/utils/events";
import { checkRtcMediaAccess } from "@/utils/rtcMedia";

const callList = [
  {
    idx: 0,
    title: t("placeholder.videoCall"),
    icon: call_video,
  },
  {
    idx: 1,
    title: t("placeholder.voiceCall"),
    icon: call_audio,
  },
];

const CallPopContent = ({ closeAllPop }: { closeAllPop?: () => void }) => {
  const prepareCall = async (idx: number) => {
    const conversation = useConversationStore.getState().currentConversation!;
    const mediaType = idx ? "audio" : "video";
    try {
      await checkRtcMediaAccess(mediaType);
    } catch (error) {
      feedbackToast({ msg: t("toast.rtcDeviceFailed"), error });
      return;
    }
    emitter.emit("OPEN_RTC_MODAL", {
      invitation: {
        inviterUserID: useUserStore.getState().selfInfo.userID,
        inviteeUserIDList: [conversation.userID],
        groupID: "",
        roomID: uuidV4(),
        timeout: 60,
        mediaType,
        sessionType: SessionType.Single,
        platformID: window.electronAPI?.getPlatform() ?? 5,
      },
      participant: {
        userInfo: {
          nickname: conversation.showName,
          userID: conversation.userID,
          faceURL: conversation.faceURL,
          ex: "",
        },
      },
    });
    closeAllPop?.();
  };
  return (
    <div className="p-1">
      {callList.map((item) => (
        <div
          className="flex cursor-pointer items-center rounded px-3 py-2 text-xs hover:bg-[var(--primary-active)]"
          key={item.title}
          onClick={() => void prepareCall(item.idx)}
        >
          <img width={20} src={item.icon} alt="call_video" />
          <div className="ml-3 text-foreground">{item.title}</div>
        </div>
      ))}
    </div>
  );
};
export default memo(CallPopContent);

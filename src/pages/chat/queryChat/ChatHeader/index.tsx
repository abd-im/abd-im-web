import { SessionType } from "@openim/wasm-client-sdk";
import { Layout, Tooltip } from "antd";
import clsx from "clsx";
import { memo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import group_member from "@/assets/images/chatHeader/group_member.png";
import launch_group from "@/assets/images/chatHeader/launch_group.png";
import search_history from "@/assets/images/chatHeader/search_history.png";
import settings from "@/assets/images/chatHeader/settings.png";
import OIMAvatar from "@/components/OIMAvatar";
import { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";
import { useContactStore, useConversationStore, useUserStore } from "@/store";
import { emit } from "@/utils/events";

import GroupSetting from "../GroupSetting";
import SearchHistory from "../SearchHistory";
import SingleSetting from "../SingleSetting";

const ChatHeader = () => {
  const { t } = useTranslation();
  const singleSettingRef = useRef<OverlayVisibleHandle>(null);
  const groupSettingRef = useRef<OverlayVisibleHandle>(null);
  const searchHistoryRef = useRef<OverlayVisibleHandle>(null);

  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const currentGroupInfo = useConversationStore((state) => state.currentGroupInfo);
  const currentUserIsInGroup = useConversationStore((state) =>
    Boolean(state.currentMemberInGroup?.userID),
  );
  const inGroup = useConversationStore((state) =>
    Boolean(state.currentMemberInGroup?.groupID),
  );
  const userStatusList = useContactStore((state) => state.userStatusList);

  // locale re-render
  useUserStore((state) => state.appSettings.locale);

  useEffect(() => {
    if (singleSettingRef.current?.isOverlayOpen) {
      singleSettingRef.current?.closeOverlay();
    }
    if (groupSettingRef.current?.isOverlayOpen) {
      groupSettingRef.current?.closeOverlay();
    }
    if (searchHistoryRef.current?.isOverlayOpen) {
      searchHistoryRef.current?.closeOverlay();
    }
  }, [currentConversation?.conversationID]);

  const isSingleSession = currentConversation?.conversationType === SessionType.Single;
  const isGroupSession = currentConversation?.conversationType === SessionType.Group;

  const menuList = [
    {
      title: t("placeholder.messageHistory"),
      icon: search_history,
      idx: 3,
    },
    {
      title: t("placeholder.createGroup"),
      icon: launch_group,
      idx: 0,
    },
    {
      title: t("placeholder.invitation"),
      icon: launch_group,
      idx: 1,
    },
    {
      title: t("placeholder.setting"),
      icon: settings,
      idx: 2,
    },
  ];

  const menuClick = (idx: number) => {
    switch (idx) {
      case 0:
      case 1:
        emit("OPEN_CHOOSE_MODAL", {
          type: isSingleSession ? "CRATE_GROUP" : "INVITE_TO_GROUP",
          extraData: isSingleSession
            ? [{ ...currentConversation }]
            : currentConversation?.groupID,
        });
        break;
      case 2:
        if (isGroupSession) {
          groupSettingRef.current?.openOverlay();
        } else {
          singleSettingRef.current?.openOverlay();
        }
        break;
      case 3:
        searchHistoryRef.current?.openOverlay();
        break;
      default:
        break;
    }
  };

  const getStatusInfo = () => {
    const userStatus = userStatusList.find(
      (item) => item.userID === currentConversation?.userID,
    );
    const isOnline = userStatus ? userStatus.status === 1 : false;
    const platform = userStatus?.platformIDs?.[0];
    let platformStr = "";
    if (isOnline) {
      switch (platform) {
        case 1:
          platformStr = "iOS";
          break;
        case 2:
          platformStr = "Android";
          break;
        case 3:
          platformStr = "Windows";
          break;
        case 4:
          platformStr = "Mac";
          break;
        case 5:
          platformStr = "Web";
          break;
        case 8:
          platformStr = "iPad";
          break;
        default:
          platformStr = "";
      }
    }
    return {
      isOnline,
      text: isOnline
        ? `${platformStr}${t("placeholder.online")}`
        : t("placeholder.offLine"),
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <Layout.Header className="relative border-b border-b-[var(--gap-text)] !bg-white !px-3">
      <div className="flex h-full items-center leading-none">
        <div className="flex flex-1 items-center overflow-hidden">
          <OIMAvatar
            src={currentConversation?.faceURL}
            text={currentConversation?.showName}
            isgroup={Boolean(currentConversation?.groupID)}
          />
          <div
            className={clsx(
              "ml-3 flex !h-10.5 flex-1 flex-col justify-between overflow-hidden",
            )}
          >
            <div className="truncate text-base font-semibold">
              {currentConversation?.showName}
            </div>
            {isGroupSession && currentUserIsInGroup && (
              <div className="flex items-center text-xs text-[var(--sub-text)]">
                <img width={20} src={group_member} alt="member" />
                <span>{currentGroupInfo?.memberCount}</span>
              </div>
            )}
            {isSingleSession && statusInfo && (
              <div className="flex items-center text-xs text-[var(--sub-text)]">
                <div
                  className={clsx(
                    "mr-1 h-1.5 w-1.5 rounded-full",
                    statusInfo.isOnline ? "bg-[#50e186]" : "bg-[#999]",
                  )}
                />
                {statusInfo.text}
              </div>
            )}
          </div>
        </div>
        <div className="mr-5 flex">
          {menuList.map((menu) => {
            if (menu.idx === 1 && (isSingleSession || (!inGroup && !isSingleSession))) {
              return null;
            }
            if (menu.idx === 0 && !isSingleSession) {
              return null;
            }

            return (
              <Tooltip title={menu.title} key={menu.idx}>
                <img
                  className="ml-5 cursor-pointer"
                  width={20}
                  src={menu.icon}
                  alt=""
                  onClick={() => menuClick(menu.idx)}
                />
              </Tooltip>
            );
          })}
        </div>
      </div>
      <SingleSetting ref={singleSettingRef} />
      <GroupSetting ref={groupSettingRef} />
      <SearchHistory
        ref={searchHistoryRef}
        conversationID={currentConversation?.conversationID}
      />
    </Layout.Header>
  );
};

export default memo(ChatHeader);

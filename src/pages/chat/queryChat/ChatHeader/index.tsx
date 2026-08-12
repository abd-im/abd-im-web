import { SessionType } from "@abd-im/wasm-client-sdk";
import { Layout, Popover, Tooltip } from "antd";
import clsx from "clsx";
import {
  Bot,
  Check,
  ChevronDown,
  FileSearch,
  Phone,
  Settings,
  UserPlus,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type ChatManagement,
  getBusinessConnection,
  updateChatManagement,
} from "@/api/secretary";
import group_member from "@/assets/images/chatHeader/group_member.png";
import OIMAvatar from "@/components/OIMAvatar";
import { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";
import { useContactStore, useConversationStore, useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";
import { emit } from "@/utils/events";

import CallPopContent from "../ChatFooter/SendActionBar/CallPopContent";
import GroupSetting from "../GroupSetting";
import SearchHistory from "../SearchHistory";
import SingleSetting from "../SingleSetting";

const ChatHeader = () => {
  const { t } = useTranslation();
  const singleSettingRef = useRef<OverlayVisibleHandle>(null);
  const groupSettingRef = useRef<OverlayVisibleHandle>(null);
  const searchHistoryRef = useRef<OverlayVisibleHandle>(null);
  const [management, setManagement] = useState<ChatManagement>();
  const [instruction, setInstruction] = useState("");
  const [businessLoading, setBusinessLoading] = useState(false);
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [callMenuOpen, setCallMenuOpen] = useState(false);

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

  useEffect(() => {
    const conversationID = currentConversation?.conversationID;
    if (!conversationID || !isSingleSession) {
      setManagement(undefined);
      setInstruction("");
      setInstructionOpen(false);
      return;
    }
    let active = true;
    void getBusinessConnection()
      .then((connection) => {
        if (!active) return;
        const item = connection?.chatManagement.find(
          (value) => value.conversationID === conversationID,
        );
        setManagement(item);
        setInstruction(item?.instruction ?? "");
      })
      .catch((error: unknown) => feedbackToast({ error }));
    return () => {
      active = false;
    };
  }, [currentConversation?.conversationID, isSingleSession]);

  const updateBusinessSettings = async (
    patch: Pick<ChatManagement, "conversationID"> & Partial<ChatManagement>,
  ) => {
    setBusinessLoading(true);
    try {
      const connection = await updateChatManagement([patch]);
      const item = connection.chatManagement.find(
        (value) => value.conversationID === patch.conversationID,
      );
      setManagement(item);
      setInstruction(item?.instruction ?? "");
      emit(
        "SECRETARY_HOSTING_UPDATED",
        connection.chatManagement
          .filter((value) => value.hostingEnabled)
          .map((value) => value.conversationID),
      );
      return true;
    } catch (error) {
      feedbackToast({ error });
      return false;
    } finally {
      setBusinessLoading(false);
    }
  };

  const menuList = [
    {
      title: t("placeholder.messageHistory"),
      icon: FileSearch,
      idx: 3,
    },
    {
      title: t("placeholder.createGroup"),
      icon: UserPlus,
      idx: 0,
    },
    {
      title: t("placeholder.invitation"),
      icon: UserPlus,
      idx: 1,
    },
    {
      title: t("placeholder.setting"),
      icon: Settings,
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
    <Layout.Header className="relative border-b border-surface-border !bg-surface !px-3 text-foreground shadow-sm">
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
          {isSingleSession && currentConversation && (
            <Popover
              arrow={false}
              content={<CallPopContent closeAllPop={() => setCallMenuOpen(false)} />}
              open={callMenuOpen}
              placement="bottomRight"
              trigger="click"
              onOpenChange={setCallMenuOpen}
            >
              <Tooltip title={t("placeholder.call")}>
                <button
                  type="button"
                  className="ml-2 grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                  aria-label={t("placeholder.call")}
                >
                  <Phone size={20} strokeWidth={1.8} />
                </button>
              </Tooltip>
            </Popover>
          )}
          {isSingleSession && currentConversation && (
            <div
              className={clsx(
                "mr-1 flex h-8 overflow-hidden rounded-md border",
                management?.hostingEnabled
                  ? "border-trust-border bg-trust-soft"
                  : "border-surface-border bg-surface",
              )}
            >
              <button
                type="button"
                className={clsx(
                  "inline-flex items-center gap-1.5 px-2.5 text-xs font-semibold disabled:opacity-50",
                  management?.hostingEnabled
                    ? "text-trust hover:bg-trust-hover"
                    : "text-muted-foreground hover:bg-surface-hover",
                )}
                aria-pressed={Boolean(management?.hostingEnabled)}
                disabled={businessLoading}
                onClick={() =>
                  void updateBusinessSettings({
                    conversationID: currentConversation.conversationID,
                    hostingEnabled: !management?.hostingEnabled,
                  })
                }
              >
                <Bot size={15} strokeWidth={1.8} />
                {t("secretary.hosting")}
              </button>
              <Popover
                trigger="click"
                placement="bottomRight"
                arrow={false}
                overlayClassName="secretary-instruction-popover"
                open={instructionOpen}
                onOpenChange={setInstructionOpen}
                content={
                  <div className="w-[300px] p-2.5">
                    <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
                      <strong className="text-[11px] font-semibold text-foreground">
                        {t("secretary.instruction")}
                      </strong>
                      {instruction && (
                        <button
                          type="button"
                          className="text-[10px] text-faint-foreground hover:text-foreground disabled:opacity-50"
                          disabled={businessLoading}
                          onClick={() =>
                            void updateBusinessSettings({
                              conversationID: currentConversation.conversationID,
                              instruction: "",
                            }).then((saved) => saved && setInstructionOpen(false))
                          }
                        >
                          {t("clear")}
                        </button>
                      )}
                    </div>
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void updateBusinessSettings({
                          conversationID: currentConversation.conversationID,
                          instruction,
                        }).then((saved) => saved && setInstructionOpen(false));
                      }}
                    >
                      <input
                        className="h-[34px] min-w-0 flex-1 rounded-md border border-surface-border bg-surface-raised px-2.5 text-xs text-foreground outline-none placeholder:text-faint-foreground focus:border-faint-foreground focus:ring-2 focus:ring-surface-selected"
                        value={instruction}
                        maxLength={100}
                        placeholder={t("secretary.instructionPlaceholder")}
                        aria-label={t("secretary.instruction")}
                        onChange={(event) => setInstruction(event.target.value)}
                      />
                      <Tooltip title={t("confirm")}>
                        <button
                          type="submit"
                          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-md bg-foreground text-surface hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={businessLoading}
                          aria-label={t("confirm")}
                        >
                          <Check size={15} strokeWidth={2} />
                        </button>
                      </Tooltip>
                    </form>
                  </div>
                }
              >
                <button
                  type="button"
                  className={clsx(
                    "relative grid w-7 place-items-center border-l",
                    management?.hostingEnabled
                      ? "border-trust-border text-trust hover:bg-trust-hover"
                      : "border-surface-border text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                  )}
                  aria-label={t("secretary.instruction")}
                >
                  <ChevronDown size={13} strokeWidth={1.8} />
                  {instruction.trim() && (
                    <span className="absolute right-1 top-1 h-1 w-1 rounded-full bg-trust" />
                  )}
                </button>
              </Popover>
            </div>
          )}
          {menuList.map((menu) => {
            if (menu.idx === 1 && (isSingleSession || (!inGroup && !isSingleSession))) {
              return null;
            }
            if (menu.idx === 0 && !isSingleSession) {
              return null;
            }
            const Icon = menu.icon;

            return (
              <Tooltip title={menu.title} key={menu.idx}>
                <button
                  type="button"
                  className="ml-2 grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                  aria-label={menu.title}
                  onClick={() => menuClick(menu.idx)}
                >
                  <Icon size={20} strokeWidth={1.8} />
                </button>
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

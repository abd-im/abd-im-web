import { CheckOutlined, RightOutlined } from "@ant-design/icons";
import { Button, Divider, Drawer, Popover } from "antd";
import { t } from "i18next";
import { forwardRef, ForwardRefRenderFunction, memo, useRef, useState } from "react";

import { modal } from "@/AntdGlobalComp";
import OIMAvatar from "@/components/OIMAvatar";
import SettingRow from "@/components/SettingRow";
import { OverlayVisibleHandle, useOverlayVisible } from "@/hooks/useOverlayVisible";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore } from "@/store";
import { useContactStore } from "@/store/contact";
import { feedbackToast } from "@/utils/common";
import { emit } from "@/utils/events";

const burnDurationOptions = [
  { label: "30s", value: 30 },
  { label: "5m", value: 300 },
  { label: "1h", value: 3600 },
  { label: "8h", value: 28800 },
  { label: "1d", value: 86400 },
  { label: "7d", value: 604800 },
];

const SingleSetting: ForwardRefRenderFunction<OverlayVisibleHandle, unknown> = (
  _,
  ref,
) => {
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const [popVisible, setPopVisible] = useState(false);

  const isBlack = useContactStore((state) => state.blackList).some(
    (black) => currentConversation?.userID === black.userID,
  );
  const isFriend = useContactStore((state) => state.friendList).some(
    (friend) => currentConversation?.userID === friend.userID,
  );

  const { isOverlayOpen, closeOverlay } = useOverlayVisible(ref);

  const updateBlack = async () => {
    if (!currentConversation) return;
    const execFunc = async () => {
      try {
        isBlack
          ? await IMSDK.removeBlack(currentConversation?.userID)
          : await IMSDK.addBlack({
              toUserID: currentConversation?.userID,
            });
      } catch (error) {
        feedbackToast({ error, msg: t("toast.updateBlackStateFailed") });
      }
    };
    if (!isBlack) {
      modal.confirm({
        title: t("placeholder.moveBlacklist"),
        content: (
          <div className="flex items-baseline">
            <div>{t("toast.confirmMoveBlacklist")}</div>
            <span className="text-xs text-[var(--sub-text)]">
              {t("placeholder.willFilterThisUserMessage")}
            </span>
          </div>
        ),
        onOk: execFunc,
      });
    } else {
      await execFunc();
    }
  };

  const tryUnfriend = () => {
    if (!currentConversation) return;
    modal.confirm({
      title: t("placeholder.unfriend"),
      content: t("toast.confirmUnfriend"),
      onOk: async () => {
        try {
          await IMSDK.deleteFriend(currentConversation.userID);
        } catch (error) {
          feedbackToast({ error, msg: t("toast.unfriendFailed") });
        }
      },
    });
  };

  const updatePin = async (checked: boolean) => {
    if (!currentConversation) return;
    try {
      await IMSDK.pinConversation({
        conversationID: currentConversation.conversationID,
        isPinned: checked,
      });
    } catch (error) {
      feedbackToast({ error, msg: t("toast.pinConversationFailed") });
    }
  };

  const updateDND = async (checked: boolean) => {
    if (!currentConversation) return;
    try {
      await IMSDK.setConversationRecvMessageOpt({
        conversationID: currentConversation.conversationID,
        opt: checked ? 2 : 0,
      });
    } catch (error) {
      feedbackToast({ error, msg: t("toast.setConversationRecvMessageOptFailed") });
    }
  };

  const updatePrivateChat = async (checked: boolean) => {
    if (!currentConversation) return;
    try {
      await IMSDK.setConversationPrivateChat({
        conversationID: currentConversation.conversationID,
        isPrivate: checked,
      });
    } catch (error) {
      feedbackToast({ error, msg: t("toast.updateConversationPrivateStateFailed") });
    }
  };

  const updateBurnDuration = async (value: number) => {
    if (!currentConversation) return;
    try {
      await IMSDK.setConversationBurnDuration({
        conversationID: currentConversation.conversationID,
        burnDuration: value,
      });
      setPopVisible(false);
    } catch (error) {
      feedbackToast({ error, msg: t("toast.updateConversationPrivateStateFailed") });
    }
  };

  const tryClearHistory = () => {
    if (!currentConversation) return;
    modal.confirm({
      title: t("toast.clearChatHistory"),
      content: t("toast.confirmClearChatHistory"),
      onOk: async () => {
        try {
          await IMSDK.clearConversationAndDeleteAllMsg(
            currentConversation.conversationID,
          );
          emit("CLEAR_HISTORY_DONE");
        } catch (error) {
          feedbackToast({ error, msg: t("toast.clearConversationMessagesFailed") });
        }
      },
    });
  };

  const openUserCard = () => {
    emit("OPEN_USER_CARD", { userID: currentConversation?.userID });
  };

  const getBurnDurationLabel = (value?: number) => {
    if (!value) return "0s";
    return burnDurationOptions.find((opt) => opt.value === value)?.label || `${value}s`;
  };

  const burnDurationContent = (
    <div className="flex w-32 flex-col py-1">
      {burnDurationOptions.map((opt) => (
        <div
          key={opt.value}
          className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-[var(--primary-active)]"
          onClick={() => updateBurnDuration(opt.value)}
        >
          <span className="text-xs">{opt.label}</span>
          {currentConversation?.burnDuration === opt.value && (
            <CheckOutlined
              className="text-[10px] text-[var(--primary)]"
              rev={undefined}
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Drawer
      title={t("placeholder.setting")}
      placement="right"
      rootClassName="chat-drawer"
      destroyOnClose
      onClose={closeOverlay}
      open={isOverlayOpen}
      maskClassName="opacity-0"
      maskMotion={{
        visible: false,
      }}
      width={400}
      getContainer={"#chat-container"}
    >
      <div className="h-full overflow-y-auto bg-[#F4F5F7] px-4 py-3">
        {/* Profile Block */}
        <div
          className="mb-3 flex cursor-pointer items-center justify-between rounded-xl bg-white p-4"
          onClick={openUserCard}
        >
          <div className="flex items-center">
            <OIMAvatar
              src={currentConversation?.faceURL}
              text={currentConversation?.showName}
            />
            <div className="ml-3 text-base font-medium">
              {currentConversation?.showName}
            </div>
          </div>
          <RightOutlined className="text-xs text-[var(--sub-text)]" rev={undefined} />
        </div>

        {/* Pin & DND Block */}
        <div className="mb-3 overflow-hidden rounded-xl bg-white">
          <SettingRow
            title={t("placeholder.sticky")}
            value={currentConversation?.isPinned}
            tryChange={updatePin}
          />
          <Divider className="m-0 mx-4 w-auto" />
          <SettingRow
            title={t("placeholder.notNotify")}
            value={currentConversation?.recvMsgOpt === 2}
            tryChange={updateDND}
          />
        </div>

        {/* Blacklist Block */}
        <div className="mb-3 overflow-hidden rounded-xl bg-white">
          <SettingRow
            title={t("placeholder.moveBlacklist")}
            value={isBlack}
            tryChange={updateBlack}
          />
        </div>

        {/* Burn & Clear Block */}
        <div className="mb-3 overflow-hidden rounded-xl bg-white">
          <SettingRow
            title={t("placeholder.privateChat")}
            value={currentConversation?.isPrivateChat}
            tryChange={updatePrivateChat}
          />
          <Divider className="m-0 mx-4 w-auto" />
          <Popover
            content={burnDurationContent}
            trigger="click"
            placement="bottomRight"
            open={popVisible}
            onOpenChange={setPopVisible}
            overlayClassName="send-action-dropdown"
          >
            <SettingRow
              className="cursor-pointer"
              title={t("placeholder.privateChatTime")}
              rowClick={() => setPopVisible(true)}
            >
              <div className="flex items-center text-[var(--sub-text)]">
                <span className="mr-1 text-xs">
                  {getBurnDurationLabel(currentConversation?.burnDuration)}
                </span>
                <RightOutlined rev={undefined} className="text-[10px]" />
              </div>
            </SettingRow>
          </Popover>
          <Divider className="m-0 mx-4 w-auto" />
          <SettingRow title={t("toast.clearChatHistory")} rowClick={tryClearHistory}>
            <RightOutlined
              className="text-xs text-[var(--sub-text)]"
              rev={undefined}
            />
          </SettingRow>
        </div>

        {/* Delete Friend Button */}
        <div className="flex w-full justify-center pt-24 pb-6">
          {isFriend && (
            <Button
              type="primary"
              danger
              className="h-10 w-full rounded-xl font-medium"
              onClick={tryUnfriend}
            >
              {t("placeholder.unfriend")}
            </Button>
          )}
        </div>
      </div>
    </Drawer>
  );
};

export default memo(forwardRef(SingleSetting));

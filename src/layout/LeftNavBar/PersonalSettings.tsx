import { CloseOutlined, RightOutlined } from "@ant-design/icons";
import { AddFriendPermission, MessageReceiveOptType } from "@openim/wasm-client-sdk";
import { Checkbox, Modal } from "antd";
import { forwardRef, ForwardRefRenderFunction, memo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { modal } from "@/AntdGlobalComp";
import i18n from "@/i18n";
import { IMSDK } from "@/layout/MainContentWrap";
import { useUserStore } from "@/store";
import { LocaleString } from "@/store/type";
import { feedbackToast } from "@/utils/common";

import { OverlayVisibleHandle, useOverlayVisible } from "../../hooks/useOverlayVisible";
import BlackList from "./BlackList";
import ChangePassword from "./ChangePassword";

const PersonalSettings: ForwardRefRenderFunction<OverlayVisibleHandle, unknown> = (
  _,
  ref,
) => {
  const { isOverlayOpen, closeOverlay } = useOverlayVisible(ref);

  return (
    <Modal
      title={null}
      footer={null}
      closable={false}
      open={isOverlayOpen}
      onCancel={closeOverlay}
      centered
      destroyOnClose
      styles={{
        mask: {
          opacity: 0,
          transition: "none",
        },
      }}
      width={600}
      className="no-padding-modal max-w-[80vw]"
      maskTransitionName=""
    >
      <PersonalSettingsContent closeOverlay={closeOverlay} />
    </Modal>
  );
};

export default memo(forwardRef(PersonalSettings));

export const PersonalSettingsContent = ({
  closeOverlay,
}: {
  closeOverlay?: () => void;
}) => {
  const { t } = useTranslation();
  const selfInfo = useUserStore((state) => state.selfInfo);
  const localeStr = useUserStore((state) => state.appSettings.locale);
  const allowBeep = useUserStore((state) => state.appSettings.allowBeep);
  const updateAppSettings = useUserStore((state) => state.updateAppSettings);
  const updateSelfInfo = useUserStore((state) => state.updateSelfInfo);

  const backListRef = useRef<OverlayVisibleHandle>(null);
  const changePasswordRef = useRef<OverlayVisibleHandle>(null);

  const localeChange = (checked: boolean, locale: LocaleString) => {
    if (!checked) return;
    window.electronAPI?.ipcInvoke("changeLanguage", locale);
    i18n.changeLanguage(locale);
    updateAppSettings({ locale });
  };

  const updateGlobalDND = async (checked: boolean) => {
    try {
      const opt = checked
        ? MessageReceiveOptType.NotNotify
        : MessageReceiveOptType.Normal;
      await IMSDK.setGlobalRecvMessageOpt(opt);
      updateSelfInfo({ globalRecvMsgOpt: opt });
    } catch (error) {
      feedbackToast({ error });
    }
  };

  const updateAddFriendPermission = async (checked: boolean) => {
    try {
      const permission = checked
        ? AddFriendPermission.AddFriendDenied
        : AddFriendPermission.AddFriendAllowed;
      await IMSDK.setSelfInfo({ addFriendPermission: permission });
      updateSelfInfo({ addFriendPermission: permission });
    } catch (error) {
      feedbackToast({ error });
    }
  };

  const tryClearAllHistory = () => {
    modal.confirm({
      title: t("placeholder.clearChatHistory"),
      content: t("toast.confirmClearChatHistory"),
      onOk: async () => {
        try {
          await IMSDK.deleteAllMsgFromLocalAndSvr();
          feedbackToast({ msg: t("toast.accessSuccess") });
        } catch (error) {
          feedbackToast({ error });
        }
      },
    });
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-[#f4f5f7] pb-6">
      <BlackList ref={backListRef} />
      <ChangePassword ref={changePasswordRef} />

      {/* Header */}
      <div className="app-drag flex items-center justify-between p-6">
        <span className="text-xl font-bold text-[#0c1c33]">
          {t("placeholder.accountSetting")}
        </span>
        <CloseOutlined
          className="app-no-drag cursor-pointer text-xl text-[#8e9aaf] hover:text-red-500"
          rev={undefined}
          onClick={closeOverlay}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        {/* Card 1: Core Settings */}
        <div className="mb-4 text-sm font-bold text-[#8e9aaf]">
          {t("placeholder.personalSetting")}
        </div>
        <div className="mb-6 rounded-lg bg-white p-5 shadow-sm">
          {/* Language Selection */}
          <div className="mb-6">
            <div className="mb-4 text-sm font-semibold text-[#0c1c33]">
              {t("placeholder.chooseLanguage")}
            </div>
            <div className="flex gap-12 pl-1">
              <Checkbox
                checked={localeStr === "zh-CN"}
                onChange={(e) => localeChange(e.target.checked, "zh-CN")}
              >
                <span className="text-sm font-medium">简体中文</span>
              </Checkbox>
              <Checkbox
                checked={localeStr === "en-US"}
                onChange={(e) => localeChange(e.target.checked, "en-US")}
              >
                <span className="text-sm font-medium">English</span>
              </Checkbox>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="mb-6">
            <div className="mb-4 text-sm font-semibold text-[#0c1c33]">
              {t("placeholder.messageToast")}
            </div>
            <div className="flex gap-12 pl-1">
              <Checkbox
                checked={allowBeep}
                onChange={(e) => updateAppSettings({ allowBeep: e.target.checked })}
              >
                <span className="text-sm font-medium">
                  {t("placeholder.messageAllowBeep")}
                </span>
              </Checkbox>
              <Checkbox
                checked={selfInfo.globalRecvMsgOpt === MessageReceiveOptType.NotNotify}
                onChange={(e) => updateGlobalDND(e.target.checked)}
              >
                <span className="text-sm font-medium">
                  {t("placeholder.messageNotNotify")}
                </span>
              </Checkbox>
            </div>
          </div>

          {/* Add Friend Settings */}
          <div>
            <div className="mb-4 text-sm font-semibold text-[#0c1c33]">
              {t("placeholder.addFriendsSetting")}
            </div>
            <div className="pl-1">
              <Checkbox
                checked={
                  selfInfo.addFriendPermission === AddFriendPermission.AddFriendDenied
                }
                onChange={(e) => updateAddFriendPermission(e.target.checked)}
              >
                <span className="text-sm font-medium">
                  {t("placeholder.refuseAddFriend")}
                </span>
              </Checkbox>
            </div>
          </div>
        </div>

        {/* Card 2: List Actions */}
        <div className="mb-4 text-sm font-bold text-[#8e9aaf]">
          {t("placeholder.securitySetting")}
        </div>
        <div className="mb-6 overflow-hidden rounded-lg bg-white shadow-sm">
          <div
            className="flex cursor-pointer items-center justify-between border-b border-[#f4f5f7] px-5 py-5 transition-colors hover:bg-gray-50 active:bg-gray-100"
            onClick={() => backListRef.current?.openOverlay()}
          >
            <span className="text-sm font-bold text-[#0c1c33]">
              {t("placeholder.blackList")}
            </span>
            <RightOutlined className="text-xs text-[#8e9aaf]" rev={undefined} />
          </div>

          <div
            className="flex cursor-pointer items-center justify-between px-5 py-5 transition-colors hover:bg-gray-50 active:bg-gray-100"
            onClick={() => {
              changePasswordRef.current?.openOverlay();
            }}
          >
            <span className="text-sm font-bold text-[#0c1c33]">
              {t("placeholder.changePassword")}
            </span>
            <RightOutlined className="text-xs text-[#8e9aaf]" rev={undefined} />
          </div>
        </div>

        {/* Card 3: Danger Action */}
        <div className="mb-4 text-sm font-bold text-[#8e9aaf]">
          {t("placeholder.otherSetting")}
        </div>
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <div
            className="flex cursor-pointer items-center justify-center px-5 py-5 transition-colors hover:bg-red-50 active:bg-red-100"
            onClick={tryClearAllHistory}
          >
            <span className="text-sm font-bold text-[#ff381f]">
              {t("placeholder.clearChatHistory")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

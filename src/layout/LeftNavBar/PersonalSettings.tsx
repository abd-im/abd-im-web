import "./personal-settings.scss";

import { AddFriendPermission, MessageReceiveOptType } from "@abd-im/wasm-client-sdk";
import { Modal, Segmented, Switch } from "antd";
import { ArrowLeft, ChevronRight, X } from "lucide-react";
import {
  forwardRef,
  type ForwardRefRenderFunction,
  memo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { modal } from "@/AntdGlobalComp";
import { IconButton } from "@/components/ui";
import i18n from "@/i18n";
import { IMSDK } from "@/layout/MainContentWrap";
import { useUserStore } from "@/store";
import { LocaleString } from "@/store/type";
import { feedbackToast } from "@/utils/common";

import { OverlayVisibleHandle, useOverlayVisible } from "../../hooks/useOverlayVisible";
import AgentSettings from "./AgentSettings";
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
      width={520}
      className="no-padding-modal personal-settings-modal"
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
  const [page, setPage] = useState<"general" | "agent">("general");
  const agentEntryRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const selfInfo = useUserStore((state) => state.selfInfo);
  const localeStr = useUserStore((state) => state.appSettings.locale);
  const allowBeep = useUserStore((state) => state.appSettings.allowBeep);
  const updateAppSettings = useUserStore((state) => state.updateAppSettings);
  const updateSelfInfo = useUserStore((state) => state.updateSelfInfo);
  const backListRef = useRef<OverlayVisibleHandle>(null);
  const changePasswordRef = useRef<OverlayVisibleHandle>(null);

  const localeChange = (locale: LocaleString) => {
    window.electronAPI?.ipcInvoke("changeLanguage", locale);
    void i18n.changeLanguage(locale);
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
  const navigateSettings = (next: "general" | "agent") => {
    setPage(next);
    requestAnimationFrame(() =>
      (next === "agent" ? backRef : agentEntryRef).current?.focus(),
    );
  };

  return (
    <div className="personal-settings" data-testid="personal-settings">
      <BlackList ref={backListRef} />
      <ChangePassword ref={changePasswordRef} />
      <header className="personal-settings-header app-drag">
        {page === "agent" && (
          <button
            ref={backRef}
            className="ui-button ui-button-ghost ui-button-icon app-no-drag"
            aria-label={t("agent.settings.back")}
            onClick={() => navigateSettings("general")}
          >
            <ArrowLeft />
          </button>
        )}
        <h2>
          {t(page === "agent" ? "agent.settings.title" : "placeholder.accountSetting")}
        </h2>
        <IconButton
          className="app-no-drag"
          label={t("agent.settings.close")}
          onClick={closeOverlay}
        >
          <X />
        </IconButton>
      </header>
      {page === "agent" ? (
        <AgentSettings />
      ) : (
        <div className="personal-settings-body" data-testid="general-settings">
          <section className="settings-section">
            <h3>{t("placeholder.personalSetting")}</h3>
            <div className="settings-row">
              <span>{t("placeholder.chooseLanguage")}</span>
              <Segmented
                size="small"
                aria-label={t("placeholder.chooseLanguage")}
                value={localeStr}
                options={[
                  { label: "简体中文", value: "zh-CN" },
                  { label: "English", value: "en-US" },
                ]}
                onChange={(value) => localeChange(value as LocaleString)}
              />
            </div>
            <div className="settings-row">
              <label htmlFor="settings-beep">{t("placeholder.messageAllowBeep")}</label>
              <Switch
                id="settings-beep"
                size="small"
                checked={allowBeep}
                onChange={(checked) => updateAppSettings({ allowBeep: checked })}
              />
            </div>
            <div className="settings-row">
              <label htmlFor="settings-dnd">{t("placeholder.messageNotNotify")}</label>
              <Switch
                id="settings-dnd"
                size="small"
                checked={selfInfo.globalRecvMsgOpt === MessageReceiveOptType.NotNotify}
                onChange={(checked) => void updateGlobalDND(checked)}
              />
            </div>
            <div className="settings-row">
              <label htmlFor="settings-friend-permission">
                {t("placeholder.refuseAddFriend")}
              </label>
              <Switch
                id="settings-friend-permission"
                size="small"
                checked={
                  selfInfo.addFriendPermission === AddFriendPermission.AddFriendDenied
                }
                onChange={(checked) => void updateAddFriendPermission(checked)}
              />
            </div>
            <button
              ref={agentEntryRef}
              className="settings-row settings-link"
              onClick={() => navigateSettings("agent")}
            >
              <span>{t("agent.settings.title")}</span>
              <ChevronRight size={15} />
            </button>
          </section>
          <section className="settings-section">
            <h3>{t("placeholder.securitySetting")}</h3>
            <button
              className="settings-row settings-link"
              onClick={() => backListRef.current?.openOverlay()}
            >
              <span>{t("placeholder.blackList")}</span>
              <ChevronRight size={15} />
            </button>
            <button
              className="settings-row settings-link"
              onClick={() => changePasswordRef.current?.openOverlay()}
            >
              <span>{t("placeholder.changePassword")}</span>
              <ChevronRight size={15} />
            </button>
          </section>
          <section className="settings-section">
            <button
              className="settings-row settings-link settings-danger"
              onClick={tryClearAllHistory}
            >
              {t("placeholder.clearChatHistory")}
            </button>
          </section>
        </div>
      )}
    </div>
  );
};

import "./personal-settings.scss";

import { AddFriendPermission, MessageReceiveOptType } from "@abd-im/wasm-client-sdk";
import { ArrowLeft, ChevronRight, X } from "lucide-react";
import { AlertDialog, ToggleGroup } from "radix-ui";
import {
  forwardRef,
  type ForwardRefRenderFunction,
  memo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Spinner,
  Switch,
} from "@/components/ui";
import i18n from "@/i18n";
import { IMSDK } from "@/layout/MainContentWrap";
import { useUserStore } from "@/store";
import { LocaleString } from "@/store/type";
import { feedbackToast } from "@/utils/common";

import { OverlayVisibleHandle, useOverlayVisible } from "../../hooks/useOverlayVisible";
import AgentSettings from "./AgentSettings";
import BlackList from "./BlackList";
import ChangePassword from "./ChangePassword";
import { MediaCacheSettings } from "./MediaCacheSettings";

const PersonalSettings: ForwardRefRenderFunction<OverlayVisibleHandle, unknown> = (
  _,
  ref,
) => {
  const { t } = useTranslation();
  const { isOverlayOpen, closeOverlay } = useOverlayVisible(ref);
  return (
    <Dialog open={isOverlayOpen} onOpenChange={(open) => !open && closeOverlay()}>
      <DialogContent className="personal-settings-modal gap-0 p-0">
        <DialogTitle className="sr-only">{t("placeholder.accountSetting")}</DialogTitle>
        <PersonalSettingsContent closeOverlay={closeOverlay} />
      </DialogContent>
    </Dialog>
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
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const clearHistoryRef = useRef<HTMLButtonElement>(null);
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
  const tryClearAllHistory = async () => {
    setClearingHistory(true);
    try {
      await IMSDK.deleteAllMsgFromLocalAndSvr();
      feedbackToast({ msg: t("toast.accessSuccess") });
      setClearHistoryOpen(false);
    } catch (error) {
      feedbackToast({ error });
    } finally {
      setClearingHistory(false);
    }
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
        <Button
          variant="ghost"
          size="icon"
          className="app-no-drag"
          aria-label={t("agent.settings.close")}
          onClick={closeOverlay}
        >
          <X />
        </Button>
      </header>
      {page === "agent" ? (
        <AgentSettings />
      ) : (
        <div className="personal-settings-body" data-testid="general-settings">
          <section className="settings-section">
            <h3>{t("placeholder.personalSetting")}</h3>
            <div className="settings-row">
              <span>{t("placeholder.chooseLanguage")}</span>
              <ToggleGroup.Root
                type="single"
                className="ui-segmented"
                aria-label={t("placeholder.chooseLanguage")}
                value={localeStr}
                onValueChange={(value) => {
                  if (value === "zh-CN" || value === "en-US") localeChange(value);
                }}
              >
                <ToggleGroup.Item value="zh-CN">简体中文</ToggleGroup.Item>
                <ToggleGroup.Item value="en-US">English</ToggleGroup.Item>
              </ToggleGroup.Root>
            </div>
            <div className="settings-row">
              <label htmlFor="settings-beep">{t("placeholder.messageAllowBeep")}</label>
              <Switch
                id="settings-beep"
                checked={allowBeep}
                onCheckedChange={(checked) => updateAppSettings({ allowBeep: checked })}
              />
            </div>
            <div className="settings-row">
              <label htmlFor="settings-dnd">{t("placeholder.messageNotNotify")}</label>
              <Switch
                id="settings-dnd"
                checked={selfInfo.globalRecvMsgOpt === MessageReceiveOptType.NotNotify}
                onCheckedChange={(checked) => void updateGlobalDND(checked)}
              />
            </div>
            <div className="settings-row">
              <label htmlFor="settings-friend-permission">
                {t("placeholder.refuseAddFriend")}
              </label>
              <Switch
                id="settings-friend-permission"
                checked={
                  selfInfo.addFriendPermission === AddFriendPermission.AddFriendDenied
                }
                onCheckedChange={(checked) => void updateAddFriendPermission(checked)}
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
          {window.electronAPI && <MediaCacheSettings />}
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
              ref={clearHistoryRef}
              onClick={() => setClearHistoryOpen(true)}
            >
              {t("placeholder.clearChatHistory")}
            </button>
          </section>
        </div>
      )}
      <AlertDialog.Root open={clearHistoryOpen} onOpenChange={setClearHistoryOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="ui-dialog-overlay" />
          <AlertDialog.Content
            className="ui-dialog-content"
            style={{ width: 420 }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              clearHistoryRef.current?.focus();
            }}
          >
            <AlertDialog.Title className="text-base font-semibold">
              {t("placeholder.clearChatHistory")}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted-foreground">
              {t("toast.confirmClearChatHistory")}
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button disabled={clearingHistory}>{t("cancel")}</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="primary"
                  disabled={clearingHistory}
                  onClick={(event) => {
                    event.preventDefault();
                    void tryClearAllHistory();
                  }}
                >
                  {clearingHistory && <Spinner />}
                  {t("confirm")}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
};

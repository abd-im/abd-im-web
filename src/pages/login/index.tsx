import { t } from "i18next";
import { useCallback, useEffect, useState } from "react";
import { useCopyToClipboard } from "react-use";

import WindowControlBar from "@/components/WindowControlBar";
import { APP_NAME, APP_VERSION, SDK_VERSION } from "@/config";
import { feedbackToast } from "@/utils/common";
import { getLoginMethod, setLoginMethod as saveLoginMethod } from "@/utils/storage";

import styles from "./index.module.scss";
import LoginForm from "./LoginForm";
import ModifyForm from "./ModifyForm";
import RegisterForm from "./RegisterForm";

export type FormType = 0 | 1 | 2;

export const Login = () => {
  // 0login 1resetPassword 2register
  const [formType, setFormType] = useState<FormType>(0);
  const [loginMethod, setLoginMethod] = useState<"phone" | "email">(getLoginMethod());

  const [_, copyToClipboard] = useCopyToClipboard();

  const updateLoginMethod = useCallback((method: "phone" | "email") => {
    setLoginMethod(method);
    saveLoginMethod(method);
  }, []);

  const handleCopy = () => {
    copyToClipboard(`${`${APP_NAME} ${APP_VERSION}`}/${SDK_VERSION}`);
    feedbackToast({ msg: t("toast.copySuccess") });
  };

  return (
    <div className="relative flex h-full flex-col bg-page-canvas text-foreground">
      <div className="app-drag relative h-10 bg-app-shell border-b border-surface-border">
        <WindowControlBar />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <LeftBar />
        <div
          className={`${styles.login} h-[450px] w-[360px] rounded-xl bg-surface border border-surface-border p-9 shadow-lg`}
        >
          {formType === 0 && (
            <LoginForm
              setFormType={setFormType}
              loginMethod={loginMethod}
              updateLoginMethod={updateLoginMethod}
            />
          )}
          {formType === 1 && (
            <ModifyForm setFormType={setFormType} loginMethod={loginMethod} />
          )}
          {formType === 2 && (
            <RegisterForm loginMethod={loginMethod} setFormType={setFormType} />
          )}
        </div>
      </div>
    </div>
  );
};

const LeftBar = () => {
  return (
    <div className="mr-16 flex max-w-sm flex-col justify-center">
      <div className="text-3xl font-extrabold text-foreground tracking-tight mb-3">
        {t("placeholder.title")}
      </div>
      <div className="text-base text-muted-foreground leading-relaxed">
        {t("placeholder.subTitle")}
      </div>
    </div>
  );
};

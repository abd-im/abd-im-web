import { Eye, EyeOff, X } from "lucide-react";
import md5 from "md5";
import { forwardRef, ForwardRefRenderFunction, memo, useState } from "react";
import { useTranslation } from "react-i18next";

import { modifyPassword } from "@/api/login";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Input,
  Spinner,
} from "@/components/ui";
import { useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";

import { OverlayVisibleHandle, useOverlayVisible } from "../../hooks/useOverlayVisible";

const ChangePassword: ForwardRefRenderFunction<OverlayVisibleHandle, unknown> = (
  _,
  ref,
) => {
  const { t } = useTranslation();
  const { isOverlayOpen, closeOverlay } = useOverlayVisible(ref);

  return (
    <Dialog open={isOverlayOpen} onOpenChange={(open) => !open && closeOverlay()}>
      <DialogContent className="gap-0 p-0" style={{ width: 420 }}>
        <DialogTitle className="sr-only">{t("placeholder.changePassword")}</DialogTitle>
        <ChangePasswordContent closeOverlay={closeOverlay} />
      </DialogContent>
    </Dialog>
  );
};

export default memo(forwardRef(ChangePassword));

function PasswordField({
  name,
  label,
  placeholder,
  autoComplete,
}: {
  name: string;
  label: string;
  placeholder: string;
  autoComplete: string;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Input
          id={name}
          name={name}
          className="h-10 w-full pr-10"
          type={visible ? "text" : "password"}
          required
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <IconButton
          className="absolute right-1 top-1"
          label={t(visible ? "passwordVisibility.hide" : "passwordVisibility.show")}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </IconButton>
      </div>
    </div>
  );
}

export const ChangePasswordContent = ({
  closeOverlay,
}: {
  closeOverlay?: () => void;
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const selfInfo = useUserStore((state) => state.selfInfo);
  const userLogout = useUserStore((state) => state.userLogout);

  const handleSubmit = async (values: FormData) => {
    const oldPassword = String(values.get("oldPassword"));
    const newPassword = String(values.get("newPassword"));
    const confirmPassword = String(values.get("confirmPassword"));

    if (newPassword !== confirmPassword) {
      feedbackToast({ msg: t("toast.passwordsDifferent") });
      return;
    }

    // Password rule: 6-20 characters, must contain both letters and numbers
    const pwdRegex = /^(?=.*[0-9])(?=.*[a-zA-Z]).{6,20}$/;
    if (!pwdRegex.test(newPassword)) {
      feedbackToast({ msg: t("toast.passwordRules") });
      return;
    }

    setLoading(true);
    try {
      await modifyPassword({
        userID: selfInfo.userID,
        currentPassword: md5(oldPassword),
        newPassword: md5(newPassword),
      });
      feedbackToast({ msg: t("toast.updatePasswordSuccess") });
      closeOverlay?.();

      // Wait a moment for the toast to be seen before logging out
      setTimeout(() => {
        userLogout();
      }, 1000);
    } catch (error) {
      feedbackToast({ error });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-page-canvas pb-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-border bg-white p-5">
        <span className="text-base font-bold text-foreground">
          {t("placeholder.changePassword")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="app-no-drag"
          aria-label={t("close")}
          onClick={closeOverlay}
        >
          <X />
        </Button>
      </div>

      {/* Form */}
      <div className="p-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit(new FormData(event.currentTarget));
          }}
        >
          <div className="mb-4 space-y-4 rounded-lg bg-surface p-5 shadow-sm">
            <PasswordField
              name="oldPassword"
              label={t("placeholder.oldPassword")}
              placeholder={t("toast.inputOldPassword")}
              autoComplete="current-password"
            />
            <PasswordField
              name="newPassword"
              label={t("placeholder.newPassword")}
              placeholder={t("toast.passwordRules")}
              autoComplete="new-password"
            />
            <PasswordField
              name="confirmPassword"
              label={t("placeholder.confirmPassword")}
              placeholder={t("toast.reconfirmPassword")}
              autoComplete="new-password"
            />
          </div>
          <Button
            variant="primary"
            type="submit"
            disabled={loading}
            className="h-10 w-full"
          >
            {loading && <Spinner />}
            {t("confirm")}
          </Button>
        </form>
      </div>
    </div>
  );
};

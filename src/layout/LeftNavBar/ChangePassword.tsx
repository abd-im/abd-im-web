import { CloseOutlined } from "@ant-design/icons";
import { Button, Form, Input, Modal } from "antd";
import md5 from "md5";
import { forwardRef, ForwardRefRenderFunction, memo, useState } from "react";
import { useTranslation } from "react-i18next";

import { modifyPassword } from "@/api/login";
import { useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";

import { OverlayVisibleHandle, useOverlayVisible } from "../../hooks/useOverlayVisible";

const ChangePassword: ForwardRefRenderFunction<OverlayVisibleHandle, unknown> = (_, ref) => {
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
      width={420}
      className="no-padding-modal"
      maskTransitionName=""
    >
      <ChangePasswordContent closeOverlay={closeOverlay} />
    </Modal>
  );
};

export default memo(forwardRef(ChangePassword));

export const ChangePasswordContent = ({ closeOverlay }: { closeOverlay?: () => void }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const selfInfo = useUserStore((state) => state.selfInfo);
  const userLogout = useUserStore((state) => state.userLogout);

  const handleSubmit = async (values: any) => {
    const { oldPassword, newPassword, confirmPassword } = values;

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
    <div className="flex flex-col bg-[#f4f5f7] rounded-lg overflow-hidden pb-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-5 border-b border-[#f4f5f7]">
        <span className="text-base font-bold text-[#0c1c33]">{t("placeholder.changePassword")}</span>
        <CloseOutlined
          className="app-no-drag cursor-pointer text-[#8e9aaf] hover:text-red-500 text-lg"
          rev={undefined}
          onClick={closeOverlay}
        />
      </div>

      {/* Form */}
      <div className="p-6">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
        >
          <div className="mb-4 rounded-lg bg-white p-5 shadow-sm">
            <Form.Item
              name="oldPassword"
              label={<span className="text-xs font-semibold text-[#8e9aaf]">{t("placeholder.oldPassword")}</span>}
              rules={[{ required: true, message: t("toast.inputOldPassword") }]}
            >
              <Input.Password
                placeholder={t("toast.inputOldPassword")}
                className="h-10 rounded-md border-[#e8ecf0] hover:border-[#3072ff] focus:border-[#3072ff]"
              />
            </Form.Item>

            <Form.Item
              name="newPassword"
              label={<span className="text-xs font-semibold text-[#8e9aaf]">{t("placeholder.newPassword")}</span>}
              rules={[{ required: true, message: t("toast.inputPassword") }]}
            >
              <Input.Password
                placeholder={t("toast.passwordRules")}
                className="h-10 rounded-md border-[#e8ecf0] hover:border-[#3072ff] focus:border-[#3072ff]"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label={<span className="text-xs font-semibold text-[#8e9aaf]">{t("placeholder.confirmPassword")}</span>}
              rules={[{ required: true, message: t("toast.reconfirmPassword") }]}
            >
              <Input.Password
                placeholder={t("toast.reconfirmPassword")}
                className="h-10 rounded-md border-[#e8ecf0] hover:border-[#3072ff] focus:border-[#3072ff]"
              />
            </Form.Item>
          </div>

          <Form.Item className="mb-0">
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              className="w-full h-10 bg-[#3072ff] hover:bg-[#1a5eff] border-none rounded-md text-sm font-bold shadow-md shadow-blue-100"
            >
              {t("confirm")}
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
};

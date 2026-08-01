import { RightOutlined } from "@ant-design/icons";
import { Button, Divider, Upload } from "antd";
import clsx from "clsx";
import { t } from "i18next";
import { memo, useCallback } from "react";
import { useCopyToClipboard } from "react-use";

import copy from "@/assets/images/chatSetting/copy.png";
import edit_avatar from "@/assets/images/chatSetting/edit_avatar.png";
import EditableContent from "@/components/EditableContent";
import OIMAvatar from "@/components/OIMAvatar";
import SettingRow from "@/components/SettingRow";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { feedbackToast } from "@/utils/common";
import { emit } from "@/utils/events";
import { uploadFile } from "@/utils/imCommon";

import { FileWithPath } from "../ChatFooter/SendActionBar/useFileMessage";
import GroupMemberRow from "./GroupMemberRow";
import { useGroupSettings } from "./useGroupSettings";

const GroupSettings = ({
  updateTravel,
  closeOverlay,
}: {
  updateTravel: () => void;
  closeOverlay: () => void;
}) => {
  const { isNomal, isOwner, isAdmin, isJoinGroup } = useCurrentMemberRole();

  const { currentGroupInfo, updateGroupInfo, tryQuitGroup, tryDismissGroup } =
    useGroupSettings({ closeOverlay });

  const [_, copyToClipboard] = useCopyToClipboard();

  const customUpload = async ({ file }: { file: FileWithPath }) => {
    try {
      const {
        data: { url },
      } = await uploadFile(file);
      await updateGroupInfo({ faceURL: url });
    } catch (error) {
      feedbackToast({ error: t("toast.updateAvatarFailed") });
    }
  };

  const updateGroupName = useCallback(
    async (groupName: string) => {
      await updateGroupInfo({ groupName });
    },
    [updateGroupInfo],
  );

  const transferGroup = () => {
    emit("OPEN_CHOOSE_MODAL", {
      type: "TRANSFER_IN_GROUP",
      extraData: currentGroupInfo?.groupID,
    });
  };

  const hasPermissions = isAdmin || isOwner;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-page-canvas px-4 py-3">
      {/* Profile Block */}
      <div className="mb-3 flex items-center rounded-xl bg-white p-4">
        <Upload
          accept="image/*"
          className={clsx({ "disabled-upload": isNomal })}
          openFileDialogOnClick={hasPermissions}
          showUploadList={false}
          customRequest={customUpload as any}
        >
          <div className="relative">
            <OIMAvatar
              isgroup
              src={currentGroupInfo?.faceURL}
              text={currentGroupInfo?.groupName}
            />
            {hasPermissions && (
              <img
                className="absolute -bottom-1 -right-1"
                width={15}
                src={edit_avatar}
                alt="edit avatar"
              />
            )}
          </div>
        </Upload>

        <EditableContent
          containerClassName="ml-3"
          textClassName="font-medium text-base"
          value={currentGroupInfo?.groupName}
          editable={hasPermissions}
          onChange={updateGroupName}
        />
      </div>

      {/* Member Block */}
      {currentGroupInfo && isJoinGroup && (
        <div className="mb-3 overflow-hidden rounded-xl bg-white">
          <GroupMemberRow
            currentGroupInfo={currentGroupInfo}
            isNomal={isNomal}
            updateTravel={updateTravel}
          />
        </div>
      )}

      {/* Info Block */}
      <div className="mb-3 overflow-hidden rounded-xl bg-white">
        <SettingRow title={`${t("placeholder.group")}ID`}>
          <div className="flex items-center">
            <span className="mr-1 text-xs text-[var(--sub-text)]">
              {currentGroupInfo?.groupID}
            </span>
            <img
              className="cursor-pointer"
              width={14}
              src={copy}
              alt=""
              onClick={() => {
                copyToClipboard(currentGroupInfo?.groupID ?? "");
                feedbackToast({ msg: t("toast.copySuccess") });
              }}
            />
          </div>
        </SettingRow>
        <Divider className="m-0 mx-4 w-auto" />
        <SettingRow title={t("placeholder.groupTppe")}>
          <span className="text-xs text-[var(--sub-text)]">
            {t("placeholder.workGroup")}
          </span>
        </SettingRow>
      </div>

      {/* Transfer Block */}
      {isOwner && (
        <div className="mb-3 overflow-hidden rounded-xl bg-white">
          <SettingRow
            className="cursor-pointer"
            title={t("placeholder.transferGroup")}
            rowClick={transferGroup}
          >
            <RightOutlined
              className="text-xs text-[var(--sub-text)]"
              rev={undefined}
            />
          </SettingRow>
        </div>
      )}

      <div className="flex-1" />

      {/* Action Block */}
      {isJoinGroup && (
        <div className="flex w-full justify-center pb-6 pt-24">
          {!isOwner ? (
            <Button
              type="primary"
              danger
              ghost
              className="h-10 w-full rounded-xl font-medium"
              onClick={tryQuitGroup}
            >
              {t("placeholder.exitGroup")}
            </Button>
          ) : (
            <Button
              type="primary"
              danger
              className="h-10 w-full rounded-xl font-medium"
              onClick={tryDismissGroup}
            >
              {t("placeholder.disbandGroup")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(GroupSettings);

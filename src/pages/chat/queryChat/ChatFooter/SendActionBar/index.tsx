import { PopoverProps, Upload } from "antd";
import { TooltipPlacement } from "antd/es/tooltip";
import i18n, { t } from "i18next";
import { ContactRound, Film, Image, Paperclip, Smile } from "lucide-react";
import { UploadRequestOption } from "rc-upload/lib/interface";
import { memo, ReactNode, useEffect, useState } from "react";
import React from "react";

import { Button, Popover as UIPopover } from "@/components/ui";
import { getUserDisplayName } from "@/hooks/useUserDisplayName";
import { IMSDK } from "@/layout/MainContentWrap";
import { CheckListItem } from "@/pages/common/ChooseModal/ChooseBox/CheckItem";
import { feedbackToast } from "@/utils/common";
import emitter, { emit } from "@/utils/events";

import { AttachmentType } from "../attachmentType";
import { SendMessageParams } from "../useSendMessage";
import EmojiPicker from "./EmojiPicker";

const sendActionList = [
  {
    title: t("placeholder.emoji"),
    icon: Smile,
    key: "emoji",
    accept: undefined,
    comp: null, // Initialized in component
    placement: "top",
  },
  {
    title: t("placeholder.image"),
    icon: Image,
    key: "image",
    accept: "image/*",
    comp: null,
    placement: undefined,
  },
  {
    title: t("placeholder.video"),
    icon: Film,
    key: "video",
    accept: "video/*",
    comp: null,
    placement: undefined,
  },
  {
    title: t("placeholder.card"),
    icon: ContactRound,
    key: "card",
    accept: undefined,
    comp: null,
    placement: "top",
  },
  {
    title: t("placeholder.file"),
    icon: Paperclip,
    key: "file",
    accept: "*",
    comp: null,
    placement: undefined,
  },
];

i18n.on("languageChanged", () => {
  sendActionList[0].title = t("placeholder.emoji");
  sendActionList[1].title = t("placeholder.image");
  sendActionList[2].title = t("placeholder.video");
  sendActionList[3].title = t("placeholder.card");
  sendActionList[4].title = t("placeholder.file");
});

const SendActionBar = ({
  sendMessage,
  sendFiles,
  onSelectEmoji,
}: {
  sendMessage: (params: SendMessageParams) => Promise<unknown>;
  sendFiles: (files: readonly File[], requestedType?: AttachmentType) => Promise<void>;
  onSelectEmoji: (emoji: string) => void;
}) => {
  const [visibleState, setVisibleState] = useState(false);
  const [activeAction, setActiveAction] = useState("");

  useEffect(() => {
    const sendCard = async (user: CheckListItem) => {
      if (!user.userID) return;
      try {
        const { data: message } = await IMSDK.createCardMessage({
          userID: user.userID,
          nickname: getUserDisplayName(user, user.showName),
          faceURL: user.faceURL || "",
          ex: "",
        });
        await sendMessage({ message });
      } catch (error) {
        feedbackToast({ error });
      }
    };

    const handleCardSelected = (user: CheckListItem) => {
      void sendCard(user);
    };
    emitter.on("CARD_USER_SELECTED", handleCardSelected);
    return () => emitter.off("CARD_USER_SELECTED", handleCardSelected);
  }, [sendMessage]);

  const closePop = () => {
    setVisibleState(false);
    setActiveAction("");
  };

  const handleEmojiSelect = (emoji: string) => {
    onSelectEmoji(emoji);
    closePop();
  };

  return (
    <div className="chat-composer-tools">
      {sendActionList.map((action) => {
        const Icon = action.icon;
        const popProps: PopoverProps = {
          placement: action.placement as TooltipPlacement,
          content:
            action.key === "emoji" ? (
              <EmojiPicker onSelect={handleEmojiSelect} />
            ) : (
              action.comp &&
              React.cloneElement(action.comp as React.ReactElement, {
                closePop,
              })
            ),
          title: null,
          arrow: false,
          trigger: "click",
          open: visibleState && activeAction === action.key,
          onOpenChange: (visible) => {
            setVisibleState(visible);
            if (visible) {
              setActiveAction(action.key);
            } else {
              setActiveAction("");
            }
          },
        };

        return (
          <ActionWrap
            popProps={action.key === "card" ? undefined : popProps}
            key={action.key}
            accept={action.accept}
            fileHandle={(options) =>
              void sendFiles([options.file as File], action.key as AttachmentType)
            }
          >
            <Button
              variant="ghost"
              size="icon"
              title={action.title}
              aria-label={action.title}
              onClick={
                action.key === "card"
                  ? () => emit("OPEN_CHOOSE_MODAL", { type: "SELECT_CARD" })
                  : undefined
              }
            >
              <Icon />
            </Button>
          </ActionWrap>
        );
      })}
    </div>
  );
};

export default memo(SendActionBar);

const ActionWrap = ({
  accept,
  popProps,
  children,
  fileHandle,
}: {
  accept?: string;
  children: ReactNode;
  popProps?: PopoverProps;
  fileHandle: (options: UploadRequestOption) => void;
}) => {
  return accept ? (
    <Upload
      showUploadList={false}
      customRequest={fileHandle}
      accept={accept}
      multiple
      className="flex"
    >
      {children}
    </Upload>
  ) : popProps ? (
    <UIPopover
      open={popProps.open}
      onOpenChange={popProps.onOpenChange}
      side="top"
      align="start"
      trigger={children as React.ReactElement}
    >
      {popProps.content as ReactNode}
    </UIPopover>
  ) : (
    <>{children}</>
  );
};

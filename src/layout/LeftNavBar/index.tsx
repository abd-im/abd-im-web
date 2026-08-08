import { RightOutlined } from "@ant-design/icons";
import { Badge, Divider, Layout, Popover, Upload } from "antd";
import clsx from "clsx";
import i18n, { t } from "i18next";
import { Bot, ContactRound, MessageSquare } from "lucide-react";
import React, { memo, useMemo, useRef, useState } from "react";
import ImageResizer from "react-image-file-resizer";
import { UNSAFE_NavigationContext, useResolvedPath } from "react-router-dom";

import { modal } from "@/AntdGlobalComp";
import { updateBusinessUserInfo } from "@/api/login";
import change_avatar from "@/assets/images/profile/change_avatar.png";
import OIMAvatar from "@/components/OIMAvatar";
import { splitConversationList } from "@/features/agentWorkspace/conversationLists";
import { useContactStore, useConversationStore, useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";
import { emit } from "@/utils/events";
import { uploadFile } from "@/utils/imCommon";

import { OverlayVisibleHandle } from "../../hooks/useOverlayVisible";
import { IMSDK } from "../MainContentWrap";
import About from "./About";
import styles from "./left-nav-bar.module.scss";
import PersonalSettings from "./PersonalSettings";

const { Sider } = Layout;

const NavList = [
  {
    icon: (
      <MessageSquare
        className="h-[18px] w-[18px] text-muted-foreground"
        strokeWidth={1.8}
      />
    ),
    icon_active: (
      <MessageSquare className="h-[18px] w-[18px] text-foreground" strokeWidth={1.8} />
    ),
    title: t("placeholder.chat"),
    path: "/chat",
  },
  {
    icon: (
      <ContactRound
        className="h-[18px] w-[18px] text-muted-foreground"
        strokeWidth={1.8}
      />
    ),
    icon_active: (
      <ContactRound className="h-[18px] w-[18px] text-foreground" strokeWidth={1.8} />
    ),
    title: t("placeholder.contact"),
    path: "/contact",
  },
  {
    icon: <Bot className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />,
    icon_active: (
      <Bot className="h-[18px] w-[18px] text-foreground" strokeWidth={1.8} />
    ),
    title: "Agent",
    path: "/agent",
  },
];

i18n.on("languageChanged", () => {
  NavList[0].title = t("placeholder.chat");
  NavList[1].title = t("placeholder.contact");
});

const resizeFile = (file: File): Promise<File> =>
  new Promise((resolve) => {
    ImageResizer.imageFileResizer(
      file,
      400,
      400,
      "webp",
      90,
      0,
      (uri) => {
        resolve(uri as File);
      },
      "file",
    );
  });

type NavItemType = (typeof NavList)[0];

const NavItem = ({ nav: { icon, icon_active, title, path } }: { nav: NavItemType }) => {
  const resolvedPath = useResolvedPath(path);
  const { navigator } = React.useContext(UNSAFE_NavigationContext);
  const toPathname = navigator.encodeLocation
    ? navigator.encodeLocation(path).pathname
    : resolvedPath.pathname;
  const locationPathname = location.pathname;
  const isActive =
    locationPathname === toPathname ||
    (locationPathname.startsWith(toPathname) &&
      locationPathname.charAt(toPathname.length) === "/") ||
    location.hash.startsWith(`#${toPathname}`);

  const [showConversationMenu, setShowConversationMenu] = useState(false);

  const conversationList = useConversationStore((state) => state.conversationList);
  const conversationKinds = useConversationStore((state) => state.conversationKinds);
  const splitConversations = useMemo(
    () => splitConversationList(conversationList, conversationKinds),
    [conversationKinds, conversationList],
  );
  const unHandleFriendApplicationCount = useContactStore(
    (state) => state.unHandleFriendApplicationCount,
  );
  const unHandleGroupApplicationCount = useContactStore(
    (state) => state.unHandleGroupApplicationCount,
  );

  const tryNavigate = () => {
    if (isActive) {
      return;
    }

    // TODO Keep answering when jumping back to chat from another page (if there is one)
    navigator.push(path);
  };

  const closeConversationMenu = () => {
    setShowConversationMenu(false);
  };

  const getBadge = () => {
    if (path === "/chat") {
      return splitConversations.chat.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0,
      );
    }
    if (path === "/agent") {
      return splitConversations.agent.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0,
      );
    }
    if (path === "/contact") {
      return unHandleFriendApplicationCount + unHandleGroupApplicationCount;
    }
    return 0;
  };

  return (
    <Badge size="small" count={getBadge()}>
      <div
        data-testid={`nav-${path.slice(1)}`}
        className={clsx(
          "mb-3 flex h-[52px] w-12 cursor-pointer flex-col items-center justify-center rounded-lg transition-colors",
          isActive ? "bg-surface-selected shadow-sm" : "hover:bg-surface-hover",
        )}
        onClick={tryNavigate}
      >
        <div className="flex h-5 items-center justify-center">
          {isActive ? icon_active : icon}
        </div>
        <div
          className={clsx(
            "mt-1 text-[11px]",
            isActive ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {title}
        </div>
      </div>
    </Badge>
  );
};

const profileMenuList = [
  {
    title: t("placeholder.myInfo"),
    gap: true,
    idx: 0,
  },
  {
    title: t("placeholder.accountSetting"),
    gap: true,
    idx: 1,
  },
  {
    title: t("placeholder.about"),
    gap: false,
    idx: 2,
  },
  {
    title: t("placeholder.logOut"),
    gap: false,
    idx: 3,
  },
];

i18n.on("languageChanged", () => {
  profileMenuList[0].title = t("placeholder.myInfo");
  profileMenuList[1].title = t("placeholder.accountSetting");
  profileMenuList[2].title = t("placeholder.about");
  profileMenuList[3].title = t("placeholder.logOut");
});

const LeftNavBar = memo(() => {
  const aboutRef = useRef<OverlayVisibleHandle>(null);
  const personalSettingsRef = useRef<OverlayVisibleHandle>(null);
  const [showProfile, setShowProfile] = useState(false);
  const selfInfo = useUserStore((state) => state.selfInfo);
  const userLogout = useUserStore((state) => state.userLogout);
  const updateSelfInfo = useUserStore((state) => state.updateSelfInfo);

  const profileMenuClick = (idx: number) => {
    switch (idx) {
      case 0:
        emit("OPEN_USER_CARD", {
          isSelf: true,
          userID: useUserStore.getState().selfInfo.userID,
        });
        break;
      case 1:
        personalSettingsRef.current?.openOverlay();
        break;
      case 2:
        aboutRef.current?.openOverlay();
        break;
      case 3:
        tryLogout();
        break;
      default:
        break;
    }
    setShowProfile(false);
  };

  const tryLogout = () => {
    modal.confirm({
      title: t("placeholder.logOut"),
      content: t("toast.confirmlogOut"),
      onOk: async () => {
        try {
          await userLogout();
        } catch (error) {
          feedbackToast({ error });
        }
      },
    });
  };

  const customUpload = async ({ file }: { file: File }) => {
    const resizedFile = await resizeFile(file);
    const filePath = await window.electronAPI?.saveFileToDisk({
      sync: true,
      file,
    });

    try {
      const {
        data: { url },
      } = await uploadFile(resizedFile, filePath);
      const newInfo = {
        faceURL: url,
      };
      await IMSDK.setSelfInfo(newInfo);
      updateSelfInfo(newInfo);
    } catch (error) {
      feedbackToast({ error: t("toast.updateAvatarFailed") });
    }
  };

  const ProfileContent = (
    <div className="w-72 px-2.5 pb-3 pt-5.5">
      <div className="mb-4.5 ml-3 flex items-center">
        <Upload
          accept=".jpeg,.png,.webp"
          showUploadList={false}
          customRequest={customUpload as any}
        >
          <div className={styles["avatar-wrapper"]}>
            <OIMAvatar src={selfInfo.faceURL} text={selfInfo.nickname} />
            <div className={styles["mask"]}>
              <img src={change_avatar} width={19} alt="" />
            </div>
          </div>
        </Upload>
        <div className="flex-1 overflow-hidden">
          <div className="mb-1 truncate text-base font-medium">{selfInfo.nickname}</div>
        </div>
      </div>
      {profileMenuList.map((menu) => (
        <div key={menu.idx}>
          <div
            className="flex cursor-pointer items-center justify-between rounded-md px-3 py-4 hover:bg-[var(--primary-active)]"
            onClick={() => profileMenuClick(menu.idx)}
          >
            <div>{menu.title}</div>
            <RightOutlined rev={undefined} />
          </div>
          {menu.gap && (
            <div className="px-3">
              <Divider className="my-1.5 border-[var(--gap-text)]" />
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Sider
      className="no-mobile border-r border-surface-border !bg-app-shell text-foreground"
      width={60}
      theme="light"
    >
      <div className="mt-6 flex flex-col items-center">
        <Popover
          content={ProfileContent}
          trigger="click"
          placement="rightBottom"
          overlayClassName="profile-popover"
          title={null}
          arrow={false}
          open={showProfile}
          onOpenChange={(vis) => setShowProfile(vis)}
        >
          <OIMAvatar
            className="mb-6 cursor-pointer"
            src={selfInfo.faceURL}
            text={selfInfo.nickname}
          />
        </Popover>

        {NavList.map((nav) => (
          <NavItem nav={nav} key={nav.path} />
        ))}
      </div>
      <PersonalSettings ref={personalSettingsRef} />
      <About ref={aboutRef} />
    </Sider>
  );
});

export default LeftNavBar;

import {
  BellOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Badge } from "antd";
import clsx from "clsx";
import i18n, { t } from "i18next";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import FlexibleSider from "@/components/FlexibleSider";
import { useContactStore } from "@/store";

const Links = [
  {
    label: t("placeholder.newFriends"),
    icon: <UserAddOutlined className="text-base text-foreground" />,
    path: "/contact/newFriends",
  },
  {
    label: t("placeholder.groupNotification"),
    icon: <BellOutlined className="text-base text-foreground" />,
    path: "/contact/groupNotifications",
  },
  {
    label: t("placeholder.myFriend"),
    icon: <UserOutlined className="text-base text-foreground" />,
    path: "/contact",
  },
  {
    label: t("placeholder.myGroup"),
    icon: <TeamOutlined className="text-base text-foreground" />,
    path: "/contact/myGroups",
  },
];

i18n.on("languageChanged", () => {
  Links[0].label = t("placeholder.newFriends");
  Links[1].label = t("placeholder.groupNotification");
  Links[2].label = t("placeholder.myFriend");
  Links[3].label = t("placeholder.myGroup");
});

const ContactSider = () => {
  const [selectIndex, setSelectIndex] = useState(2);
  const unHandleFriendApplicationCount = useContactStore(
    (state) => state.unHandleFriendApplicationCount,
  );
  const unHandleGroupApplicationCount = useContactStore(
    (state) => state.unHandleGroupApplicationCount,
  );
  const navigate = useNavigate();

  useEffect(() => {
    if (location.hash.includes("/contact/newFriends")) {
      setSelectIndex(0);
    }
    if (location.hash.includes("/contact/groupNotifications")) {
      setSelectIndex(1);
    }
    if (location.hash.includes("/contact/myGroups")) {
      setSelectIndex(3);
    }
  }, []);

  const getBadge = (index: number) => {
    if (index === 0) {
      return unHandleFriendApplicationCount;
    }
    if (index === 1) {
      return unHandleGroupApplicationCount;
    }
    return 0;
  };

  return (
    <FlexibleSider needHidden={true}>
      <div className="h-full bg-app-shell text-foreground">
        <div className="pb-3 pl-5.5 pt-5.5 text-base font-extrabold text-foreground">
          {t("placeholder.contact")}
        </div>
        <ul>
          {Links.map((item, index) => {
            return (
              <li
                key={item.path}
                className={clsx(
                  "mx-2 flex cursor-pointer items-center rounded-md p-3 text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-surface-hover",
                  {
                    "!bg-surface-selected !text-foreground font-medium shadow-sm": index === selectIndex,
                  },
                )}
                onClick={() => {
                  setSelectIndex(index);
                  navigate(String(item.path));
                }}
              >
                <Badge size="small" count={getBadge(index)}>
                  <div className="mr-3 flex h-7 w-7 items-center justify-center rounded-md bg-surface border border-surface-border shadow-sm text-foreground">
                    {item.icon}
                  </div>
                </Badge>
                <div className="text-sm font-medium">{item.label}</div>
              </li>
            );
          })}
        </ul>
      </div>
    </FlexibleSider>
  );
};
export default ContactSider;

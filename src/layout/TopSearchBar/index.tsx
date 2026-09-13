import { GroupItem } from "@abd-im/wasm-client-sdk/lib/types/entity";
import i18n, { t } from "i18next";
import { Plus, Search, SquarePen, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Popover } from "@/components/ui";
import WindowControlBar from "@/components/WindowControlBar";
import { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";
import ChooseModal, { ChooseModalState } from "@/pages/common/ChooseModal";
import GroupCardModal from "@/pages/common/GroupCardModal";
import UserCardModal, { CardInfo } from "@/pages/common/UserCardModal";
import { useContactStore, useUserStore } from "@/store";
import emitter, { OpenUserCardParams } from "@/utils/events";

import GlobalSearchModal from "./GlobalSearchModal";
import SearchUserOrGroup from "./SearchUserOrGroup";

type UserCardState = OpenUserCardParams & {
  cardInfo?: CardInfo;
};

const TopSearchBar = () => {
  const userCardRef = useRef<OverlayVisibleHandle>(null);
  const groupCardRef = useRef<OverlayVisibleHandle>(null);
  const chooseModalRef = useRef<OverlayVisibleHandle>(null);
  const searchModalRef = useRef<OverlayVisibleHandle>(null);
  const globalSearchRef = useRef<OverlayVisibleHandle>(null);
  const [chooseModalState, setChooseModalState] = useState<ChooseModalState>({
    type: "CRATE_GROUP",
  });
  const [userCardState, setUserCardState] = useState<UserCardState>();
  const [groupCardData, setGroupCardData] = useState<
    GroupItem & { inGroup?: boolean }
  >();
  const [actionVisible, setActionVisible] = useState(false);
  const [isSearchGroup, setIsSearchGroup] = useState(false);

  useEffect(() => {
    const userCardHandler = (params: OpenUserCardParams) => {
      setUserCardState({ ...params });
      userCardRef.current?.openOverlay();
    };
    const chooseModalHandler = (params: ChooseModalState) => {
      setChooseModalState({ ...params });
      chooseModalRef.current?.openOverlay();
    };
    emitter.on("OPEN_USER_CARD", userCardHandler);
    emitter.on("OPEN_GROUP_CARD", openGroupCardWithData);
    emitter.on("OPEN_CHOOSE_MODAL", chooseModalHandler);
    return () => {
      emitter.off("OPEN_USER_CARD", userCardHandler);
      emitter.off("OPEN_GROUP_CARD", openGroupCardWithData);
      emitter.off("OPEN_CHOOSE_MODAL", chooseModalHandler);
    };
  }, []);

  const actionClick = (idx: number) => {
    switch (idx) {
      case 0:
      case 1:
        setIsSearchGroup(Boolean(idx));
        searchModalRef.current?.openOverlay();
        break;
      case 2:
        setChooseModalState({ type: "CRATE_GROUP" });
        chooseModalRef.current?.openOverlay();
        break;
      default:
        break;
    }
    setActionVisible(false);
  };

  const openUserCardWithData = useCallback((cardInfo: CardInfo) => {
    searchModalRef.current?.closeOverlay();
    setUserCardState({
      userID: cardInfo.userID,
      cardInfo,
      isSelf: cardInfo.userID === useUserStore.getState().selfInfo.userID,
    });
    userCardRef.current?.openOverlay();
  }, []);

  const openGroupCardWithData = useCallback((group: GroupItem) => {
    searchModalRef.current?.closeOverlay();
    const inGroup = useContactStore
      .getState()
      .groupList.some((g) => g.groupID === group.groupID);
    setGroupCardData({ ...group, inGroup });
    groupCardRef.current?.openOverlay();
  }, []);

  return (
    <div className="no-mobile app-drag workspace-topbar">
      <div className="workspace-brand">
        <img className="workspace-brand-mark" src="./icons/icon.png" alt="" />
        <span>ABD IM</span>
      </div>
      <div className="workspace-search">
        <button
          className="app-no-drag workspace-search-trigger"
          onClick={() => globalSearchRef.current?.openOverlay()}
        >
          <Search size={14} strokeWidth={1.7} />
          <span>{t("workspace.globalSearch")}</span>
        </button>
        <Popover
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="app-no-drag workspace-search-action"
              aria-label={t("workspace.new")}
              title={t("workspace.new")}
            >
              <Plus />
            </Button>
          }
          open={actionVisible}
          onOpenChange={setActionVisible}
        >
          <ActionPopContent actionClick={actionClick} />
        </Popover>
      </div>
      <WindowControlBar />
      <UserCardModal ref={userCardRef} {...userCardState} />
      <GroupCardModal ref={groupCardRef} groupData={groupCardData} />
      <ChooseModal ref={chooseModalRef} state={chooseModalState} />
      <SearchUserOrGroup
        ref={searchModalRef}
        isSearchGroup={isSearchGroup}
        openUserCardWithData={openUserCardWithData}
        openGroupCardWithData={openGroupCardWithData}
      />
      <GlobalSearchModal ref={globalSearchRef} />
    </div>
  );
};

export default TopSearchBar;

const actionMenuList = [
  {
    idx: 0,
    title: t("placeholder.addFriends"),
    icon: UserPlus,
  },
  {
    idx: 1,
    title: t("placeholder.addGroup"),
    icon: Users,
  },
  {
    idx: 2,
    title: t("placeholder.createGroup"),
    icon: SquarePen,
  },
];

i18n.on("languageChanged", () => {
  actionMenuList[0].title = t("placeholder.addFriends");
  actionMenuList[1].title = t("placeholder.addGroup");
  actionMenuList[2].title = t("placeholder.createGroup");
});

const ActionPopContent = ({ actionClick }: { actionClick: (idx: number) => void }) => {
  return (
    <div className="p-1">
      {actionMenuList.map((action) => (
        <button
          className="ui-menu-item"
          key={action.idx}
          onClick={() => actionClick?.(action.idx)}
        >
          <action.icon />
          <span>{action.title}</span>
        </button>
      ))}
    </div>
  );
};

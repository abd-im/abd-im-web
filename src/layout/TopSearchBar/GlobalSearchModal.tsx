import { MessageType } from "@abd-im/wasm-client-sdk";
import type { FriendUserItem } from "@abd-im/wasm-client-sdk/lib/types/entity";
import {
  CloseOutlined,
  FileTextOutlined,
  MessageFilled,
  SearchOutlined,
} from "@ant-design/icons";
import { Empty, Input, InputRef, Modal, Spin } from "antd";
import {
  forwardRef,
  ForwardRefRenderFunction,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import OIMAvatar from "@/components/OIMAvatar";
import { useConversationToggle } from "@/hooks/useConversationToggle";
import { useUserDisplayNameResolver } from "@/hooks/useUserDisplayName";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import { bytesToSize } from "@/utils/common";

import { OverlayVisibleHandle, useOverlayVisible } from "../../hooks/useOverlayVisible";

const GlobalSearchModal: ForwardRefRenderFunction<OverlayVisibleHandle, unknown> = (
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
      width={640}
      className="no-padding-modal max-w-[90vw]"
      styles={{
        mask: {
          opacity: 0.15,
        },
      }}
      maskTransitionName=""
    >
      <GlobalSearchContent closeOverlay={closeOverlay} />
    </Modal>
  );
};

export default memo(forwardRef(GlobalSearchModal));

export const GlobalSearchContent = ({
  closeOverlay,
}: {
  closeOverlay?: () => void;
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<InputRef>(null);
  const { toSpecifiedConversation } = useConversationToggle();
  const selfInfo = useUserStore((state) => state.selfInfo);
  const resolveUserDisplayName = useUserDisplayNameResolver();

  const [keyword, setKeyword] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [friends, setFriends] = useState<FriendUserItem[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  useEffect(() => {
    if (!keyword.trim()) {
      setFriends([]);
      setGroups([]);
      setMessages([]);
      setFiles([]);
      return;
    }

    const delayDebounce = setTimeout(() => {
      handleSearch();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [keyword]);

  const handleSearch = async () => {
    setLoading(true);
    const trimmed = keyword.trim();
    try {
      const [friendsRes, groupsRes, messagesRes, filesRes] = await Promise.all([
        IMSDK.searchFriends({
          keywordList: [trimmed],
          isSearchUserID: true,
          isSearchNickname: true,
          isSearchRemark: true,
        }).catch(() => ({ data: [] })),
        IMSDK.searchGroups({
          keywordList: [trimmed],
          isSearchGroupID: true,
          isSearchGroupName: true,
        }).catch(() => ({ data: [] })),
        IMSDK.searchLocalMessages({
          conversationID: "",
          keywordList: [trimmed],
          pageIndex: 1,
          count: 50,
        }).catch(() => ({ data: { searchResultItems: [] } })),
        IMSDK.searchLocalMessages({
          conversationID: "",
          keywordList: [trimmed],
          messageTypeList: [MessageType.FileMessage],
          pageIndex: 1,
          count: 50,
        }).catch(() => ({ data: { searchResultItems: [] } })),
      ]);

      setFriends(friendsRes.data || []);
      setGroups(groupsRes.data || []);
      setMessages(messagesRes.data?.searchResultItems || []);
      setFiles(filesRes.data?.searchResultItems || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = useCallback(
    async (type: "contact" | "group" | "message", item: any) => {
      closeOverlay?.();
      if (type === "contact") {
        toSpecifiedConversation({
          sourceID: item.userID,
          sessionType: 1,
        });
      } else if (type === "group") {
        toSpecifiedConversation({
          sourceID: item.groupID,
          sessionType: 3,
        });
      } else if (type === "message") {
        // Find conversation in store first
        const conversation = useConversationStore
          .getState()
          .conversationList.find((c) => c.conversationID === item.conversationID);
        if (conversation) {
          useConversationStore
            .getState()
            .updateCurrentConversation({ ...conversation });
          window.location.hash = `#/chat/${conversation.conversationID}`;
        } else {
          // Find correct sourceID (userID or groupID) from the message item
          const firstMsg = item.messageList?.[0];
          if (firstMsg) {
            const isGroup = item.conversationType === 3;
            const sourceID = isGroup
              ? firstMsg.groupID
              : firstMsg.sendID === selfInfo.userID
              ? firstMsg.recvID
              : firstMsg.sendID;

            toSpecifiedConversation({
              sourceID,
              sessionType: item.conversationType,
            });
          }
        }
      }
    },
    [toSpecifiedConversation, selfInfo, closeOverlay],
  );

  const tabList = [
    { key: "overview", label: "综合" },
    { key: "contacts", label: "联系人" },
    { key: "groups", label: "我的群组" },
    { key: "history", label: "聊天记录" },
    { key: "files", label: "文档" },
  ];

  const renderSectionHeader = (title: string) => (
    <div className="border-y border-gray-100 bg-surface px-5 py-2.5 text-xs font-bold text-muted-foreground">
      {title}
    </div>
  );

  const renderFriendItem = (friend: FriendUserItem) => {
    const displayName = resolveUserDisplayName(friend);
    return (
      <div
        key={friend.userID}
        className="flex cursor-pointer items-center border-b border-gray-100 px-6 py-3 transition-colors hover:bg-surface active:bg-gray-100"
        onClick={() => handleItemClick("contact", friend)}
      >
        <OIMAvatar src={friend.faceURL} text={displayName} size={38} />
        <div className="ml-3">
          <div className="text-sm font-bold text-foreground">{displayName}</div>
          {friend.remark && friend.remark !== friend.nickname && (
            <div className="text-xs text-muted-foreground">{friend.nickname}</div>
          )}
        </div>
      </div>
    );
  };

  const renderGroupItem = (group: any) => (
    <div
      key={group.groupID}
      className="flex cursor-pointer items-center border-b border-gray-100 px-6 py-3 transition-colors hover:bg-surface active:bg-gray-100"
      onClick={() => handleItemClick("group", group)}
    >
      <OIMAvatar src={group.faceURL} text={group.groupName} isgroup size={38} />
      <div className="ml-3">
        <div className="text-sm font-bold text-foreground">{group.groupName}</div>
        <div className="text-xs text-muted-foreground">ID: {group.groupID}</div>
      </div>
    </div>
  );

  const renderMessageItem = (msgItem: any) => (
    <div
      key={msgItem.conversationID}
      className="flex cursor-pointer items-center border-b border-gray-100 px-6 py-3 transition-colors hover:bg-surface active:bg-gray-100"
      onClick={() => handleItemClick("message", msgItem)}
    >
      <OIMAvatar
        src={msgItem.faceURL}
        text={msgItem.showName}
        isgroup={msgItem.conversationType === 3}
        size={38}
      />
      <div className="ml-3 flex-1 overflow-hidden">
        <div className="text-sm font-bold text-foreground">{msgItem.showName}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {msgItem.messageCount} 条相关聊天记录
        </div>
      </div>
    </div>
  );

  const renderFileItem = (fileItem: any) => {
    const firstFileMsg = fileItem.messageList?.[0];
    const fileName = firstFileMsg?.fileElem?.fileName || "文件";
    const fileSize = firstFileMsg?.fileElem?.fileSize
      ? bytesToSize(firstFileMsg.fileElem.fileSize)
      : "";

    return (
      <div
        key={fileItem.conversationID}
        className="flex cursor-pointer items-center border-b border-gray-100 px-6 py-3 transition-colors hover:bg-surface active:bg-gray-100"
        onClick={() => handleItemClick("message", fileItem)}
      >
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-surface-border bg-surface text-lg text-foreground shadow-sm">
          <FileTextOutlined rev={undefined} />
        </div>
        <div className="ml-3 flex-1 overflow-hidden">
          <div className="truncate text-sm font-bold text-foreground">{fileName}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {fileSize ? `${fileSize} • ` : ""}来自 {fileItem.showName}
          </div>
        </div>
      </div>
    );
  };

  const renderOverview = () => {
    const hasAnyResults =
      friends.length > 0 ||
      groups.length > 0 ||
      messages.length > 0 ||
      files.length > 0;

    if (!hasAnyResults) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-12" />;
    }

    return (
      <div className="no-scrollbar max-h-[420px] flex-1 overflow-y-auto">
        {friends.length > 0 && (
          <div>
            {renderSectionHeader("联系人")}
            {friends.slice(0, 3).map(renderFriendItem)}
          </div>
        )}
        {groups.length > 0 && (
          <div>
            {renderSectionHeader("我的群组")}
            {groups.slice(0, 3).map(renderGroupItem)}
          </div>
        )}
        {messages.length > 0 && (
          <div>
            {renderSectionHeader("聊天记录")}
            {messages.slice(0, 3).map(renderMessageItem)}
          </div>
        )}
        {files.length > 0 && (
          <div>
            {renderSectionHeader("文档")}
            {files.slice(0, 3).map(renderFileItem)}
          </div>
        )}
      </div>
    );
  };

  const renderActiveTabContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Spin size="large" />
        </div>
      );
    }

    switch (activeTab) {
      case "overview":
        return renderOverview();
      case "contacts":
        return friends.length > 0 ? (
          <div className="no-scrollbar max-h-[420px] flex-1 overflow-y-auto">
            {friends.map(renderFriendItem)}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-12" />
        );
      case "groups":
        return groups.length > 0 ? (
          <div className="no-scrollbar max-h-[420px] flex-1 overflow-y-auto">
            {groups.map(renderGroupItem)}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-12" />
        );
      case "history":
        return messages.length > 0 ? (
          <div className="no-scrollbar max-h-[420px] flex-1 overflow-y-auto">
            {messages.map(renderMessageItem)}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-12" />
        );
      case "files":
        return files.length > 0 ? (
          <div className="no-scrollbar max-h-[420px] flex-1 overflow-y-auto">
            {files.map(renderFileItem)}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-12" />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-[540px] flex-col overflow-hidden rounded-lg bg-white">
      {/* Search Input Header */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-white p-4.5">
        <SearchOutlined rev={undefined} className="ml-2 text-lg text-gray-400" />
        <Input
          ref={inputRef}
          placeholder="搜索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          bordered={false}
          className="flex-1 p-0 text-sm hover:bg-transparent focus:ring-0"
          allowClear
          spellCheck={false}
        />
        <CloseOutlined
          rev={undefined}
          className="mr-2 cursor-pointer text-base text-gray-400 transition-colors hover:text-red-500"
          onClick={closeOverlay}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-8 border-b border-gray-100 bg-white px-6 pt-3 text-xs text-muted-foreground">
        {tabList.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <div
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`cursor-pointer border-b-2 pb-2.5 font-bold transition-all ${
                active
                  ? "border-brand text-brand"
                  : "border-transparent hover:text-foreground"
              }`}
            >
              {tab.label}
            </div>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-page-canvas">
        {!keyword.trim() ? (
          <div className="flex h-full flex-col items-center justify-center p-10 text-muted-foreground">
            <SearchOutlined rev={undefined} className="mb-3 text-4xl text-gray-200" />
            <div className="text-sm font-medium">
              输入关键词搜索联系人、我的群组、聊天记录和文档
            </div>
          </div>
        ) : (
          renderActiveTabContent()
        )}
      </div>
    </div>
  );
};

import { CloseOutlined, SearchOutlined, MessageFilled, FileTextOutlined } from "@ant-design/icons";
import { MessageType } from "@openim/wasm-client-sdk";
import { Empty, Input, Modal, Spin, InputRef } from "antd";
import { forwardRef, ForwardRefRenderFunction, memo, useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

import OIMAvatar from "@/components/OIMAvatar";
import { useConversationToggle } from "@/hooks/useConversationToggle";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import { bytesToSize } from "@/utils/common";

import { OverlayVisibleHandle, useOverlayVisible } from "../../hooks/useOverlayVisible";

const GlobalSearchModal: ForwardRefRenderFunction<OverlayVisibleHandle, unknown> = (_, ref) => {
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

export const GlobalSearchContent = ({ closeOverlay }: { closeOverlay?: () => void }) => {
  const { t } = useTranslation();
  const inputRef = useRef<InputRef>(null);
  const { toSpecifiedConversation } = useConversationToggle();
  const selfInfo = useUserStore((state) => state.selfInfo);
  
  const [keyword, setKeyword] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [friends, setFriends] = useState<any[]>([]);
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

  const handleItemClick = useCallback(async (type: "contact" | "group" | "message", item: any) => {
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
      const conversation = useConversationStore.getState().conversationList.find(
        (c) => c.conversationID === item.conversationID
      );
      if (conversation) {
        useConversationStore.getState().updateCurrentConversation({ ...conversation });
        window.location.hash = `#/chat/${conversation.conversationID}`;
      } else {
        // Find correct sourceID (userID or groupID) from the message item
        const firstMsg = item.messageList?.[0];
        if (firstMsg) {
          const isGroup = item.conversationType === 3;
          const sourceID = isGroup 
            ? firstMsg.groupID 
            : (firstMsg.sendID === selfInfo.userID ? firstMsg.recvID : firstMsg.sendID);
          
          toSpecifiedConversation({
            sourceID,
            sessionType: item.conversationType,
          });
        }
      }
    }
  }, [toSpecifiedConversation, selfInfo, closeOverlay]);

  const tabList = [
    { key: "overview", label: "综合" },
    { key: "contacts", label: "联系人" },
    { key: "groups", label: "我的群组" },
    { key: "history", label: "聊天记录" },
    { key: "files", label: "文档" },
  ];

  const renderSectionHeader = (title: string) => (
    <div className="px-5 py-2.5 text-xs font-bold text-[#8e9aaf] bg-gray-50 border-y border-gray-100">
      {title}
    </div>
  );

  const renderFriendItem = (friend: any) => (
    <div
      key={friend.userID}
      className="flex items-center px-6 py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100"
      onClick={() => handleItemClick("contact", friend)}
    >
      <OIMAvatar src={friend.faceURL} text={friend.nickname} size={38} />
      <div className="ml-3">
        <div className="text-sm font-bold text-[#0c1c33]">{friend.nickname}</div>
        {friend.remark && <div className="text-xs text-[#8e9aaf]">备注: {friend.remark}</div>}
      </div>
    </div>
  );

  const renderGroupItem = (group: any) => (
    <div
      key={group.groupID}
      className="flex items-center px-6 py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100"
      onClick={() => handleItemClick("group", group)}
    >
      <OIMAvatar src={group.faceURL} text={group.groupName} isgroup size={38} />
      <div className="ml-3">
        <div className="text-sm font-bold text-[#0c1c33]">{group.groupName}</div>
        <div className="text-xs text-[#8e9aaf]">ID: {group.groupID}</div>
      </div>
    </div>
  );

  const renderMessageItem = (msgItem: any) => (
    <div
      key={msgItem.conversationID}
      className="flex items-center px-6 py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100"
      onClick={() => handleItemClick("message", msgItem)}
    >
      <OIMAvatar
        src={msgItem.faceURL}
        text={msgItem.showName}
        isgroup={msgItem.conversationType === 3}
        size={38}
      />
      <div className="ml-3 flex-1 overflow-hidden">
        <div className="text-sm font-bold text-[#0c1c33]">{msgItem.showName}</div>
        <div className="text-xs text-[#8e9aaf] truncate mt-0.5">
          {msgItem.messageCount} 条相关聊天记录
        </div>
      </div>
    </div>
  );

  const renderFileItem = (fileItem: any) => {
    const firstFileMsg = fileItem.messageList?.[0];
    const fileName = firstFileMsg?.fileElem?.fileName || "文件";
    const fileSize = firstFileMsg?.fileElem?.fileSize ? bytesToSize(firstFileMsg.fileElem.fileSize) : "";
    
    return (
      <div
        key={fileItem.conversationID}
        className="flex items-center px-6 py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100"
        onClick={() => handleItemClick("message", fileItem)}
      >
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded bg-blue-50 text-blue-500 text-lg">
          <FileTextOutlined rev={undefined} />
        </div>
        <div className="ml-3 flex-1 overflow-hidden">
          <div className="text-sm font-bold text-[#0c1c33] truncate">{fileName}</div>
          <div className="text-xs text-[#8e9aaf] mt-0.5">
            {fileSize ? `${fileSize} • ` : ""}来自 {fileItem.showName}
          </div>
        </div>
      </div>
    );
  };

  const renderOverview = () => {
    const hasAnyResults = friends.length > 0 || groups.length > 0 || messages.length > 0 || files.length > 0;
    
    if (!hasAnyResults) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-12" />;
    }

    return (
      <div className="flex-1 overflow-y-auto no-scrollbar max-h-[420px]">
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
        <div className="flex justify-center items-center py-20">
          <Spin size="large" />
        </div>
      );
    }

    switch (activeTab) {
      case "overview":
        return renderOverview();
      case "contacts":
        return friends.length > 0 ? (
          <div className="flex-1 overflow-y-auto no-scrollbar max-h-[420px]">{friends.map(renderFriendItem)}</div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-12" />
        );
      case "groups":
        return groups.length > 0 ? (
          <div className="flex-1 overflow-y-auto no-scrollbar max-h-[420px]">{groups.map(renderGroupItem)}</div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-12" />
        );
      case "history":
        return messages.length > 0 ? (
          <div className="flex-1 overflow-y-auto no-scrollbar max-h-[420px]">{messages.map(renderMessageItem)}</div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-12" />
        );
      case "files":
        return files.length > 0 ? (
          <div className="flex-1 overflow-y-auto no-scrollbar max-h-[420px]">{files.map(renderFileItem)}</div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-12" />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col bg-white rounded-lg overflow-hidden h-[540px]">
      {/* Search Input Header */}
      <div className="flex items-center gap-3 border-b border-gray-100 p-4.5 bg-white">
        <SearchOutlined rev={undefined} className="text-gray-400 text-lg ml-2" />
        <Input
          ref={inputRef}
          placeholder="搜索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          bordered={false}
          className="flex-1 text-sm focus:ring-0 p-0 hover:bg-transparent"
          allowClear
          spellCheck={false}
        />
        <CloseOutlined
          rev={undefined}
          className="cursor-pointer text-gray-400 hover:text-red-500 mr-2 text-base transition-colors"
          onClick={closeOverlay}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-6 pt-3 gap-8 text-xs text-[#8e9aaf] bg-white">
        {tabList.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <div
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`cursor-pointer pb-2.5 font-bold transition-all border-b-2 ${
                active ? "border-[#3072ff] text-[#3072ff]" : "border-transparent hover:text-[#0c1c33]"
              }`}
            >
              {tab.label}
            </div>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 bg-[#f8f9fa] overflow-y-auto">
        {!keyword.trim() ? (
          <div className="flex flex-col items-center justify-center h-full text-[#8e9aaf] p-10">
            <SearchOutlined rev={undefined} className="text-4xl mb-3 text-gray-200" />
            <div className="text-sm font-medium">输入关键词搜索联系人、我的群组、聊天记录和文档</div>
          </div>
        ) : (
          renderActiveTabContent()
        )}
      </div>
    </div>
  );
};

import { MessageItem, MessageType } from "@openim/wasm-client-sdk";
import { Drawer, Empty, Spin, Tabs } from "antd";
import { t } from "i18next";
import { forwardRef, ForwardRefRenderFunction, memo, useEffect, useState } from "react";

import { OverlayVisibleHandle, useOverlayVisible } from "@/hooks/useOverlayVisible";
import { IMSDK } from "@/layout/MainContentWrap";
import { bytesToSize } from "@/utils/common";

interface ISearchHistoryProps {
  conversationID?: string;
}

const SearchHistory: ForwardRefRenderFunction<
  OverlayVisibleHandle,
  ISearchHistoryProps
> = ({ conversationID }, ref) => {
  const { isOverlayOpen, closeOverlay } = useOverlayVisible(ref);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string, MessageItem[]>>({
    msg: [],
    pic: [],
    video: [],
    file: [],
  });

  useEffect(() => {
    if (isOverlayOpen && conversationID) {
      fetchAllHistory();
    }
  }, [isOverlayOpen, conversationID]);

  const fetchAllHistory = async () => {
    setLoading(true);
    try {
      const types = [
        { key: "msg", list: [MessageType.TextMessage] },
        { key: "pic", list: [MessageType.PictureMessage] },
        { key: "video", list: [MessageType.VideoMessage] },
        { key: "file", list: [MessageType.FileMessage] },
      ];

      const results: Record<string, MessageItem[]> = {};
      await Promise.all(
        types.map(async (type) => {
          try {
            const { data: searchResult } = await IMSDK.searchLocalMessages({
              conversationID: conversationID!,
              keywordList: [],
              messageTypeList: type.list,
              pageIndex: 1,
              count: 100,
            });
            results[type.key] = searchResult.searchResultItems?.[0]?.messageList || [];
          } catch (e) {
            results[type.key] = [];
          }
        }),
      );
      setData(results);
    } catch (error) {
      console.error("Search failed", error);
    }
    setLoading(false);
  };

  const renderContent = (type: string) => {
    const list = data[type];
    if (loading)
      return (
        <div className="p-10 text-center">
          <Spin />
        </div>
      );
    if (!list || list.length === 0)
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

    return (
      <div className="no-scrollbar flex h-full flex-col gap-2 overflow-y-auto p-4">
        {list.map((msg) => (
          <div key={msg.clientMsgID} className="border-b border-gray-100 pb-2">
            {type === "msg" && <div className="text-sm">{msg.textElem?.content}</div>}
            {type === "pic" && (
              <img
                src={
                  msg.pictureElem?.snapshotPicture?.url ||
                  msg.pictureElem?.sourcePicture?.url
                }
                className="h-20 w-20 cursor-pointer rounded object-cover"
                alt=""
                onClick={() => window.open(msg.pictureElem?.sourcePicture?.url)}
              />
            )}
            {type === "video" && (
              <div
                className="relative flex h-20 w-32 cursor-pointer items-center justify-center rounded bg-black/10"
                onClick={() => window.open(msg.videoElem?.videoUrl)}
              >
                {msg.videoElem?.snapshotUrl && (
                  <img
                    src={msg.videoElem?.snapshotUrl}
                    className="h-full w-full rounded object-cover"
                    alt=""
                  />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                  ▶
                </span>
              </div>
            )}
            {type === "file" && (
              <div
                className="cursor-pointer text-sm font-medium text-blue-500 hover:underline"
                onClick={() => window.open(msg.fileElem?.sourceUrl)}
              >
                {msg.fileElem?.fileName} ({bytesToSize(msg.fileElem?.fileSize || 0)})
              </div>
            )}
            <div className="mt-1 text-[10px] text-gray-400">
              {new Date(msg.sendTime).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const items = [
    { key: "msg", label: t("placeholder.chat"), children: renderContent("msg") },
    { key: "pic", label: t("placeholder.image"), children: renderContent("pic") },
    { key: "video", label: t("placeholder.video"), children: renderContent("video") },
    { key: "file", label: t("placeholder.file"), children: renderContent("file") },
  ];

  return (
    <Drawer
      title={t("placeholder.messageHistory")}
      placement="right"
      rootClassName="chat-drawer"
      destroyOnClose
      onClose={closeOverlay}
      open={isOverlayOpen}
      width={450}
      getContainer={"#chat-container"}
    >
      <Tabs defaultActiveKey="msg" items={items} className="px-4" />
    </Drawer>
  );
};

export default memo(forwardRef(SearchHistory));

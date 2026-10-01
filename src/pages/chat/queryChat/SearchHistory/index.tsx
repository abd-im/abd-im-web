import { MessageItem, MessageType } from "@abd-im/wasm-client-sdk";
import { t } from "i18next";
import { X } from "lucide-react";
import { Tabs } from "radix-ui";
import { forwardRef, ForwardRefRenderFunction, memo, useEffect, useState } from "react";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  Spinner,
} from "@/components/ui";
import { OverlayVisibleHandle, useOverlayVisible } from "@/hooks/useOverlayVisible";
import { IMSDK } from "@/layout/MainContentWrap";

import FileMessageRender from "../MessageItem/FileMessageRender";
import MediaMessageRender from "../MessageItem/MediaMessageRender";
import VideoMessageRender from "../MessageItem/VideoMessageRender";

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
          <Spinner />
        </div>
      );
    if (!list || list.length === 0)
      return (
        <p className="p-10 text-center text-sm text-muted-foreground">
          {t("placeholder.noData")}
        </p>
      );

    return (
      <div className="no-scrollbar flex h-full flex-col gap-2 overflow-y-auto p-4">
        {list
          .filter((msg) => !msg.attachedInfoElem?.isPrivateChat)
          .map((msg) => (
            <div key={msg.clientMsgID} className="border-b border-gray-100 pb-2">
              {type === "msg" && <div className="text-sm">{msg.textElem?.content}</div>}
              {type === "pic" && <MediaMessageRender message={msg} />}
              {type === "video" && <VideoMessageRender message={msg} />}
              {type === "file" && <FileMessageRender message={msg} />}
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
    <Dialog open={isOverlayOpen} onOpenChange={(open) => !open && closeOverlay()}>
      <DialogContent className="ui-dialog-sheet">
        <header className="flex items-center justify-between gap-3">
          <DialogTitle className="text-base font-semibold">
            {t("placeholder.messageHistory")}
          </DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label={t("close")}>
              <X />
            </Button>
          </DialogClose>
        </header>
        <Tabs.Root defaultValue="msg" className="flex min-h-0 flex-1 flex-col">
          <Tabs.List
            className="ui-tabs-list"
            aria-label={t("placeholder.messageHistory")}
          >
            {items.map((item) => (
              <Tabs.Trigger key={item.key} className="ui-tabs-trigger" value={item.key}>
                {item.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {items.map((item) => (
            <Tabs.Content
              key={item.key}
              className="min-h-0 flex-1 overflow-auto"
              value={item.key}
            >
              {item.children}
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </DialogContent>
    </Dialog>
  );
};

export default memo(forwardRef(SearchHistory));

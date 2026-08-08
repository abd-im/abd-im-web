import { SyncOutlined, WarningOutlined } from "@ant-design/icons";
import clsx from "clsx";
import { t } from "i18next";
import { useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import sync from "@/assets/images/common/sync.png";
import sync_error from "@/assets/images/common/sync_error.png";
import FlexibleSider from "@/components/FlexibleSider";
import { splitConversationList } from "@/features/agentWorkspace/conversationLists";
import { useConversationStore, useUserStore } from "@/store";

import ConversationItemComp from "./ConversationItem";
import styles from "./index.module.scss";

const ConnectBar = () => {
  const userStore = useUserStore();
  const showLoading =
    userStore.syncState === "loading" || userStore.connectState === "loading";
  const showFailed =
    userStore.syncState === "failed" || userStore.connectState === "failed";

  const loadingTip =
    userStore.syncState === "loading" ? t("connect.syncing") : t("connect.connecting");

  const errorTip =
    userStore.syncState === "failed"
      ? t("connect.syncFailed")
      : t("connect.connectFailed");

  if (userStore.reinstall) {
    return null;
  }

  return (
    <>
      {showLoading && (
        <div className="flex h-7 items-center justify-center border-b border-surface-border bg-surface px-2 text-foreground">
          <SyncOutlined spin className="mr-1.5 text-xs text-foreground" />
          <span className="text-xs font-medium text-foreground">{loadingTip}</span>
        </div>
      )}
      {showFailed && (
        <div className="flex h-7 items-center justify-center border-b border-red-500/20 bg-red-500/10 px-2 text-red-600">
          <WarningOutlined className="mr-1.5 text-xs text-red-600" />
          <span className="text-xs font-medium text-red-600">{errorTip}</span>
        </div>
      )}
    </>
  );
};

const ConversationSider = () => {
  const { conversationID } = useParams();
  const conversationList = useConversationStore((state) => state.conversationList);
  const conversationKinds = useConversationStore((state) => state.conversationKinds);
  const chatConversationList = useMemo(
    () => splitConversationList(conversationList, conversationKinds).chat,
    [conversationKinds, conversationList],
  );
  const getConversationListByReq = useConversationStore(
    (state) => state.getConversationListByReq,
  );
  const virtuoso = useRef<VirtuosoHandle>(null);
  const hasmore = useRef(true);
  const loading = useRef(false);

  const endReached = async () => {
    if (!hasmore.current || loading.current) return;
    loading.current = true;
    hasmore.current = await getConversationListByReq(true);
    loading.current = false;
  };

  return (
    <div>
      <ConnectBar />
      <FlexibleSider
        needHidden={Boolean(conversationID)}
        wrapClassName="left-2 right-2 top-1.5 flex flex-col"
      >
        <Virtuoso
          className="flex-1"
          data={chatConversationList}
          ref={virtuoso}
          endReached={endReached}
          computeItemKey={(_, item) => item.conversationID}
          itemContent={(_, conversation) => (
            <ConversationItemComp
              isActive={conversationID === conversation.conversationID}
              conversation={conversation}
            />
          )}
        />
      </FlexibleSider>
    </div>
  );
};

export default ConversationSider;

import { useMount } from "ahooks";
import { Layout, Spin } from "antd";
import { t } from "i18next";
import { Outlet, useMatches, useNavigate } from "react-router-dom";

import { CallProvider, CallHost } from "@/features/call/CallProvider";

import { useUserStore } from "@/store";

import LeftNavBar from "./LeftNavBar";
import TopSearchBar from "./TopSearchBar";
import { useGlobalEvent } from "./useGlobalEvents";

export const MainContentLayout = () => {
  useGlobalEvent();
  const matches = useMatches();
  const navigate = useNavigate();

  const progress = useUserStore((state) => state.progress);
  const syncState = useUserStore((state) => state.syncState);
  const reinstall = useUserStore((state) => state.reinstall);
  const isLogining = useUserStore((state) => state.isLogining);

  useMount(() => {
    const isRoot = !matches.find((item) => item.pathname !== "/");
    if (isRoot) {
      navigate("chat", {
        replace: true,
      });
    }
  });

  const loadingTip = isLogining ? t("toast.loading") : `${progress}%`;
  const showLockLoading = isLogining || (reinstall && syncState === "loading");

  return (
    <CallProvider>
      <Spin className="!max-h-none" spinning={showLockLoading} tip={loadingTip}>
        <Layout className="h-full">
          <TopSearchBar />
          <Layout className="workspace-main">
            <LeftNavBar />
            <div className="workspace-content">
              <Outlet />
            </div>
          </Layout>
          <CallHost />
        </Layout>
      </Spin>
    </CallProvider>
  );
};

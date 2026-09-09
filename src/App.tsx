import { App as AntdApp, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "react-query";
import { ReactQueryDevtools } from "react-query/devtools";
import { RouterProvider } from "react-router-dom";

import AntdGlobalComp from "./AntdGlobalComp";
import AppUpdateBar, { MandatoryUpdate } from "./components/AppUpdateBar";
import { useDesktopUpdates } from "./hooks/useDesktopUpdates";
import router from "./routes";
import { AppearanceProvider } from "./components/ui/theme";
import { useUserStore } from "./store";

function App() {
  useDesktopUpdates();
  const locale = useUserStore((state) => state.appSettings.locale);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
      },
    },
  });

  return (
    <ConfigProvider
      autoInsertSpaceInButton={false}
      locale={locale === "zh-CN" ? zhCN : enUS}
    >
      <AppearanceProvider>
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<div>loading...</div>}>
            <AntdApp>
              <AntdGlobalComp />
              <RouterProvider router={router} />
              <AppUpdateBar />
              <MandatoryUpdate />
            </AntdApp>
          </Suspense>
          {import.meta.env.DEV && import.meta.env.VITE_QUERY_DEVTOOLS === "true" && (
            <ReactQueryDevtools initialIsOpen={false} position="bottom-right" />
          )}
        </QueryClientProvider>
      </AppearanceProvider>
    </ConfigProvider>
  );
}

export default App;

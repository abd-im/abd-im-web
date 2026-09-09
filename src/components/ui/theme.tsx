import { ConfigProvider, theme } from "antd";
import { type PropsWithChildren, useEffect, useState } from "react";

export function AppearanceProvider({ children }: PropsWithChildren) {
  const [dark] = useState(() => {
    const stored = localStorage.getItem("abd-im-theme");
    return stored
      ? stored === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("abd-im-theme", dark ? "dark" : "light");
  }, [dark]);
  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: dark ? "#d4d4d8" : "#292a2e",
          colorLink: dark ? "#82a7e8" : "#3869b4",
          colorText: dark ? "#e6e6e8" : "#242529",
          colorTextSecondary: dark ? "#a0a0a8" : "#71717a",
          colorBgContainer: dark ? "#232428" : "#ffffff",
          colorBgElevated: dark ? "#292a2e" : "#ffffff",
          colorBorder: dark ? "#38393e" : "#e4e4e7",
          borderRadius: 6,
          borderRadiusLG: 8,
          controlHeight: 32,
          fontSize: 13,
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Button: { primaryColor: dark ? "#202124" : "#ffffff" },
          Modal: { borderRadiusLG: 8 },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}

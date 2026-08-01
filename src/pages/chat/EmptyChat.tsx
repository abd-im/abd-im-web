import { MessageOutlined } from "@ant-design/icons";
import { Layout } from "antd";

export const EmptyChat = () => {
  return (
    <Layout className="no-mobile flex h-full items-center justify-center bg-page-canvas text-foreground">
      <div className="flex flex-col items-center justify-center text-center p-8 select-none">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface border border-surface-border shadow-sm text-muted-foreground">
          <MessageOutlined className="text-2xl" />
        </div>
        <div className="text-sm font-medium text-muted-foreground">
          选择左侧对话开启沟通
        </div>
      </div>
    </Layout>
  );
};

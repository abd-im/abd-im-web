import { RightOutlined, UserOutlined } from "@ant-design/icons";

import { ChooseMenuItem } from ".";

const MenuItem = ({
  menu,
  menuClick,
}: {
  menu: ChooseMenuItem;
  menuClick: (idx: number) => void;
}) => (
  <div
    className="mx-2 flex items-center justify-between rounded-md px-3.5 py-2.5 hover:bg-surface-hover cursor-pointer text-foreground"
    key={menu.idx}
    onClick={() => menuClick(menu.idx)}
  >
    <div className="flex items-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface border border-surface-border shadow-sm text-foreground">
        <UserOutlined className="text-lg" />
      </div>
      <div className="ml-3.5 font-medium">{menu.title}</div>
    </div>
    <RightOutlined className="text-muted-foreground text-xs" rev={undefined} />
  </div>
);

export default MenuItem;

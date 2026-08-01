import { TeamOutlined, UserOutlined } from "@ant-design/icons";
import { Avatar as AntdAvatar, AvatarProps } from "antd";
import clsx from "clsx";
import * as React from "react";
import { useMemo } from "react";

import { avatarList, getDefaultAvatar } from "@/utils/avatar";

const default_avatars = avatarList.map((item) => item.name);

interface IOIMAvatarProps extends AvatarProps {
  text?: string;
  color?: string;
  bgColor?: string;
  isgroup?: boolean;
  isnotification?: boolean;
  size?: number;
}

// Artistic White-Background Black-Text Avatar Style
const MONOCHROME_AVATAR_BG = "#ffffff";

const OIMAvatar: React.FC<IOIMAvatarProps> = (props) => {
  const {
    src,
    text,
    size = 42,
    color = "#09090b",
    bgColor,
    isgroup = false,
    isnotification,
  } = props;
  const [hasError, setHasError] = React.useState(false);

  const firstLetter = useMemo(() => {
    if (!text) return "";
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : "";
  }, [text]);

  const computedBgColor = useMemo(() => {
    return MONOCHROME_AVATAR_BG;
  }, []);

  const getAvatarUrl = useMemo(() => {
    if (src && !hasError) {
      if (default_avatars.includes(src as string))
        return getDefaultAvatar(src as string);

      return src;
    }
    return undefined;
  }, [src, hasError]);

  const avatarProps = { ...props, isgroup: undefined, isnotification: undefined };

  React.useEffect(() => {
    setHasError(false);
  }, [src]);

  const fallbackIcon = useMemo(() => {
    if (isgroup) return <TeamOutlined className="text-lg text-foreground" />;
    if (firstLetter) return firstLetter;
    return <UserOutlined className="text-lg text-foreground" />;
  }, [firstLetter, isgroup]);

  return (
    <AntdAvatar
      style={{
        backgroundColor: computedBgColor,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        lineHeight: `${size - 2}px`,
        color,
      }}
      shape="square"
      {...avatarProps}
      className={clsx(
        "rounded-lg font-serif italic font-bold shadow-sm border border-surface-border select-none flex items-center justify-center",
        {
          "cursor-pointer": Boolean(props.onClick),
        },
        props.className,
      )}
      src={getAvatarUrl}
      onError={() => {
        setHasError(true);
        return true;
      }}
    >
      {fallbackIcon}
    </AntdAvatar>
  );
};

export default OIMAvatar;

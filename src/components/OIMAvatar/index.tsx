import { Users, UserRound } from "lucide-react";
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

const AVATAR_TONES = ["#e7edf5", "#ece8f0", "#e6eeea", "#f0e9e5", "#e8eaed"];

const OIMAvatar: React.FC<IOIMAvatarProps> = (props) => {
  const {
    src,
    text,
    size = 42,
    color = "#424750",
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
    const hash = Array.from(text || "").reduce(
      (sum, char) => sum + char.charCodeAt(0),
      0,
    );
    return bgColor || AVATAR_TONES[hash % AVATAR_TONES.length];
  }, [bgColor, text]);

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
    if (isgroup) return <Users size={Math.round(size * 0.48)} strokeWidth={1.6} />;
    if (firstLetter) return firstLetter;
    return <UserRound size={Math.round(size * 0.48)} strokeWidth={1.6} />;
  }, [firstLetter, isgroup, size]);

  return (
    <AntdAvatar
      style={{
        backgroundColor: computedBgColor,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        lineHeight: `${size - 2}px`,
        color,
        borderRadius: "var(--radius-control)",
        fontSize: Math.round(size * 0.38),
      }}
      shape="square"
      {...avatarProps}
      className={clsx(
        "flex shrink-0 select-none items-center justify-center font-medium",
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

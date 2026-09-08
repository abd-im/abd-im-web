import { FriendUserItem } from "@abd-im/wasm-client-sdk/lib/types/entity";

import OIMAvatar from "@/components/OIMAvatar";
import { useUserDisplayName } from "@/hooks/useUserDisplayName";

const FriendListItem = ({
  friend,
  showUserCard,
}: {
  friend: FriendUserItem;
  showUserCard: (userID: string) => void;
}) => {
  const displayName = useUserDisplayName(friend);

  return (
    <div
      className="flex cursor-pointer items-center rounded-md px-3.5 pb-3 pt-2.5 text-foreground transition-colors hover:bg-surface-hover"
      onClick={() => showUserCard(friend.userID)}
    >
      <OIMAvatar src={friend.faceURL} text={displayName} />
      <div className="ml-3 truncate text-sm">{displayName}</div>
    </div>
  );
};

export default FriendListItem;

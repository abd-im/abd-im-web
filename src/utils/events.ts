import { ChooseModalState } from "@/pages/common/ChooseModal";
import { CheckListItem } from "@/pages/common/ChooseModal/ChooseBox/CheckItem";
import mitt from "mitt";
import { GroupItem, MessageItem } from "@abd-im/wasm-client-sdk/lib/types/entity";
import { InviteData } from "@/pages/common/RtcCallModal/data";
import type { MessageReactionUpdatedEvent } from "@/api/messageReaction";

type EmitterEvents = {
  OPEN_USER_CARD: OpenUserCardParams;
  OPEN_GROUP_CARD: GroupItem;
  OPEN_CHOOSE_MODAL: ChooseModalState;
  CHAT_LIST_SCROLL_TO_BOTTOM: void;
  OPEN_RTC_MODAL: InviteData;
  // message store
  PUSH_NEW_MSG: MessageItem;
  UPDATE_ONE_MSG: MessageItem;
  MESSAGE_REACTION_UPDATED: MessageReactionUpdatedEvent;
  MESSAGE_REACTIONS_REFRESH: void;

  AGENT_USER_SELECTED: CheckListItem;
  SELECT_USER: SelectUserParams;
};

export type SelectUserParams = {
  notConversation: boolean;
  choosedList: CheckListItem[];
};

export type OpenUserCardParams = {
  userID?: string;
  groupID?: string;
  isSelf?: boolean;
  notAdd?: boolean;
};

const emitter = mitt<EmitterEvents>();

export const emit = emitter.emit;

export default emitter;

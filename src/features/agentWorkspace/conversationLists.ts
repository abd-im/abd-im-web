import { SessionType } from "@abd-im/wasm-client-sdk";
import type { ConversationItem } from "@abd-im/wasm-client-sdk/lib/types/entity";

import type { ConversationKind } from "./metadata";

export const splitConversationList = (
  list: ConversationItem[],
  kinds: Record<string, ConversationKind | undefined>,
) => {
  const chat: ConversationItem[] = [];
  const agent: ConversationItem[] = [];
  list.forEach((conversation) => {
    if (conversation.conversationType !== SessionType.WorkingGroup) {
      chat.push(conversation);
      return;
    }
    const kind = kinds[conversation.groupID];
    if (kind === "agent_workspace") agent.push(conversation);
    if (kind === "chat") chat.push(conversation);
  });
  return { chat, agent };
};

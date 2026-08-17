import { SessionType } from "@abd-im/wasm-client-sdk";
import type {
  ConversationItem,
  GroupItem,
  GroupMemberItem,
} from "@abd-im/wasm-client-sdk/lib/types/entity";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  getSpecifiedGroupsInfo: vi.fn(),
  getSpecifiedGroupMembersInfo: vi.fn(),
  subscribeUsersStatus: vi.fn(),
  unsubscribeUsersStatus: vi.fn(),
}));

vi.mock("@/layout/MainContentWrap", () => ({ IMSDK: sdk }));
vi.mock("@/utils/common", () => ({ feedbackToast: vi.fn() }));
vi.mock("./user", () => ({
  useUserStore: {
    getState: () => ({ selfInfo: { userID: "self-user" } }),
  },
}));

import { useConversationStore } from "./conversation";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const groupConversation = (groupID: string) =>
  ({
    conversationID: `sg_${groupID}`,
    conversationType: SessionType.Group,
    groupID,
  } as ConversationItem);

describe("conversation selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConversationStore.getState().clearConversationStore();
  });

  it("keeps the latest group selected when older metadata requests finish last", async () => {
    const firstGroupInfo = deferred<{ data: GroupItem[] }>();
    const secondGroupInfo = deferred<{ data: GroupItem[] }>();
    const firstMember = deferred<{ data: GroupMemberItem[] }>();
    const secondMember = deferred<{ data: GroupMemberItem[] }>();

    sdk.getSpecifiedGroupsInfo.mockImplementation(([groupID]: [string]) =>
      groupID === "group-a" ? firstGroupInfo.promise : secondGroupInfo.promise,
    );
    sdk.getSpecifiedGroupMembersInfo.mockImplementation(
      ({ groupID }: { groupID: string }) =>
        groupID === "group-a" ? firstMember.promise : secondMember.promise,
    );

    await useConversationStore
      .getState()
      .updateCurrentConversation(groupConversation("group-a"));
    await useConversationStore
      .getState()
      .updateCurrentConversation(groupConversation("group-b"));

    expect(useConversationStore.getState().currentConversation?.groupID).toBe(
      "group-b",
    );

    secondGroupInfo.resolve({ data: [{ groupID: "group-b" } as GroupItem] });
    secondMember.resolve({
      data: [{ groupID: "group-b", userID: "self-user" } as GroupMemberItem],
    });
    await Promise.all([secondGroupInfo.promise, secondMember.promise]);
    await Promise.resolve();

    expect(useConversationStore.getState().currentGroupInfo?.groupID).toBe("group-b");
    expect(useConversationStore.getState().currentMemberInGroup?.groupID).toBe(
      "group-b",
    );

    firstGroupInfo.resolve({ data: [{ groupID: "group-a" } as GroupItem] });
    firstMember.resolve({
      data: [{ groupID: "group-a", userID: "self-user" } as GroupMemberItem],
    });
    await Promise.all([firstGroupInfo.promise, firstMember.promise]);
    await Promise.resolve();

    expect(useConversationStore.getState().currentConversation?.groupID).toBe(
      "group-b",
    );
    expect(useConversationStore.getState().currentGroupInfo?.groupID).toBe("group-b");
    expect(useConversationStore.getState().currentMemberInGroup?.groupID).toBe(
      "group-b",
    );
  });
});

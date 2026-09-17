import type { GroupMessageReceiptInfo } from "@abd-im/wasm-client-sdk";
import { create } from "zustand";

export const useGroupReadReceiptStore = create<{
  groups: Record<string, GroupMessageReceiptInfo>;
  update: (receipt: GroupMessageReceiptInfo) => void;
  clear: () => void;
}>((set) => ({
  groups: {},
  update: (receipt) =>
    set((state) => ({
      groups: { ...state.groups, [receipt.conversationID]: receipt },
    })),
  clear: () => set({ groups: {} }),
}));

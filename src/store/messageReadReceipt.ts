import type { MessageReceiptInfo } from "@abd-im/wasm-client-sdk";
import { create } from "zustand";

export const useMessageReadReceiptStore = create<{
  conversations: Record<string, MessageReceiptInfo>;
  update: (receipt: MessageReceiptInfo) => void;
  clear: () => void;
}>((set) => ({
  conversations: {},
  update: (receipt) =>
    set((state) => ({
      conversations: {
        ...state.conversations,
        [receipt.conversationID]: receipt,
      },
    })),
  clear: () => set({ conversations: {} }),
}));

import { create } from "zustand";

import type { AttachmentType } from "@/pages/chat/queryChat/ChatFooter/attachmentType";
import { beginDesktopTask, canStartDesktopTask } from "@/utils/desktopTasks";

export interface ComposerAttachment {
  id: string;
  file: File;
  type: AttachmentType;
}

interface ComposerState {
  attachments: Record<string, ComposerAttachment[]>;
  sending: string[];
  add: (key: string, files: ComposerAttachment[]) => void;
  remove: (key: string, ids: string[]) => void;
  startSending: (key: string) => boolean;
  finishSending: (key: string) => void;
  clear: () => void;
}

let finishPendingTask: (() => void) | undefined;

// File objects live only for this app session, scoped by account + conversation.
// Keep drafts across route unmounts and protect them from update restarts.
export const useComposerStore = create<ComposerState>((set, get) => ({
  attachments: {},
  sending: [],
  add: (key, files) => {
    if (!files.length || !canStartDesktopTask() || get().sending.includes(key)) return;
    finishPendingTask ??= beginDesktopTask();
    set(({ attachments }) => ({
      attachments: { ...attachments, [key]: [...(attachments[key] || []), ...files] },
    }));
  },
  remove: (key, ids) => {
    const attachments = { ...get().attachments };
    const remaining = (attachments[key] || []).filter((item) => !ids.includes(item.id));
    if (remaining.length) attachments[key] = remaining;
    else delete attachments[key];
    set({ attachments });
    if (!Object.keys(attachments).length) {
      finishPendingTask?.();
      finishPendingTask = undefined;
    }
  },
  startSending: (key) => {
    if (!canStartDesktopTask() || get().sending.includes(key)) return false;
    set(({ sending }) => ({ sending: [...sending, key] }));
    return true;
  },
  finishSending: (key) =>
    set(({ sending }) => ({ sending: sending.filter((item) => item !== key) })),
  clear: () => {
    finishPendingTask?.();
    finishPendingTask = undefined;
    set({ attachments: {}, sending: [] });
  },
}));

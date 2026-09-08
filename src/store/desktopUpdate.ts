import { create } from "zustand";
import type { DesktopUpdateState } from "@/types/desktopUpdate";

export const useDesktopUpdate = create<{
  state?: DesktopUpdateState;
  open: boolean;
  setOpen: (open: boolean) => void;
  receive: (state: DesktopUpdateState) => void;
}>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  receive: (state) =>
    set((current) =>
      current.state && current.state.revision > state.revision
        ? current
        : {
            state,
            open:
              current.open ||
              state.error === "busy" ||
              state.error === "prepare" ||
              state.error === "install",
          },
    ),
}));

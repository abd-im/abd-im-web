import { useEffect } from "react";
import { useDesktopUpdate } from "@/store/desktopUpdate";
import { prepareDesktopExit, resumeDesktopTasks } from "@/utils/desktopTasks";

export function useDesktopUpdates() {
  useEffect(() => {
    const api = window.electronAPI?.updates;
    if (!api) return;
    let active = true;
    const receive = useDesktopUpdate.getState().receive;
    const unsubscribe = api.subscribe(receive);
    void api
      .getState()
      .then((state) => {
        if (active) receive(state);
      })
      .catch(() => undefined);
    const stopPrepare = api.onPrepare((id) => {
      void prepareDesktopExit()
        .then((result) => api.prepared(id, result))
        .catch(resumeDesktopTasks);
    });
    const stopResume = api.onResume(resumeDesktopTasks);
    const online = () => {
      void api.check().catch(() => undefined);
    };
    window.addEventListener("online", online);
    return () => {
      active = false;
      unsubscribe();
      stopPrepare();
      stopResume();
      window.removeEventListener("online", online);
      resumeDesktopTasks();
    };
  }, []);
}

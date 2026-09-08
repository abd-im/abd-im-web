import { useEffect, useRef, useState } from "react";
import { registerDraftSaver, canStartDesktopTask } from "@/utils/desktopTasks";

export function useDesktopDraft(key: string): [string, (value: string) => void] {
  const read = () => {
    try {
      return localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  };
  const [draft, setDraft] = useState(() => ({ key, value: read() }));
  const value = draft.key === key ? draft.value : read();
  const latest = useRef({ key, value });
  latest.current = { key, value };
  useEffect(
    () =>
      registerDraftSaver(() => {
        const current = latest.current;
        if (current.value) localStorage.setItem(current.key, current.value);
        else localStorage.removeItem(current.key);
      }),
    [],
  );
  return [
    value,
    (next) => {
      if (!canStartDesktopTask()) return;
      latest.current = { key, value: next };
      setDraft(latest.current);
      try {
        if (next) localStorage.setItem(key, next);
        else localStorage.removeItem(key);
      } catch {
        /* The exit saver retries and prevents installation if saving still fails. */
      }
    },
  ];
}

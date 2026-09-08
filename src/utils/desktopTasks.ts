type SaveDraft = () => void | Promise<void>;
const tasks = new Set<symbol>();
const draftSavers = new Set<SaveDraft>();
let frozen = false;

export function beginDesktopTask() {
  if (frozen) throw new Error("Application is preparing to exit");
  const id = Symbol();
  tasks.add(id);
  return () => {
    tasks.delete(id);
  };
}

export function registerDraftSaver(save: SaveDraft) {
  draftSavers.add(save);
  return () => {
    draftSavers.delete(save);
  };
}

export async function prepareDesktopExit(): Promise<"ready" | "busy" | "failed"> {
  if (tasks.size) return "busy";
  frozen = true;
  try {
    await Promise.all([...draftSavers].map((save) => save()));
    return "ready";
  } catch {
    frozen = false;
    return "failed";
  }
}

export const resumeDesktopTasks = () => {
  frozen = false;
};
export const canStartDesktopTask = () => !frozen;

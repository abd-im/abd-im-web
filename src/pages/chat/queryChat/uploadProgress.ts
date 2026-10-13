export type UploadProgressState = {
  current: number;
  total: number;
  percent: number;
};

type UploadTask = {
  operationID: string;
  cancel: () => void;
};

const progressByID = new Map<string, UploadProgressState>();
const listenersByID = new Map<string, Set<() => void>>();
const tasksByID = new Map<string, Map<string, UploadTask>>();

const notify = (id: string) => {
  listenersByID.get(id)?.forEach((listener) => listener());
};

export const setUploadProgress = (id: string, progress: UploadProgressState) => {
  progressByID.set(id, progress);
  notify(id);
};

export const getUploadProgress = (id: string) => progressByID.get(id);

export const subscribeUploadProgress = (id: string, listener: () => void) => {
  const listeners = listenersByID.get(id) || new Set<() => void>();
  listeners.add(listener);
  listenersByID.set(id, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByID.delete(id);
  };
};

export const registerUploadTask = (
  id: string,
  operationID: string,
  cancel: () => void,
) => {
  const tasks = tasksByID.get(id) || new Map<string, UploadTask>();
  tasks.set(operationID, { operationID, cancel });
  tasksByID.set(id, tasks);
};

export const unregisterUploadTask = (id: string, operationID: string) => {
  const tasks = tasksByID.get(id);
  if (!tasks) return;
  tasks.delete(operationID);
  if (tasks.size === 0) tasksByID.delete(id);
};

export const cancelUploadTasks = (id: string) => {
  tasksByID.get(id)?.forEach((task) => task.cancel());
};

export const clearUploadProgress = (id: string) => {
  progressByID.delete(id);
  listenersByID.delete(id);
  tasksByID.delete(id);
};

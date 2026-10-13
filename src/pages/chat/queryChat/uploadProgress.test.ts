import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelUploadTasks,
  clearUploadProgress,
  getUploadProgress,
  registerUploadTask,
  setUploadProgress,
  subscribeUploadProgress,
  unregisterUploadTask,
} from "./uploadProgress";

afterEach(() => {
  clearUploadProgress("file-1");
});

describe("upload progress state", () => {
  it("publishes byte progress to subscribers", () => {
    const listener = vi.fn();
    const dispose = subscribeUploadProgress("file-1", listener);

    setUploadProgress("file-1", { current: 25, total: 100, percent: 25 });

    expect(listener).toHaveBeenCalledOnce();
    expect(getUploadProgress("file-1")).toEqual({
      current: 25,
      total: 100,
      percent: 25,
    });
    dispose();
  });

  it("cancels all operations belonging to one attachment", () => {
    const cancelFirst = vi.fn();
    const cancelSecond = vi.fn();
    registerUploadTask("file-1", "operation-1", cancelFirst);
    registerUploadTask("file-1", "operation-2", cancelSecond);

    cancelUploadTasks("file-1");

    expect(cancelFirst).toHaveBeenCalledOnce();
    expect(cancelSecond).toHaveBeenCalledOnce();
    unregisterUploadTask("file-1", "operation-1");
    unregisterUploadTask("file-1", "operation-2");
  });
});

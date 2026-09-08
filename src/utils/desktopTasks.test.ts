import { afterEach, expect, it } from "vitest";
import {
  beginDesktopTask,
  canStartDesktopTask,
  prepareDesktopExit,
  registerDraftSaver,
  resumeDesktopTasks,
} from "./desktopTasks";
afterEach(resumeDesktopTasks);

it("blocks installation during a transfer and prevents late work after preparation", async () => {
  const finish = beginDesktopTask();
  expect(await prepareDesktopExit()).toBe("busy");
  finish();
  expect(await prepareDesktopExit()).toBe("ready");
  expect(() => beginDesktopTask()).toThrow();
});

it("waits for draft persistence and recovers after storage failure", async () => {
  const remove = registerDraftSaver(() => {
    throw new Error("disk full");
  });
  expect(await prepareDesktopExit()).toBe("failed");
  expect(canStartDesktopTask()).toBe(true);
  remove();
  let saved = false;
  const unregister = registerDraftSaver(async () => {
    await Promise.resolve();
    saved = true;
  });
  expect(await prepareDesktopExit()).toBe("ready");
  expect(saved).toBe(true);
  unregister();
});

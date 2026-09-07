/* eslint-disable @typescript-eslint/no-unsafe-call -- Electron main uses tsconfig.node.json. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => {
  const windows: Array<{
    handlers: Map<string, (...args: unknown[]) => void>;
    isFocused: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    webContents: {
      send: ReturnType<typeof vi.fn>;
      setWindowOpenHandler: ReturnType<typeof vi.fn>;
    };
  }> = [];
  const notifications: Array<{
    handlers: Map<string, (...args: unknown[]) => void>;
    options: unknown;
    show: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];

  const BrowserWindow = vi.fn(() => {
    const window = {
      handlers: new Map<string, (...args: unknown[]) => void>(),
      loadFile: vi.fn(),
      loadURL: vi.fn(),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        window.handlers.set(event, handler);
      }),
      isFocused: vi.fn(() => false),
      flashFrame: vi.fn(),
      isVisible: vi.fn(() => true),
      isMinimized: vi.fn(() => false),
      focus: vi.fn(),
      show: vi.fn(),
      restore: vi.fn(),
      webContents: {
        send: vi.fn(),
        setWindowOpenHandler: vi.fn(),
      },
    };
    windows.push(window);
    return window;
  });

  const Notification = vi.fn((options?: unknown) => {
    const notification = {
      handlers: new Map<string, (...args: unknown[]) => void>(),
      options,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        notification.handlers.set(event, handler);
      }),
      show: vi.fn(),
      close: vi.fn(),
    };
    notifications.push(notification);
    return notification;
  });
  Object.assign(Notification, { isSupported: vi.fn(() => true) });

  return { BrowserWindow, Notification, notifications, windows };
});

vi.mock("electron", () => ({
  app: { getName: () => "ABD IM" },
  BrowserWindow: electronMocks.BrowserWindow,
  Notification: electronMocks.Notification,
  shell: { openExternal: vi.fn() },
}));
vi.mock("../../electron/main/appManage", () => ({ getIsForceQuit: () => false }));
vi.mock("../../electron/main/shortcutManage", () => ({
  registerShortcuts: vi.fn(),
  unregisterShortcuts: vi.fn(),
}));
vi.mock("../../electron/main/trayManage", () => ({ destroyTray: vi.fn() }));
vi.mock("../../electron/main", () => ({
  logger: { debug: vi.fn(), error: vi.fn() },
}));

import {
  createMainWindow,
  showMessageNotification,
} from "../../electron/main/windowManage";

describe("message notifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electronMocks.BrowserWindow.mockClear();
    electronMocks.Notification.mockClear();
    electronMocks.notifications.length = 0;
    electronMocks.windows.length = 0;
    global.pathConfig = {
      publicPath: "/public",
      logsPath: "/logs",
      sdkResourcesPath: "/sdk",
      trayIcon: "/public/tray.png",
      indexHtml: "/public/index.html",
      splashHtml: "/public/splash.html",
      preload: "/public/preload.js",
    };
    createMainWindow();
  });

  it("coalesces bursts and replaces notifications by conversation", () => {
    for (let index = 0; index < 100; index += 1) {
      showMessageNotification({
        title: `sender ${index}`,
        body: `message ${index}`,
        sourceID: "source-99",
        sessionType: 1,
      });
    }

    vi.advanceTimersByTime(299);
    expect(electronMocks.Notification).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(electronMocks.Notification).toHaveBeenCalledTimes(1);
    expect(electronMocks.Notification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "sender 99",
        body: "message 99",
      }),
    );
    expect(electronMocks.notifications[0].show).toHaveBeenCalledTimes(1);

    const firstOptions = electronMocks.notifications[0].options as {
      groupId: string;
      id: string;
    };
    showMessageNotification({
      title: "sender 99",
      body: "newest message",
      sourceID: "source-99",
      sessionType: 1,
    });
    vi.advanceTimersByTime(300);

    expect(electronMocks.Notification).toHaveBeenCalledTimes(2);
    expect(electronMocks.Notification).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: "newest message",
        groupId: firstOptions.groupId,
        id: firstOptions.id,
      }),
    );

    showMessageNotification({
      title: "another sender",
      body: "another conversation",
      sourceID: "another-source",
      sessionType: 1,
    });
    vi.advanceTimersByTime(300);

    expect(electronMocks.Notification).toHaveBeenCalledTimes(3);
    const thirdOptions = electronMocks.notifications[2].options as {
      groupId: string;
      id: string;
    };
    expect(electronMocks.Notification).toHaveBeenLastCalledWith(
      expect.objectContaining({
        groupId: firstOptions.groupId,
        id: thirdOptions.id,
      }),
    );
    expect(thirdOptions.id).not.toBe(firstOptions.id);
  });
});

import { afterEach, expect, it, vi } from "vitest";
import { registerShortcuts } from "./shortcutManage";
import { createTray } from "./trayManage";

const mocks = vi.hoisted(() => ({
  buildMenu: vi.fn((template: Electron.MenuItemConstructorOptions[]) => template),
  registerShortcut: vi.fn(),
  showWindow: vi.fn(),
  hideWindow: vi.fn(),
  toggleDevTools: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { getName: () => "ABD IM", quit: vi.fn() },
  Menu: { buildFromTemplate: mocks.buildMenu },
  globalShortcut: { register: mocks.registerShortcut },
  Tray: class {
    setToolTip = vi.fn();
    setIgnoreDoubleClickEvents = vi.fn();
    on = vi.fn();
    setContextMenu = vi.fn();
  },
}));
vi.mock("i18next", () => ({ t: (key: string) => key }));
vi.mock("./windowManage", () => ({
  showWindow: mocks.showWindow,
  hideWindow: mocks.hideWindow,
  toggleDevTools: mocks.toggleDevTools,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

it("opens main-window debugging from the tray without a focused window", () => {
  vi.stubGlobal("pathConfig", { trayIcon: "tray.png" });
  createTray();
  registerShortcuts();

  const debugItem = mocks.buildMenu.mock.calls[0][0].find(
    (item) => item.label === "system.toggleDevTools",
  );
  expect(debugItem).toBeDefined();
  debugItem?.click?.({} as Electron.MenuItem, undefined, {} as Electron.KeyboardEvent);

  expect(mocks.showWindow).toHaveBeenCalledOnce();
  expect(mocks.toggleDevTools).toHaveBeenCalledOnce();
  expect(mocks.showWindow.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.toggleDevTools.mock.invocationCallOrder[0],
  );
  expect(debugItem?.accelerator).toBe(mocks.registerShortcut.mock.calls[0][0]);
});

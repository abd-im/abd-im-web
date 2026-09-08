import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateDependencies } from "./updateController";

const mocks = vi.hoisted(() => {
  const frame = {};
  const window = { webContents: { mainFrame: frame }, show: vi.fn() };
  const handlers = new Map<string, (...args: any[]) => any>();
  const events = new Map<string, (...args: any[]) => any>();
  const controller = {
    state: { phase: "downloaded", release: { id: "candidate" } } as Record<string, any>,
    set: vi.fn(function (
      this: { state: Record<string, any> },
      patch: Record<string, any>,
    ) {
      Object.assign(this.state, patch);
    }),
    check: vi.fn(async () => {}),
  };
  return {
    window,
    handlers,
    events,
    controller,
    quit: vi.fn(),
    install: vi.fn(),
    send: vi.fn(),
    sender: { sender: window.webContents, senderFrame: frame },
    fetch: vi.fn(),
    dependencies: undefined as UpdateDependencies | undefined,
  };
});

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getVersion: () => "1.0.0",
    quit: mocks.quit,
    on: (event: string, handler: () => void) => mocks.events.set(event, handler),
  },
  ipcMain: {
    handle: (channel: string, handler: () => void) =>
      mocks.handlers.set(channel, handler),
  },
  net: { fetch: mocks.fetch },
  powerMonitor: { on: vi.fn() },
  session: { fromPartition: () => ({ webRequest: { onBeforeRequest: vi.fn() } }) },
  shell: { openExternal: vi.fn() },
}));
vi.mock("electron-updater", () => ({
  autoUpdater: { on: vi.fn(), quitAndInstall: mocks.install },
}));
vi.mock("./windowManage", () => ({
  getMainWindow: () => mocks.window,
  sendEvent: mocks.send,
}));
vi.mock(".", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("./updateController", () => ({
  UpdateController: class {
    constructor(dependencies: UpdateDependencies) {
      mocks.dependencies = dependencies;
      return mocks.controller;
    }
  },
  trustedUpdateURL: vi.fn(),
  trustedUpdaterRequest: vi.fn(),
  validateUpdateManifest: vi.fn(),
}));

const invoke = (name: string, ...args: unknown[]) =>
  mocks.handlers.get(`desktop-update:${name}`)!(mocks.sender, ...args);
const prepare = (result: string) => {
  const call = [...mocks.send.mock.calls]
    .reverse()
    .find(([channel]) => channel === "desktop-update:prepare")!;
  invoke("prepared", call[1], result);
};

describe("desktop update IPC and exit preparation", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.events.clear();
    mocks.controller.state = { phase: "downloaded", release: { id: "candidate" } };
    global.forceQuit = false;
    const { initDesktopUpdates } = await import("./updateManage");
    initDesktopUpdates();
  });

  it("rejects child frames and foreign renderer commands", () => {
    const handler = mocks.handlers.get("desktop-update:install")!;
    expect(() => handler({ ...mocks.sender, senderFrame: {} })).toThrow("Untrusted");
    expect(() => handler({ ...mocks.sender, sender: {} })).toThrow("Untrusted");
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it("uses the existing latest-version request and response contract", async () => {
    const version = { id: "legacy-version", platform: "windows", version: "1.0.1" };
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errCode: 0, data: { version } }),
    });
    await expect(mocks.dependencies!.query()).resolves.toEqual({ version });
    const options = mocks.fetch.mock.calls[0][1];
    expect(options.method).toBe("POST");
    expect(Object.keys(JSON.parse(options.body)).sort()).toEqual([
      "platform",
      "version",
    ]);
    expect(JSON.parse(options.body).version).toBe("1.0.0");
    expect(options.credentials).toBe("omit");
  });

  it("saves before restarting and deduplicates repeated install commands", async () => {
    const installing = invoke("install");
    await invoke("install");
    expect(mocks.install).not.toHaveBeenCalled();
    prepare("ready");
    await installing;
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(mocks.install).toHaveBeenCalledWith(true, true);
    expect(global.forceQuit).toBe(true);
  });

  it("installs on real quit without reopening, after the renderer is ready", async () => {
    const preventDefault = vi.fn();
    mocks.events.get("before-quit")!({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    prepare("ready");
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    expect(mocks.install).toHaveBeenCalledWith(true, false);
  });

  it("preserves running tasks and rejects candidate changes during draft saving", async () => {
    let installing = invoke("install");
    prepare("busy");
    await installing;
    expect(mocks.controller.state.error).toBe("busy");
    expect(mocks.install).not.toHaveBeenCalled();
    expect(global.forceQuit).toBe(false);
    installing = invoke("install");
    mocks.controller.state = { phase: "error", error: "validation" };
    prepare("ready");
    await installing;
    expect(mocks.install).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith("desktop-update:resume");
  });
});

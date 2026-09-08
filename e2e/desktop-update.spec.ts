import { expect, test } from "@playwright/test";

const origin = process.env.DESKTOP_UPDATE_TEST_URL || "http://127.0.0.1:7788";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "en");
    const listeners = new Set<(state: unknown) => void>();
    let state = { phase: "idle", currentVersion: "1.0.0", revision: 0 } as Record<
      string,
      unknown
    >;
    const calls: string[] = [];
    const api = {
      getState: async () => state,
      check: async () => {
        calls.push("check");
      },
      install: async () => {
        calls.push("install");
      },
      quit: async () => {
        calls.push("quit");
      },
      openDownload: async () => {
        calls.push("download");
      },
      subscribe: (callback: (state: unknown) => void) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
      onPrepare: () => () => {},
      onResume: () => () => {},
      prepared: async () => {},
    };
    Object.assign(window, {
      electronAPI: {
        updates: api,
        getPlatform: () => 3,
        getDataPath: () => "",
        ipcInvoke: async () => undefined,
        ipcSendSync: () => undefined,
        subscribe: () => () => {},
      },
      updateCalls: calls,
      emitDesktopUpdate: (patch: Record<string, unknown>) => {
        state = { ...state, ...patch, revision: Number(state.revision) + 1 };
        listeners.forEach((callback) => callback(state));
      },
    });
  });
  await page.goto(`${origin}/#/login`);
  await expect(page.getByTestId("update-trigger")).toBeVisible();
});

const emit = async (
  page: import("@playwright/test").Page,
  state: Record<string, unknown>,
) =>
  page.evaluate(
    (patch) =>
      (
        window as unknown as { emitDesktopUpdate: (value: unknown) => void }
      ).emitDesktopUpdate(patch),
    state,
  );
const release = {
  id: "0123456789abcdef01234567",
  platform: "windows",
  arch: "x64",
  version: "1.0.1",
  feedUrl: "https://downloads.example.com/1.0.1/",
  url: "https://downloads.example.com/a.exe",
  text: "Improved notification delivery.\nFixed reconnecting after sleep.",
  force: false,
};

test("background updates stay quiet, show real progress, and restart with one command", async ({
  page,
}) => {
  await emit(page, {
    phase: "downloading",
    release,
    progress: 42,
    transferred: 42,
    total: 100,
  });
  await expect(page.getByTestId("update-details")).not.toBeVisible();
  await page.getByTestId("update-trigger").click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  await emit(page, { phase: "downloaded", progress: 100 });
  await page.getByRole("button", { name: /Later|稍后/ }).click();
  await expect(page.getByTestId("update-details")).not.toBeVisible();
  await page.getByTestId("update-trigger").click();
  await page
    .getByTestId("update-details")
    .getByRole("button", { name: /Restart to update|重启更新/ })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { updateCalls: string[] }).updateCalls,
    ),
  ).toEqual(["install"]);
});

test("mandatory updates cannot be dismissed, but expose an exit action", async ({
  page,
}) => {
  await emit(page, { phase: "downloaded", release: { ...release, force: true } });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: /Later|稍后/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Quit|退出应用/, exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { updateCalls: string[] }).updateCalls,
    ),
  ).toEqual(["quit"]);
});

test("ready and failed states fit light and dark layouts", async ({
  page,
}, testInfo) => {
  for (const [width, height, dark] of [
    [1024, 726, false],
    [1440, 900, true],
    [390, 844, false],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark,
    );
    await emit(page, {
      phase: "downloaded",
      release: { ...release, text: "A long release note ".repeat(100) },
      error: undefined,
    });
    const trigger = page.getByTestId("update-trigger");
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
    const details = page.getByTestId("update-details");
    await expect(details).toBeVisible();
    await details.locator("summary").click();
    const box = await details.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    await page.screenshot({
      path: testInfo.outputPath(`update-${width}-${dark ? "dark" : "light"}.png`),
    });
    await page.getByRole("button", { name: /Later|稍后/ }).click();
  }
  await emit(page, { phase: "error", error: "download", release });
  await page.getByTestId("update-trigger").click();
  await page.getByRole("button", { name: /Retry download|重试下载/ }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { updateCalls: string[] }).updateCalls,
    ),
  ).toEqual(["check"]);
});

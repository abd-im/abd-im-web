const { app, BrowserWindow, ipcMain, protocol } = require("electron");
const { randomUUID } = require("node:crypto");
const { join } = require("node:path");
const { MediaStorage } = require(process.env.MEDIA_TEST_HOST);

app.setPath("userData", process.env.MEDIA_TEST_PROFILE);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "abd-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
let storage;
const reads = new Map();
ipcMain.on("media:read-result", (_event, id, data, error) => {
  const read = reads.get(id);
  if (!read) return;
  reads.delete(id);
  if (error) read.reject(new Error(error));
  else read.resolve(data);
});
app.whenReady().then(async () => {
  ipcMain.handle("media:test-save", async (_event, ref) => {
    await storage.save(ref, join(process.env.MEDIA_TEST_PROFILE, "saved-video"));
    return true;
  });
  ipcMain.handle("media:io", async (event, requestID, raw) => {
    const request = JSON.parse(raw);
    if (request.method === "init") {
      storage = await MediaStorage.create(
        process.env.MEDIA_TEST_PROFILE,
        request.args.account,
        request.args.apiAddr,
      );
      return JSON.stringify(storage.id);
    }
    const result = await storage.invoke(
      request,
      (bytes) => event.sender.send("media:progress", requestID, bytes),
      request.method === "open" && request.args.kind === "video"
        ? (offset) =>
            new Promise((resolve, reject) => {
              const id = randomUUID();
              reads.set(id, { resolve, reject });
              event.sender.send("media:read", requestID, id, offset);
            })
        : undefined,
    );
    return JSON.stringify(result ?? null);
  });
  protocol.handle("abd-media", async (request) => {
    try {
      return await storage.read(new URL(request.url).pathname.slice(1), request);
    } catch (error) {
      console.error("Media protocol error", error);
      throw error;
    }
  });
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      sandbox: false,
      webSecurity: false,
    },
  });
  await window.loadFile(process.env.MEDIA_TEST_HTML);
});
let closing = false;
app.on("before-quit", (event) => {
  if (closing) return;
  event.preventDefault();
  closing = true;
  Promise.resolve(storage?.close()).finally(() => app.quit());
});

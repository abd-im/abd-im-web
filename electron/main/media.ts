import { randomUUID } from "node:crypto";
import { join, basename } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron";
import type { MediaStorageRequest } from "@abd-im/wasm-client-sdk";
import { MediaStorage } from "./mediaStorage";
import { getMainWindow } from "./windowManage";

const hosts = new Map<number, MediaStorage>();
const reads = new Map<
  string,
  { owner: number; resolve: (data: string) => void; reject: (error: Error) => void }
>();

function closeReads(owner: number) {
  for (const [id, read] of reads) {
    if (read.owner === owner) {
      read.reject(new Error("Media renderer closed"));
      reads.delete(id);
    }
  }
}

export function registerMediaScheme() {
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
}

export function initMediaIO() {
  ipcMain.on("media:read-result", (event, id: string, data: string, error?: string) => {
    const read = reads.get(id);
    if (
      !read ||
      event.sender.id !== read.owner ||
      event.senderFrame !== event.sender.mainFrame
    )
      return;
    reads.delete(id);
    if (error) read.reject(new Error(error));
    else read.resolve(data);
  });
  ipcMain.handle("media:io", async (event, requestID: string, raw: string) => {
    if (
      event.sender !== getMainWindow()?.webContents ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error("Invalid media caller");
    const request: MediaStorageRequest = JSON.parse(raw);
    const owner = event.sender.id;
    if (request.method === "init") {
      await hosts.get(owner)?.close();
      const host = await MediaStorage.create(
        join(app.getPath("userData"), "OpenIMData", "media"),
        request.args.account,
        request.args.apiAddr,
      );
      hosts.set(owner, host);
      return JSON.stringify(host.id);
    }
    const host = hosts.get(owner);
    if (!host) throw new Error("Media session not initialized");
    const result = await host.invoke(
      request,
      (bytes) => {
        if (!event.sender.isDestroyed())
          event.sender.send("media:progress", requestID, bytes);
      },
      request.method === "open" && request.args.kind === "video"
        ? (offset) => {
            if (event.sender.isDestroyed())
              return Promise.reject(new Error("Media renderer closed"));
            return new Promise<string>((resolve, reject) => {
              const id = randomUUID();
              reads.set(id, { owner, resolve, reject });
              event.sender.send("media:read", requestID, id, offset);
            });
          }
        : undefined,
    );
    if (request.method === "close" && hosts.get(owner) === host) hosts.delete(owner);
    return JSON.stringify(result ?? null);
  });

  ipcMain.handle("media:save", async (event, ref: string, name: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (
      !window ||
      window !== getMainWindow() ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error("Invalid media caller");
    const host = hosts.get(event.sender.id);
    if (!host?.hasFile(ref)) throw new Error("Media file reference expired");
    const safeName =
      basename(name)
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .slice(0, 160) || "attachment";
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      defaultPath: join(app.getPath("downloads"), safeName),
    });
    if (canceled || !filePath) return false;
    await host.save(ref, filePath);
    return true;
  });

  protocol.handle("abd-media", async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "cache" || url.search || url.hash)
      return new Response(null, { status: 404 });
    const ref = url.pathname.slice(1);
    const host = [...hosts.values()].find((host) => host.hasFile(ref));
    if (!host) return new Response(null, { status: 404 });
    try {
      return await host.read(ref, request);
    } catch (error) {
      console.error("Local media read failed", error);
      return new Response(null, { status: 404 });
    }
  });

  app.on("web-contents-created", (_event, contents) => {
    const close = () => {
      closeReads(contents.id);
      const host = hosts.get(contents.id);
      hosts.delete(contents.id);
      void host
        ?.close()
        .catch((error) => console.error("Media storage close failed", error));
    };
    contents.on("destroyed", close);
    contents.on("render-process-gone", close);
    contents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) close();
    });
  });
}

export async function closeMediaIO() {
  for (const owner of hosts.keys()) closeReads(owner);
  const closing = [...hosts.values()].map((host) => host.close());
  hosts.clear();
  await Promise.all(closing);
}

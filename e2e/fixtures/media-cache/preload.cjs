const { contextBridge, ipcRenderer } = require("electron");
const { randomUUID } = require("node:crypto");

const readers = new Map();
const refs = new Map();
ipcRenderer.on("media:read", (_event, owner, id, offset) => {
  const read = readers.get(owner);
  const result = read
    ? read(offset)
    : Promise.reject(new Error("Media reader released"));
  result.then(
    (data) => ipcRenderer.send("media:read-result", id, data),
    (error) => ipcRenderer.send("media:read-result", id, "", error.message),
  );
});
contextBridge.exposeInMainWorld("mediaStorageHost", async (request, progress, read) => {
  const operation = JSON.parse(request);
  const id = randomUUID();
  if (read) readers.set(id, read);
  const receive = (_event, requestID, bytes) => {
    if (id === requestID) progress(bytes);
  };
  ipcRenderer.on("media:progress", receive);
  try {
    const result = await ipcRenderer.invoke("media:io", id, request);
    if (read) refs.set(JSON.parse(result).ref, id);
    if (operation.method === "release") {
      readers.delete(refs.get(operation.args));
      refs.delete(operation.args);
    }
    if (operation.method === "close") {
      readers.clear();
      refs.clear();
    }
    return result;
  } catch (error) {
    readers.delete(id);
    throw error;
  } finally {
    ipcRenderer.removeListener("media:progress", receive);
  }
});

contextBridge.exposeInMainWorld("mediaSaveForTest", (ref) =>
  ipcRenderer.invoke("media:test-save", ref),
);

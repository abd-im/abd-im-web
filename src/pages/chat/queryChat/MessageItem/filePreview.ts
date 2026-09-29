export type FilePreviewType = "markdown" | "text" | "image" | "pdf";

export const getFilePreviewType = (name: string): FilePreviewType | undefined => {
  const extension = name.split(".").pop()?.toLowerCase() || "";
  if (["md", "markdown", "mdown"].includes(extension)) return "markdown";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"].includes(extension))
    return "image";
  if (extension === "pdf") return "pdf";
  if (
    [
      "txt",
      "log",
      "json",
      "csv",
      "tsv",
      "yaml",
      "yml",
      "xml",
      "html",
      "css",
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "go",
      "rs",
      "java",
      "sh",
      "sql",
      "ini",
      "toml",
    ].includes(extension)
  )
    return "text";
  return undefined;
};

export const getSafeFileUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ["https:", "http:", "blob:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

export const getPreviewSizeLimit = (type: FilePreviewType) =>
  (type === "text" || type === "markdown" ? 2 : 20) * 1024 * 1024;

export class PreviewTooLargeError extends Error {}

export async function loadFilePreview(url: string, limit: number, signal: AbortSignal) {
  const safeUrl = getSafeFileUrl(url);
  if (!safeUrl) throw new Error("Invalid file URL");
  const response = await fetch(safeUrl, { signal, credentials: "omit" });
  if (!response.ok) throw new Error(`File request failed: ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("File response is empty");
  try {
    if (Number(response.headers.get("content-length")) > limit)
      throw new PreviewTooLargeError();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let chunk = await reader.read();
    while (!chunk.done) {
      const value = chunk.value;
      size += value.byteLength;
      if (size > limit) throw new PreviewTooLargeError();
      chunks.push(value);
      chunk = await reader.read();
    }
    return new Blob(chunks, { type: response.headers.get("content-type") || "" });
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

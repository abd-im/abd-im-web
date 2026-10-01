import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type {
  MediaFileInfo,
  MediaRecord,
  MediaResource,
  MediaStorageRequest,
  MediaStorageReader,
  MediaRangeRequest,
  MediaSegment,
} from "@abd-im/wasm-client-sdk";

const validKey = (key: string) => /^[a-f0-9]{64}$/.test(key);

// One SDK login owns this host. The SDK supplies SQL and read permissions;
// this host executes database and file I/O.
export class MediaStorage {
  readonly id = randomUUID();
  private database: DatabaseSync;
  private closed = false;
  private requests = new Map<
    string,
    { controller: AbortController; finished: Promise<unknown> }
  >();
  private files = new Map<string, MediaRecord>();
  private readers = new Map<string, MediaStorageReader>();
  private streams = new Map<string, Set<Readable>>();

  private constructor(private directory: string) {
    this.database = new DatabaseSync(join(directory, "index.sqlite"));
  }

  static async create(root: string, account: string, apiAddr: string) {
    if (!validKey(account)) throw new Error("Invalid media account");
    const api = new URL(apiAddr);
    if (!["http:", "https:"].includes(api.protocol)) throw new Error("Invalid API URL");
    const directory = join(root, account);
    await mkdir(join(directory, "objects"), { recursive: true, mode: 0o700 });
    await mkdir(join(directory, "parts"), { recursive: true, mode: 0o700 });
    await rm(join(directory, "pending"), { recursive: true, force: true });
    await mkdir(join(directory, "pending"), { mode: 0o700 });
    return new MediaStorage(directory);
  }

  private path(key: string, temporary = false) {
    if (!validKey(key)) throw new Error("Invalid media key");
    return join(this.directory, temporary ? "pending" : "objects", key);
  }

  private partPath(key: string, offset: number, temporary = false) {
    this.path(key);
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new Error("Invalid part offset");
    return temporary
      ? join(this.directory, "pending", `${key}-${offset}`)
      : join(this.directory, "parts", key, String(offset));
  }

  private async stat(key: string, offset?: number): Promise<MediaFileInfo | null> {
    try {
      const info = await lstat(
        offset === undefined ? this.path(key) : this.partPath(key, offset),
      );
      if (!info.isFile()) throw new Error("Media entry is not a regular file");
      return { size: info.size, modified: Math.trunc(info.mtimeMs) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async check(record: MediaRecord) {
    const info = await this.stat(record.key);
    if (
      !info ||
      info.size !== record.file.size ||
      info.modified !== record.file.modified
    )
      throw new Error("Cached file changed or was removed");
    return info;
  }

  async invoke(
    request: MediaStorageRequest,
    progress: (bytes: number) => void,
    read?: MediaStorageReader,
  ): Promise<unknown> {
    if (this.closed || request.session !== this.id)
      throw new Error("Media session closed");
    switch (request.method) {
      case "exec":
        if (request.args.params.length) {
          this.database.prepare(request.args.statement).run(...request.args.params);
        } else {
          this.database.exec(request.args.statement);
        }
        return null;
      case "query":
        return this.database
          .prepare(request.args.statement)
          .all(...request.args.params)
          .map((row) => String(Object.values(row)[0]));
      case "stat":
        return this.stat(request.args);
      case "statPart":
        return this.stat(request.args.key, request.args.offset);
      case "commitPart": {
        const { key, offset } = request.args;
        await mkdir(join(this.directory, "parts", key), {
          recursive: true,
          mode: 0o700,
        });
        await rename(this.partPath(key, offset, true), this.partPath(key, offset));
        return this.stat(key, offset);
      }
      case "discardPart":
        await rm(this.partPath(request.args.key, request.args.offset, true), {
          force: true,
        });
        return null;
      case "pruneParts":
        this.path(request.args);
        await rm(join(this.directory, "parts", request.args), {
          recursive: true,
          force: true,
        });
        return null;
      case "assemble":
        return this.request(request.args.key, (signal) =>
          this.assemble(request.args, signal),
        );
      case "fetch":
      case "fetchRange": {
        const part = request.method === "fetchRange" ? request.args : undefined;
        const resource =
          request.method === "fetch" ? request.args : request.args.resource;
        const id = part ? `${resource.key}-${part.offset}` : resource.key;
        this.path(resource.key);
        return this.request(id, (signal) =>
          this.fetchFile(resource, signal, progress, part),
        );
      }
      case "cancel": {
        const running = this.requests.get(request.args);
        running?.controller.abort();
        if (running) await Promise.allSettled([running.finished]);
        return null;
      }
      case "commit":
        await rename(this.path(request.args, true), this.path(request.args));
        return this.stat(request.args);
      case "remove":
        if (!request.args.temporary) {
          this.path(request.args.key);
          await rm(join(this.directory, "parts", request.args.key), {
            recursive: true,
            force: true,
          });
        }
        await rm(this.path(request.args.key, request.args.temporary), { force: true });
        return null;
      case "open": {
        if (!request.args.partial) await this.check(request.args);
        const ref = randomUUID();
        this.files.set(ref, request.args);
        if (read) this.readers.set(ref, read);
        return {
          ref,
          location: `abd-media://cache/${ref}`,
          size: request.args.size,
          name: request.args.name,
        };
      }
      case "release":
        for (const stream of this.streams.get(request.args) || []) stream.destroy();
        this.streams.delete(request.args);
        this.files.delete(request.args);
        this.readers.delete(request.args);
        return null;
      case "close":
        await this.close();
        return null;
      default:
        throw new Error("Unknown media operation");
    }
  }

  private async request<T>(id: string, run: (signal: AbortSignal) => Promise<T>) {
    if (this.requests.has(id)) throw new Error("Media request already running");
    const controller = new AbortController();
    const finished = run(controller.signal);
    this.requests.set(id, { controller, finished });
    try {
      return await finished;
    } finally {
      this.requests.delete(id);
    }
  }

  private async assemble(record: MediaRecord, signal: AbortSignal) {
    const output = await open(this.path(record.key, true), "wx", 0o600);
    try {
      for (const part of record.parts || []) {
        const info = await this.stat(record.key, part.offset);
        if (
          !info ||
          info.size !== part.file.size ||
          info.modified !== part.file.modified
        )
          throw new Error("Video part changed during assembly");
        const source = createReadStream(this.partPath(record.key, part.offset), {
          signal,
        });
        for await (const chunk of source) await output.writeFile(chunk);
      }
    } finally {
      await output.close();
    }
    signal.throwIfAborted();
    await rename(this.path(record.key, true), this.path(record.key));
    return this.stat(record.key);
  }

  private async fetchFile(
    resource: MediaResource,
    signal: AbortSignal,
    progress: (bytes: number) => void,
    part?: MediaRangeRequest,
  ) {
    let url = new URL(resource.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.pathname.includes("/object/") ||
      (url.search && url.search !== "?height=640&type=image&width=640") ||
      url.username ||
      url.password
    )
      throw new Error("Invalid stable object URL");
    if (!Number.isSafeInteger(resource.size) || resource.size < 0)
      throw new Error("Invalid media size");
    const limit = part ? part.length : resource.size;
    const headers: Record<string, string> = { "Accept-Encoding": "identity" };
    if (part) {
      this.partPath(resource.key, part.offset);
      if (
        !Number.isSafeInteger(part.length) ||
        part.length <= 0 ||
        part.offset + part.length > resource.size
      )
        throw new Error("Invalid media range");
      headers.Range = `bytes=${part.offset}-${part.offset + part.length - 1}`;
      if (part.etag) headers["If-Match"] = part.etag;
    }
    let response: Response | undefined;
    try {
      for (let redirects = 0; redirects <= 3; redirects++) {
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
          throw new Error("Invalid object redirect");
        response = await fetch(url.href, {
          headers,
          redirect: "manual",
          signal,
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || redirects === 3) throw new Error("Invalid object redirect");
        url = new URL(location, url);
      }
    } catch {
      // Fetch errors can contain temporary signed URLs.
      throw new Error(
        signal.aborted ? "Media request cancelled" : "Media network request failed",
      );
    }
    if (!response) throw new Error("Media response missing");
    const length = response.headers.get("content-length");
    const contentLength = length === null ? -1 : Number(length);
    const result = {
      status: response.status,
      size: 0,
      contentLength,
      mime: response.headers.get("content-type") || "",
      etag: response.headers.get("etag") || "",
      contentRange: response.headers.get("content-range") || "",
    };
    if (response.status !== (part ? 206 : 200)) {
      await response.body?.cancel();
      return result;
    }
    if (!response.body || contentLength > limit) {
      await response.body?.cancel();
      throw new Error("Media response exceeds download limit");
    }
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        result.size += chunk.length;
        if (result.size > limit) {
          callback(new Error("Media response exceeds download limit"));
          return;
        }
        progress(result.size);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
      counter,
      createWriteStream(
        part
          ? this.partPath(resource.key, part.offset, true)
          : this.path(resource.key, true),
        { flags: "wx", mode: 0o600 },
      ),
      { signal },
    );
    return result;
  }

  hasFile(ref: string) {
    return !this.closed && this.files.has(ref);
  }

  async read(ref: string, request: Request): Promise<Response> {
    const record = this.files.get(ref);
    if (this.closed || !record) return new Response(null, { status: 404 });
    if (!record.partial) await this.check(record);
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, { status: 405 });
    const size = record.size;
    let start = 0;
    let end = size - 1;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
      } else {
        start = Math.max(0, size - Number(match[2]));
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= size
      )
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
    }
    const safeMime =
      /^(image\/(png|jpeg|gif|webp|avif|bmp)|video\/[\w.+-]+|application\/pdf)(;|$)/i.test(
        record.mime,
      )
        ? record.mime
        : "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": safeMime,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    let stream = null;
    if (request.method !== "HEAD" && size > 0) {
      const read = this.readers.get(ref);
      const input = read
        ? Readable.from(this.readVideo(ref, record, read, start, end, request.signal))
        : createReadStream(this.path(record.key), {
            start,
            end,
            signal: request.signal,
          });
      const streams = this.streams.get(ref) || new Set<Readable>();
      streams.add(input);
      this.streams.set(ref, streams);
      input.once("close", () => {
        streams.delete(input);
        if (!streams.size) this.streams.delete(ref);
      });
      stream = Readable.toWeb(input);
    }
    return new Response(stream as ReadableStream<Uint8Array> | null, {
      status: range ? 206 : 200,
      headers,
    });
  }

  private async *readVideo(
    ref: string,
    record: MediaRecord,
    read: MediaStorageReader,
    start: number,
    end: number,
    signal: AbortSignal,
  ) {
    for (let position = start; position <= end; ) {
      if (signal.aborted || !this.hasFile(ref)) throw new Error("Video read cancelled");
      const segment: MediaSegment = JSON.parse(await read(position));
      if (signal.aborted || !this.hasFile(ref)) throw new Error("Video read cancelled");
      if (
        segment.key !== record.key ||
        segment.offset > position ||
        segment.file.size <= position - segment.offset
      )
        throw new Error("Invalid SDK media segment");
      const path = segment.complete
        ? this.path(segment.key)
        : this.partPath(segment.key, segment.offset);
      const info = await lstat(path);
      if (
        !info.isFile() ||
        info.size !== segment.file.size ||
        Math.trunc(info.mtimeMs) !== segment.file.modified
      )
        throw new Error("SDK media segment changed");
      const length = Math.min(
        end - position + 1,
        segment.file.size - (position - segment.offset),
      );
      const input = createReadStream(path, {
        start: position - segment.offset,
        end: position - segment.offset + length - 1,
        signal,
      });
      try {
        for await (const chunk of input) yield chunk;
      } finally {
        input.destroy();
      }
      position += length;
    }
  }

  async save(ref: string, destination: string) {
    const record = this.files.get(ref);
    if (this.closed || !record) throw new Error("Media file reference expired");
    let info = record.file;
    if (record.partial) {
      const read = this.readers.get(ref);
      if (!read) throw new Error("SDK media reader unavailable");
      const segment: MediaSegment = JSON.parse(await read(0));
      if (!segment.complete || segment.key !== record.key)
        throw new Error("Video is not fully cached");
      info = segment.file;
    }
    await this.check({ ...record, file: info });
    await copyFile(this.path(record.key), destination);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const streams of this.streams.values()) {
      for (const stream of streams) stream.destroy();
    }
    this.streams.clear();
    this.files.clear();
    this.readers.clear();
    for (const request of this.requests.values()) request.controller.abort();
    await Promise.allSettled(
      [...this.requests.values()].map((request) => request.finished),
    );
    await rm(join(this.directory, "pending"), { recursive: true, force: true });
    this.database.close();
  }
}

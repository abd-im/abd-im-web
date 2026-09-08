import { gt, prerelease, valid } from "semver";
import type {
  DesktopRelease,
  DesktopUpdateState,
  UpdateError,
} from "../../src/types/desktopUpdate";

export type ApplicationVersion = Omit<DesktopRelease, "arch" | "feedUrl"> & {
  hot: boolean;
};

export interface UpdateDependencies {
  version: string;
  platform: string;
  arch: string;
  origins: string[];
  enabled: boolean;
  query: () => Promise<{ version?: ApplicationVersion | null }>;
  download: (
    release: DesktopRelease,
    progress: (percent: number, transferred: number, total: number) => void,
  ) => Promise<void>;
  publish: (state: DesktopUpdateState) => void;
  log: (error: unknown) => void;
}

export function trustedUpdateURL(value: string, origins: string[]) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !origins.includes(url.origin)
  )
    throw new Error("Untrusted update URL");
  return url;
}

export function trustedUpdaterRequest(value: string, origins: string[]) {
  const url = new URL(value);
  const entries = [...url.searchParams.entries()];
  // GenericProvider adds this cache-busting query to its channel manifest request.
  if (
    url.pathname.endsWith(".yml") &&
    entries.length === 1 &&
    entries[0][0] === "noCache" &&
    /^[0-9a-v]{1,32}$/.test(entries[0][1])
  )
    url.search = "";
  return trustedUpdateURL(url.href, origins);
}

export function validateRelease(
  release: DesktopRelease,
  deps: Pick<UpdateDependencies, "version" | "platform" | "arch" | "origins">,
) {
  if (
    !release ||
    typeof release.id !== "string" ||
    !/^[a-f0-9]{24}$/i.test(release.id) ||
    release.platform !== deps.platform ||
    release.arch !== deps.arch ||
    valid(release.version) !== release.version ||
    prerelease(release.version) ||
    !gt(release.version, deps.version) ||
    typeof release.text !== "string" ||
    typeof release.force !== "boolean"
  )
    throw new Error("Invalid update target");
  trustedUpdateURL(release.url, deps.origins);
  const feed = trustedUpdateURL(release.feedUrl, deps.origins);
  if (!feed.pathname.endsWith("/")) throw new Error("Invalid update feed");
}

export function selectUpdate(
  candidate: ApplicationVersion | null | undefined,
  deps: Pick<UpdateDependencies, "version" | "platform" | "arch" | "origins">,
): DesktopRelease | undefined {
  if (!candidate) return;
  if (
    candidate.platform !== deps.platform ||
    valid(candidate.version) !== candidate.version
  )
    throw new Error("Invalid application version");
  if (
    candidate.hot ||
    prerelease(candidate.version) ||
    !gt(candidate.version, deps.version)
  )
    return;
  const url = trustedUpdateURL(candidate.url, deps.origins);
  const arch = candidate.platform === "windows" ? "x64" : "arm64";
  const extension = candidate.platform === "windows" ? ".exe" : ".dmg";
  if (!url.pathname.endsWith(`_${arch}${extension}`))
    throw new Error("Installer does not match the supported target");
  const release: DesktopRelease = {
    ...candidate,
    arch,
    feedUrl: new URL(".", url).href,
  };
  validateRelease(release, deps);
  return release;
}

export function validateUpdateManifest(
  info: { version: string; files: { url: string; sha512: string; size?: number }[] },
  release: DesktopRelease,
  origins: string[],
) {
  if (info.version !== release.version || !info.files?.length || info.files.length > 8)
    throw new Error("Update manifest does not match release");
  const base = trustedUpdateURL(release.feedUrl, origins);
  const ext = release.platform === "mac" ? ".zip" : ".exe";
  let installer = false;
  for (const file of info.files) {
    const url = new URL(file.url, base);
    const filename = decodeURIComponent(url.pathname.slice(base.pathname.length));
    trustedUpdateURL(url.href, origins);
    if (
      url.origin !== base.origin ||
      !url.pathname.startsWith(base.pathname) ||
      !filename ||
      /[/\\]/.test(filename) ||
      !(release.platform === "mac" ? [".zip", ".dmg"] : [".exe"]).some((extension) =>
        filename.endsWith(`_${release.arch}${extension}`),
      ) ||
      !file.size ||
      file.size <= 0 ||
      !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)
    )
      throw new Error("Invalid update artifact");
    if (filename.endsWith(`_${release.arch}${ext}`)) installer = true;
  }
  if (!installer) throw new Error("Missing target installer");
}

export class UpdateController {
  state: DesktopUpdateState;
  private running?: Promise<void>;
  constructor(private readonly deps: UpdateDependencies) {
    this.state = {
      phase: deps.enabled ? "idle" : "disabled",
      currentVersion: deps.version,
      revision: 0,
    };
  }
  set(patch: Partial<DesktopUpdateState>) {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 };
    this.deps.publish(this.state);
  }
  fail(error: UpdateError, cause?: unknown) {
    if (cause) this.deps.log(cause);
    this.set({
      phase: this.state.phase === "downloaded" ? "downloaded" : "error",
      error,
    });
  }
  check() {
    if (!this.deps.enabled || ["installing", "downloaded"].includes(this.state.phase))
      return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.performCheck().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async performCheck() {
    this.set({ phase: "checking", error: undefined, progress: undefined });
    let response: Awaited<ReturnType<UpdateDependencies["query"]>>;
    try {
      response = await this.deps.query();
    } catch (error) {
      this.fail("check", error);
      return;
    }
    this.set({ checkedAt: Date.now() });
    let release: DesktopRelease | undefined;
    try {
      release = selectUpdate(response.version, this.deps);
    } catch (error) {
      this.set({ release: undefined });
      this.fail("validation", error);
      return;
    }
    if (!release) {
      this.set({ phase: "upToDate", release: undefined, error: undefined });
      return;
    }
    this.set({ phase: "downloading", release, error: undefined, progress: 0 });
    try {
      await this.deps.download(release, (percent, transferred, total) => {
        this.set({
          phase: percent >= 100 ? "verifying" : "downloading",
          progress: Math.max(0, Math.min(100, percent)),
          transferred,
          total,
        });
      });
      this.set({ phase: "downloaded", progress: 100, error: undefined });
    } catch (error) {
      this.fail("download", error);
    }
  }
}

import { describe, expect, it, vi } from "vitest";

import { runWithRequestLock } from "./requestLock";

describe("runWithRequestLock", () => {
  it("ignores a repeated request while the first request is pending", async () => {
    let finishRequest: (() => void) | undefined;
    const request = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRequest = resolve;
        }),
    );
    const lock = { current: false };

    const firstRequest = runWithRequestLock(lock, request);
    await expect(runWithRequestLock(lock, request)).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);

    finishRequest?.();
    await expect(firstRequest).resolves.toBe(true);
  });

  it("releases the lock after a failed request", async () => {
    const lock = { current: false };

    await expect(
      runWithRequestLock(lock, () => Promise.reject(new Error("request failed"))),
    ).rejects.toThrow("request failed");
    await expect(runWithRequestLock(lock, () => Promise.resolve())).resolves.toBe(true);
  });
});

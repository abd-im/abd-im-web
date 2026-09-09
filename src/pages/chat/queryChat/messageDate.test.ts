import { describe, expect, it } from "vitest";

import { messageDate, startsMessageDay } from "./messageDate";

describe("message day boundaries", () => {
  const midnight = new Date(2026, 8, 8).getTime();

  it("separates the first message and changes of local calendar day", () => {
    expect(startsMessageDay(midnight)).toBe(true);
    expect(startsMessageDay(midnight, midnight - 1000)).toBe(true);
    expect(startsMessageDay(midnight + 12 * 3600000, midnight)).toBe(false);
    expect(startsMessageDay(0)).toBe(false);
  });

  it("handles SDK timestamps in seconds or milliseconds consistently", () => {
    expect(messageDate(midnight / 1000).valueOf()).toBe(midnight);
    expect(startsMessageDay(midnight, midnight / 1000)).toBe(false);
  });
});

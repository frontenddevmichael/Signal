import { describe, expect, it } from "vitest";
import {
  ALL_TIMEZONES,
  TIMEZONE_GROUPS,
  defaultTimezone,
} from "../src/lib/timezones";

describe("timezone selector list", () => {
  it("contains the anchor zones the PRD implies (Lagos, Nairobi, UTC)", () => {
    expect(ALL_TIMEZONES).toContain("Africa/Lagos");
    expect(ALL_TIMEZONES).toContain("Africa/Nairobi");
    expect(ALL_TIMEZONES).toContain("UTC");
  });

  it("has no duplicate entries across groups", () => {
    expect(new Set(ALL_TIMEZONES).size).toBe(ALL_TIMEZONES.length);
  });

  it("only contains well-formed IANA identifiers", () => {
    for (const z of ALL_TIMEZONES) {
      // Region/City or the bare "UTC" anchor.
      expect(z).toMatch(/^[A-Za-z_]+(?:\/[A-Za-z_]+)*$/);
    }
  });

  it("groups are non-empty and every zone belongs to exactly one group", () => {
    const grouped = TIMEZONE_GROUPS.flatMap((g) => g.zones);
    expect(grouped.length).toBe(ALL_TIMEZONES.length);
    for (const g of TIMEZONE_GROUPS) {
      expect(g.zones.length).toBeGreaterThan(0);
    }
  });
});

describe("defaultTimezone", () => {
  it("returns the browser zone when it is in the list", () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (ALL_TIMEZONES.includes(tz)) {
      expect(defaultTimezone()).toBe(tz);
    }
  });

  it("falls back to UTC when the browser zone is exotic", () => {
    const original = Intl.DateTimeFormat;
    // Simulate a zone the curated list doesn't cover.
    Intl.DateTimeFormat = class extends original {
      static resolvedOptions() {
        return { timeZone: "Antarctica/Troll" };
      }
    } as typeof Intl.DateTimeFormat;
    expect(defaultTimezone()).toBe("UTC");
    Intl.DateTimeFormat = original;
  });

  it("returns UTC if Intl is unavailable", () => {
    const original = Intl;
    // @ts-expect-error — simulated failure
    globalThis.Intl = undefined;
    expect(defaultTimezone()).toBe("UTC");
    globalThis.Intl = original;
  });
});

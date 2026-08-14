import { describe, expect, it } from "vitest";
import { buildMonthGrid, dayKey, monthRange } from "../convex/calendarLogic";

describe("monthRange", () => {
  it("spans exactly one calendar month (local midnight boundaries)", () => {
    // Local-time assertions: toISOString() would shift local midnight to UTC.
    const { start, end } = monthRange(2026, 7); // August 2026
    const s = new Date(start);
    expect([s.getFullYear(), s.getMonth(), s.getDate()]).toEqual([2026, 7, 1]);
    const e = new Date(end);
    expect([e.getFullYear(), e.getMonth(), e.getDate()]).toEqual([2026, 8, 1]);
    expect(end - start).toBe(31 * 24 * 60 * 60 * 1000);
  });

  it("handles December to January rollover", () => {
    const { start, end } = monthRange(2026, 11);
    expect(new Date(start).getMonth()).toBe(11);
    expect(new Date(end).getFullYear()).toBe(2027);
    expect(new Date(end).getMonth()).toBe(0);
  });
});

describe("buildMonthGrid (Monday-first, 42 cells)", () => {
  it("returns 42 cells", () => {
    expect(buildMonthGrid(2026, 7)).toHaveLength(42);
  });

  it("starts the first row on the Monday on/before the 1st", () => {
    // August 2026: the 1st is a Saturday → row starts Monday 2026-07-27.
    const grid = buildMonthGrid(2026, 7);
    expect(grid[0].date.getDay()).toBe(1); // Monday
    expect(grid[0].date.getDate()).toBe(27);
    expect(grid[0].date.getMonth()).toBe(6); // July (out-of-month lead)
    expect(grid[0].inMonth).toBe(false);
  });

  it("marks in-month cells correctly", () => {
    const grid = buildMonthGrid(2026, 7);
    const inMonth = grid.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(31);
    // The 1st (Saturday) must be in-month.
    expect(grid.find((c) => c.date.getDate() === 1)?.inMonth).toBe(true);
  });

  it("is contiguous — each cell is the next day of the previous", () => {
    const grid = buildMonthGrid(2026, 7);
    for (let i = 1; i < grid.length; i++) {
      const prev = grid[i - 1].date.getTime();
      const cur = grid[i].date.getTime();
      expect(cur - prev).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("handles February of a leap year", () => {
    const grid = buildMonthGrid(2024, 1); // Feb 2024 — 29 days
    expect(grid.filter((c) => c.inMonth)).toHaveLength(29);
  });
});

describe("dayKey", () => {
  it("formats a local calendar day as YYYY-MM-DD", () => {
    expect(dayKey(new Date(2026, 7, 14, 23, 59).getTime())).toBe("2026-08-14");
  });

  it("pads months and days", () => {
    expect(dayKey(new Date(2026, 0, 5).getTime())).toBe("2026-01-05");
  });
});

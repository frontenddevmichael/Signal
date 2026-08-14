import { describe, expect, it, vi } from "vitest";
import { dueLabel } from "../src/lib/format";

const DAY = 86400000;

describe("dueLabel", () => {
  it("labels future dates as 'in Nd'", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 7, 14, 12, 0).getTime());
    expect(dueLabel(new Date(2026, 7, 17, 12, 0).getTime())).toBe("in 3d");
    expect(dueLabel(new Date(2026, 7, 15, 12, 0).getTime())).toBe("in 1d");
  });

  it("labels today", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 7, 14, 9, 0).getTime());
    expect(dueLabel(new Date(2026, 7, 14, 23, 59).getTime())).toBe("today");
  });

  it("labels past dates as 'Nd overdue'", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 7, 14, 12, 0).getTime());
    expect(dueLabel(new Date(2026, 7, 12, 12, 0).getTime())).toBe("2d overdue");
  });

  it("labels today-past as plain 'overdue'", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 7, 14, 12, 0).getTime());
    expect(dueLabel(new Date(2026, 7, 14, 6, 0).getTime())).toBe("overdue");
  });

  it("restores the real clock", () => {
    vi.restoreAllMocks();
    expect(DAY).toBeGreaterThan(0);
  });
});

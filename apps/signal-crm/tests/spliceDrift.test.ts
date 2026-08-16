/* ============================================================
   Splice drift guard — the splice contract's promise is "look
   stays byte-identical" (design spec §3.2). The shared
   presentational layer (signal-ui) must never silently drift
   from the product's own register. These tests lock the three
   shared surfaces to their product-side sources:
     1. calendar logic   — signal-ui/calendar.ts ≡ convex/calendarLogic.ts
     2. token ladder     — signal-ui/tokens.css ≡ the product's :root tokens
     3. icon register    — stroke register (caps/joins/grid) matches
   If any of these drift, the landing demo quietly renders a
   different product than the real one — the exact failure mode
   the splice contract exists to prevent.
   ============================================================ */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ---- 1. Calendar logic — same pure math, both consumers ---------- */
import * as productCalendar from "../convex/calendarLogic";
import * as sharedCalendar from "signal-ui/calendar";

const months = [
  [2026, 0],
  [2026, 1],
  [2026, 2],
  [2026, 7], // August 2026 — the site demo month
  [2024, 1], // leap-year February
  [2025, 11], // December→January bleed
  [2024, 0],
] as const;

describe("splice: calendar logic stays byte-identical", () => {
  it("exposes the same public API surface", () => {
    expect(Object.keys(sharedCalendar).sort()).toEqual(Object.keys(productCalendar).sort());
  });

  it("computes identical month ranges across boundaries and leap years", () => {
    for (const [y, m] of months) {
      expect(sharedCalendar.monthRange(y, m), `${y}-${m + 1}`).toEqual(productCalendar.monthRange(y, m));
    }
  });

  it("builds identical 42-cell grids", () => {
    for (const [y, m] of months) {
      const s = sharedCalendar.buildMonthGrid(y, m);
      const p = productCalendar.buildMonthGrid(y, m);
      expect(s.length, `${y}-${m + 1} length`).toBe(p.length);
      for (let i = 0; i < s.length; i++) {
        expect(s[i].date.getTime(), `${y}-${m + 1} cell ${i}`).toBe(p[i].date.getTime());
        expect(s[i].inMonth, `${y}-${m + 1} cell ${i} inMonth`).toBe(p[i].inMonth);
      }
    }
  });

  it("uses identical day keys and weekday labels", () => {
    for (const [y, m] of months) {
      const probe = new Date(y, m, 15, 14, 30, 0, 0).getTime();
      expect(sharedCalendar.dayKey(probe)).toBe(productCalendar.dayKey(probe));
    }
    expect(sharedCalendar.WEEKDAY_LABELS).toEqual(productCalendar.WEEKDAY_LABELS);
    expect(sharedCalendar.WEEK_STARTS_ON).toBe(productCalendar.WEEK_STARTS_ON);
  });
});

/* ---- 2. Token ladder — every shared token, same value ------------- */
/** The product's DARK :root block only (the site is dark-only per spec
 *  §3.4; [data-theme="light"] is the product's inversion, not shared). */
function readDarkTokens(file: string): Map<string, string> {
  const text = readFileSync(file, "utf8");
  const dark = text.match(/:root\s*\{([^}]*)\}/);
  const map = new Map<string, string>();
  for (const m of (dark?.[1] ?? "").matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

describe("splice: token ladder stays byte-identical", () => {
  it("every signal-ui token matches the product's dark :root value", () => {
    const shared = readDarkTokens(resolve(ROOT, "../../packages/signal-ui/src/tokens.css"));
    const product = readDarkTokens(resolve(ROOT, "src/index.css"));
    // site-only helpers are allowed to be new (documented in tokens.css);
    // everything else must be the SAME value as the product's ladder.
    // site-only helpers are allowed to be new (documented in tokens.css);
    // the product names beacon-contrast as --on-beacon (same intent).
    const siteOnly = new Set(["canvas", "text-body", "mark", "font-sans", "font-mono", "beacon-contrast"]);
    let checked = 0;
    for (const [name, value] of shared) {
      if (siteOnly.has(name)) continue;
      // var() indirections resolve to the same chain on both sides — compare
      // against the product's value for the same name.
      const productValue = product.get(name);
      expect(productValue, `token --${name} must exist in the product's :root`).toBeDefined();
      expect(value, `token --${name} value`).toBe(productValue);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(40); // the shared ladder is substantial
  });
});

/* ---- 3. Icon register — same drawing register, both consumers ----- */
describe("splice: icon register matches", () => {
  it("caps/joins/grid are identical to the product's Icons.tsx", () => {
    const shared = readFileSync(resolve(ROOT, "../../packages/signal-ui/src/Icons.tsx"), "utf8");
    const product = readFileSync(resolve(ROOT, "src/components/Icons.tsx"), "utf8");
    const grab = (src: string, attr: string) => src.match(new RegExp(`${attr}=\\s*"([^"]+)"`))?.[1];
    for (const attr of ["strokeLinecap", "strokeLinejoin", "strokeWidth", "viewBox"]) {
      expect(grab(shared, attr), `signal-ui ${attr}`).toBe(grab(product, attr));
    }
  });
});

import { expect, test, type Page } from "@playwright/test";

/**
 * §3.3/§6.3 interactive demo guard — the palette inside the demo window
 * must genuinely work: real filter matching, real keyboard navigation
 * (arrows / Enter / Escape), and real client switching that re-renders
 * the shared ClientDetailShell. Interaction state is React state — the
 * same code path the product ships — so this is an end-to-end guard of
 * actual behavior, not a visual snapshot.
 *
 * The demo assembles on scroll (full mode) or via the one-shot timeline
 * (reduced-motion), and rows only accept pointer events once assembled
 * (GSAP gates pointer-events:none during construction), so each test
 * first reaches the assembled end state, then drives the palette.
 */

const PALETTE_INPUT = '.demo-palette input[aria-label="Search commands"]';
const ROWS = ".demo-palette .palp-row";
const LABEL = ".palp-label";

/**
 * Wait until the PALETTE itself accepts pointer events. It's the last piece
 * of the assembly (its tween ends at ~87% of the scrub), so this gates the
 * whole window being interactive — gating on the rows resolves too early:
 * they finish at ~51%, while the palette is still pointer-events:none and
 * clicks fall through to .demo-body beneath it.
 */
async function waitForInteractive(page: Page): Promise<void> {
  await expect
    .poll(() => page.locator(".demo-palette").evaluate((el) => getComputedStyle(el).pointerEvents), {
      timeout: 15_000,
    })
    .toBe("auto");
}

/**
 * Scroll the 300vh demo runway to its assembled end (scrub progress 1).
 * - Compute the absolute target only after fonts/layout settle: a target
 *   computed pre-refresh is wrong and the nudge lands short.
 * - Nudge with a gap and VERIFY the settle, re-nudging to the SAME value if
 *   Lenis's smoothing drifted (the hero pattern). Recomputing the target
 *   mid-flight from the moving rect is a trap (observed 4510/4193 vs 6248).
 */
async function scrollToAssembled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.fonts.status === "loaded", undefined, { timeout: 10_000 });
  await page.waitForTimeout(300);
  const target = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>(".demo-section")!;
    // Absolute position: section bottom meets viewport bottom. The section
    // is mid-page (unlike the hero), so offsetHeight alone is not enough.
    return section.getBoundingClientRect().top + window.scrollY + section.offsetHeight - innerHeight;
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate((t) => window.scrollTo(0, t), target);
    await page.waitForTimeout(800);
    const landed = await page.evaluate((t) => Math.abs(window.scrollY - t) < 4, target);
    if (landed) break;
  }
  await waitForInteractive(page);
}

test.describe("interactive demo", () => {
  test("palette filters by typed query, shows no-match, and clears on Escape", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("signal-site:motion", "full"));
    await page.goto("/");
    await scrollToAssembled(page);

    const input = page.locator(PALETTE_INPUT);
    await expect(input).toBeVisible();
    // Unfiltered: 3 actions + 3 clients + 2 invoices.
    await expect(page.locator(ROWS)).toHaveCount(8);

    // "nim" — the Nimbus client row AND the Nimbus invoice row survive
    // (substring match on every label, so the invoice's "— Nimbus" suffix
    // matches too); the other groups drop.
    await input.fill("nim");
    await expect(page.locator(ROWS)).toHaveCount(2);
    await expect(page.locator(LABEL)).toHaveText(["Nimbus", "INV-2026-0002 — Nimbus"]);
    await expect(page.locator(".palp-group-label")).toHaveText(["Clients", "Invoices"]);

    // "inv" — the action plus both invoice rows (Clients group drops).
    await input.fill("inv");
    await expect(page.locator(ROWS)).toHaveCount(3);
    await expect(page.locator(".palp-group-label")).toHaveText(["Actions", "Invoices"]);

    // No matches — explicit empty state, not a blank list.
    await input.fill("zzz");
    await expect(page.locator(".palp-empty")).toBeVisible();
    await expect(page.locator(".palp-empty")).toHaveText("No matches");

    // Escape clears the query and restores every row.
    await page.keyboard.press("Escape");
    await expect(input).toHaveValue("");
    await expect(page.locator(ROWS)).toHaveCount(8);
  });

  test("arrow keys move the active row with wrap-around; Enter selects", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("signal-site:motion", "full"));
    await page.goto("/");
    await scrollToAssembled(page);

    const input = page.locator(PALETTE_INPUT);
    await input.click();
    // Active starts at the first row.
    await expect(page.locator(ROWS).nth(0)).toHaveClass(/is-active/);

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(ROWS).nth(2)).toHaveClass(/is-active/);

    await page.keyboard.press("ArrowUp");
    await expect(page.locator(ROWS).nth(1)).toHaveClass(/is-active/);

    // Up from row 0 wraps to the last row (index 7).
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(ROWS).nth(0)).toHaveClass(/is-active/);
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(ROWS).nth(7)).toHaveClass(/is-active/);

    // Down from the last wraps back to row 0.
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(ROWS).nth(0)).toHaveClass(/is-active/);

    // Arrow to the Nimbus client row (index 4) and press Enter.
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
    await expect(page.locator(ROWS).nth(4)).toHaveClass(/is-active/);
    await page.keyboard.press("Enter");
    await expect(page.locator(".demo-topbar-client")).toHaveText("Nimbus");
    await expect(page.locator(".cds-title-row h3")).toContainText("Nimbus");
  });

  test("selecting clients re-renders the shared client detail end to end", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("signal-site:motion", "full"));
    await page.goto("/");
    await scrollToAssembled(page);

    const input = page.locator(PALETTE_INPUT);
    const topbarClient = page.locator(".demo-topbar-client");
    const detailName = page.locator(".cds-title-row h3");
    const billed = page.locator(".cds-stat-value").first();
    const firstRow = page.locator(".cds-tl-row").first();

    // Start: Acme Co.
    await expect(topbarClient).toHaveText("Acme Co.");
    await expect(billed).toHaveText("$42,180");

    // Keyboard path: 4 downs → Nimbus, Enter.
    await input.click();
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(topbarClient).toHaveText("Nimbus");
    await expect(detailName).toContainText("Nimbus");
    await expect(billed).toHaveText("$18,900");
    await expect(firstRow).toContainText("Note added");

    // Click path: the Meridian row.
    await page.locator(ROWS).filter({ hasText: "Meridian" }).click();
    await expect(topbarClient).toHaveText("Meridian");
    await expect(detailName).toContainText("Meridian");
    await expect(billed).toHaveText("$96,340");
    await expect(firstRow).toContainText("PR #128 merged");

    // Filter path: park the mouse on the input first — a stale row hover
    // (the physical mouse is still over the list from the click above)
    // overrides the onChange active-reset, and Enter would hit the wrong
    // row. Clicking the input ends the mouse on it, so no row is hovered.
    await input.click();
    await input.fill("acme");
    await page.keyboard.press("Enter");
    await expect(topbarClient).toHaveText("Acme Co.");
    await expect(detailName).toContainText("Acme Co.");
    await expect(billed).toHaveText("$42,180");
    await expect(firstRow).toContainText("PR #42 merged");
  });

  test("reduced-motion mode — demo assembles without scrolling and the palette still switches clients", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("signal-site:motion", "simple"));
    await page.goto("/");

    // The one-shot timeline assembles the whole window with no scroll —
    // this also guards the demo's simple-mode assembly path (previously
    // unguarded; only the hero had a reduced-motion guard).
    await waitForInteractive(page);
    await expect(page.locator(".demo-win")).toHaveCSS("opacity", "1");

    const input = page.locator(PALETTE_INPUT);
    await input.click();
    await input.fill("meridian");
    await page.keyboard.press("Enter");
    await expect(page.locator(".demo-topbar-client")).toHaveText("Meridian");
    await expect(page.locator(".cds-title-row h3")).toContainText("Meridian");
    await expect(page.locator(".cds-stat-value").first()).toHaveText("$96,340");
  });
});

import { expect, test, type Page } from "@playwright/test";

/**
 * §3.1 hero payoff guard — the assembled product window must actually
 * appear. Regression for the .is-full visibility gate: the scrub used to
 * animate every piece while the window itself stayed `visibility: hidden`
 * forever, so the chaos assembled into an empty background.
 *
 * Both motion modes are covered because they drive the gate differently:
 * - full (scroll-scrubbed): the class toggles from scroll progress.
 * - simple (reduced-motion): the one-shot timeline adds it directly.
 *
 * The localStorage override (signal-site:motion) pins each mode so the
 * gate's low-power heuristic can't silently flip the test machine.
 */

const WIN = ".hero-window";

/** Poll until the assembly lifts the window's visibility gate. */
async function waitForAssembled(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector(".hero-window")?.classList.contains("is-full"),
    undefined,
    { timeout: 15_000 }
  );
}

test.describe("hero assembly", () => {
  test("full mode — window assembles as you scroll", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("signal-site:motion", "full"));
    await page.goto("/");

    // Start state: the window is gated behind visibility:hidden + opacity 0.
    const win = page.locator(WIN);
    await expect(win).toHaveClass("hero-window");
    await expect
      .poll(() => win.evaluate((el) => getComputedStyle(el).visibility), { timeout: 10_000 })
      .toBe("hidden");

    // Scroll to the end of the 300vh runway (section bottom at viewport
    // bottom) — the scrub's assembled end state. Lenis smooth-scrolls, so
    // nudge twice and let the poll wait for the class flip.
    await page.evaluate(() => {
      const section = document.querySelector<HTMLElement>(".hero-section")!;
      const target = section.offsetHeight - innerHeight;
      window.scrollTo(0, target);
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const section = document.querySelector<HTMLElement>(".hero-section")!;
      window.scrollTo(0, section.offsetHeight - innerHeight);
    });

    await waitForAssembled(page);
    // The gate is lifted and the window is fully opaque.
    await expect.poll(() => win.evaluate((el) => getComputedStyle(el).visibility)).toBe("visible");
    await expect.poll(() => win.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    // A settled piece inside is actually rendered…
    await expect(page.locator(`${WIN} .ui-stats`)).toBeVisible();
    // …the clutter cards have tucked away…
    await expect
      .poll(() => page.locator(".chaos-card").first().evaluate((el) => getComputedStyle(el).visibility))
      .toBe("hidden");
    // …and the payoff caption resolved.
    await expect(page.locator(".hero-caption")).toHaveCSS("opacity", "1");
  });

  test("reduced-motion mode — window assembles without scrolling", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("signal-site:motion", "simple"));
    await page.goto("/");

    // No scroll needed: the one-shot timeline adds .is-full on its own.
    await waitForAssembled(page);
    await expect
      .poll(() => page.locator(WIN).evaluate((el) => getComputedStyle(el).visibility))
      .toBe("visible");
    await expect(page.locator(".hero-caption")).toHaveCSS("opacity", "1");
  });

  test("desktop split — headline left, clutter framing it, window right", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem("signal-site:motion", "full"));
    await page.goto("/");
    await page.waitForFunction(() => document.fonts.status === "loaded");
    await page.waitForTimeout(600);

    const geom = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>(".hero-stage")!.getBoundingClientRect();
      const intro = document.querySelector<HTMLElement>(".hero-intro")!.getBoundingClientRect();
      const wrap = document.querySelector<HTMLElement>(".hero-window-wrap")!.getBoundingClientRect();
      const kicker = document.querySelector<HTMLElement>(".hero-intro .section-kicker")!.getBoundingClientRect();
      const cards = [...document.querySelectorAll<HTMLElement>('[data-piece^="tuck"]')];
      const over = cards.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < intro.right && r.right > intro.left && r.top < intro.bottom && r.bottom > intro.top;
      });
      return {
        introLeft: Math.round(intro.left - stage.left),
        introRight: Math.round(intro.right - stage.left),
        introTop: Math.round(intro.top - stage.top),
        windowLeft: Math.round(wrap.left - stage.left),
        windowRight: Math.round(wrap.right - stage.left),
        kickerClearsTopbar: kicker.top >= 56,
        cardsCount: cards.length,
        cardsOverlappingIntro: over.length,
      };
    });

    // Side-by-side: intro owns the left half, window the right, no overlap.
    expect(geom.introLeft).toBeGreaterThanOrEqual(24);
    expect(geom.windowLeft).toBeGreaterThan(geom.introRight);
    expect(geom.windowRight).toBeLessThanOrEqual(1440);
    expect(geom.kickerClearsTopbar).toBe(true);
    // More clutter cards than before, and none covering the headline copy.
    expect(geom.cardsCount).toBeGreaterThanOrEqual(8);
    expect(geom.cardsOverlappingIntro).toBe(0);
  });

  test("mobile restack — headline above the window, no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem("signal-site:motion", "full"));
    await page.goto("/");
    await page.waitForFunction(() => document.fonts.status === "loaded");
    await page.waitForTimeout(600);

    const geom = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>(".hero-stage")!.getBoundingClientRect();
      const intro = document.querySelector<HTMLElement>(".hero-intro")!.getBoundingClientRect();
      const wrap = document.querySelector<HTMLElement>(".hero-window-wrap")!.getBoundingClientRect();
      const kicker = document.querySelector<HTMLElement>(".hero-intro .section-kicker")!.getBoundingClientRect();
      const tucksVisible = [...document.querySelectorAll<HTMLElement>('[data-piece^="tuck"]')].filter(
        (el) => getComputedStyle(el).display !== "none"
      ).length;
      return {
        introTop: Math.round(intro.top - stage.top),
        introBottom: Math.round(intro.bottom - stage.top),
        windowTop: Math.round(wrap.top - stage.top),
        windowBottom: Math.round(wrap.bottom - stage.top),
        kickerClearsTopbar: kicker.top >= 56,
        introAboveWindow: intro.bottom <= wrap.top,
        tucksVisible,
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    expect(geom.kickerClearsTopbar).toBe(true);
    expect(geom.introAboveWindow).toBe(true);
    expect(geom.windowBottom).toBeLessThanOrEqual(844);
    expect(geom.tucksVisible).toBe(0); // clutter cards are desktop-only
    expect(geom.overflowX).toBe(false);
  });
});

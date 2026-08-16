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
});

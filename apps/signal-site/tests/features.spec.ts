import { expect, test } from "@playwright/test";

/**
 * §3.2 features sequence guard — the three blocks must assemble BEFORE the
 * traveler register appears, and the traveler enters the first block as its
 * own beat (it is never parked in the GitHub slot before anything else).
 * Also guards the removal of the connector "trail line" between panels.
 */

test.describe("features pipeline sequence", () => {
  test("blocks assemble first, then the traveler enters the first block", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem("signal-site:motion", "full"));
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.fonts.status === "loaded");
    await page.waitForTimeout(600);

    const featTop = await page.evaluate(
      () => document.getElementById("features")!.getBoundingClientRect().top + window.scrollY
    );
    await page.evaluate((y) => window.scrollTo(0, y), featTop);
    await page.waitForTimeout(800);
    await page.waitForFunction(() => !!window.__featTlDesktop && document.body.dataset.featHooks === "desktop", undefined, {
      timeout: 10_000,
    });

    // Scrub to the middle of the assembly — the panels must be visible
    // while the traveler is still hidden (it enters after assembly).
    const midAssembly = await page.evaluate(() => {
      const tl = (window as any).__featTlDesktop;
      tl.progress(0.3 / tl.duration(), false);
      const panels = [...document.querySelectorAll(".feat-panel")].map((p) => parseFloat(getComputedStyle(p).opacity));
      const traveler = parseFloat(getComputedStyle(document.querySelector(".feat-traveler")!).opacity);
      return { panels, traveler };
    });
    expect(midAssembly.panels.every((o) => o > 0)).toBe(true);
    expect(midAssembly.traveler).toBe(0);

    // Scrub to the enter beat — the traveler has landed in the first block.
    const entered = await page.evaluate(() => {
      const tl = (window as any).__featTlDesktop;
      tl.progress(1.0 / tl.duration(), false);
      const traveler = parseFloat(getComputedStyle(document.querySelector(".feat-traveler")!).opacity);
      const tr = document.querySelector(".feat-traveler")!.getBoundingClientRect();
      const gh = document.querySelector(".feat-panel[data-feat='gh']")!.getBoundingClientRect();
      return { traveler, overGh: tr.left >= gh.left - 4 && tr.right <= gh.right + 4 };
    });
    expect(entered.traveler).toBeGreaterThan(0.9);
    expect(entered.overGh).toBe(true);

    // No connector lines exist at all — the trail is gone.
    const wireCount = await page.evaluate(() => document.querySelectorAll(".feat-conn").length);
    expect(wireCount).toBe(0);
  });
});

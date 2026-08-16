import { expect, test, type Page } from "@playwright/test";

/**
 * §3.4 list register — Follow-ups + Inbox row guards.
 *
 * Guards the 2d rebuild of the `.nudge-row` / `.inbox-row` layout block:
 * - No horizontal page overflow on either screen at mobile width (the
 *   min-width:0 + wrap-guard fix — long row content must never push the
 *   action row off the card).
 * - When rows are present (deployment has follow-up-eligible contacts or
 *   unmatched messages), the narrow-width wrap guard is LIVE at 390px:
 *   `.nudge-row` resolves flex-wrap: wrap and `.nudge-body` carries
 *   min-width: 0.
 *
 * Data-dependent assertions are conditional (rows only exist when the DB
 * has 7+ day-inactive contacts / unmatched messages), so the suite is
 * deterministic on populated deployments and graceful on fresh ones —
 * the overflow contract always runs.
 *
 * Run with:  npx playwright test tests/followups-inbox-rows.spec.ts
 * Requires the Vite dev server + a running local Convex dev server.
 */

const EMAIL = "dev@signal.test";
const PASSWORD = "Dev-Password-456";

async function signIn(page: Page) {
  await page.goto("/");
  await page.waitForSelector("#email", { timeout: 20_000 });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  const shell = page.locator("main");
  const alert = page.locator("[role=alert]");
  await Promise.race([
    shell.waitFor({ state: "visible", timeout: 10_000 }),
    alert.waitFor({ state: "visible", timeout: 10_000 }),
  ]);

  if (!(await shell.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /create one/i }).click();
    await page.getByRole("button", { name: "Create account" }).click();
    await shell.waitFor({ state: "visible", timeout: 10_000 });
  }
}

/** Wait until a screen settles into a data state (list OR empty state), never the skeleton. */
async function settle(page: Page) {
  await page
    .locator(".nudge-list, .inbox-list, .empty-state")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
}

test.describe("§3.4 follow-ups + inbox rows", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("390px: no overflow on either screen; wrap guard live when rows exist", async ({ page }) => {
    await signIn(page);

    // Follow-ups
    await page.goto("/followups");
    await settle(page);
    const nudgeRows = page.locator(".nudge-row");
    if ((await nudgeRows.count()) > 0) {
      // Long reasons wrap inside the body (min-width:0) instead of pushing
      // the action row off the card…
      const bodyMinWidth = await nudgeRows
        .first()
        .locator(".nudge-body")
        .evaluate((el) => getComputedStyle(el).minWidth);
      expect(bodyMinWidth).toBe("0px");
      // …and the ≤480px guard lets the action row drop to its own line.
      const rowWrap = await nudgeRows
        .first()
        .evaluate((el) => getComputedStyle(el).flexWrap);
      expect(rowWrap).toBe("wrap");
    }
    const overflowF = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflowF).toBeLessThanOrEqual(0);

    // Inbox
    await page.goto("/inbox");
    await settle(page);
    const inboxHead = page.locator(".inbox-head").first();
    if ((await page.locator(".inbox-row").count()) > 0) {
      const headWrap = await inboxHead.evaluate((el) => getComputedStyle(el).flexWrap);
      expect(headWrap).toBe("wrap");
    }
    const overflowI = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflowI).toBeLessThanOrEqual(0);
  });
});

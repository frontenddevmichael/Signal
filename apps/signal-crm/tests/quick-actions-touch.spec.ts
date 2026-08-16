import { expect, test } from "@playwright/test";

const EMAIL = "dev@signal.test";
const PASSWORD = "Dev-Password-456";

/**
 * §5.8 touch floor — hover-revealed quick actions are a keyboard-only-adjacent
 * affordance: on touch there is no hover, so the §2.6 reveal never fires and
 * the row's secondary actions would be invisible-but-tappable. Under
 * `(hover: none)` they show at rest, and the 28px visual pads its tap target
 * out to the 44px floor via an ::after overlay (row density preserved).
 */
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Post-auth landing can take several seconds under the loaded dev backend.
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible({ timeout: 15_000 });
}

async function ensureRow(page: import("@playwright/test").Page) {
  const rows = page.locator(".data-table tbody tr");
  // count() doesn't wait — give the table a real window to load before
  // deciding to seed. Under a loaded dev backend the clients query can take
  // a few seconds, and a premature count=0 would open a spurious create
  // dialog and race the row's own wait on the mutation round-trip.
  try {
    await rows.first().waitFor({ state: "visible", timeout: 10_000 });
    return;
  } catch {
    // account is empty — seed one client below
  }
  await page.getByRole("button", { name: "Add client" }).first().click();
  const stamp = Date.now();
  await page.locator("#cf-name").fill(`Touch probe ${stamp}`);
  await page.locator("#cf-company").fill(`Company ${stamp}`);
  await page.getByRole("button", { name: "Add client" }).last().click();
  await expect(page.locator(".data-table tbody tr").first()).toBeVisible({ timeout: 15_000 });
}

const opacityOf = (locator: import("@playwright/test").Locator) =>
  locator.evaluate((el) => getComputedStyle(el).opacity);

test.describe("hover-revealed quick actions on touch", () => {
  test("fine pointer: reveal stays hover-gated", async ({ page }) => {
    await signIn(page);
    await ensureRow(page);
    await expect(await opacityOf(page.locator(".data-table tbody tr").first().locator(".quick-actions"))).toBe("0");
    // Hover reveals them (the §2.6 progressive-disclosure path).
    await page.locator(".data-table tbody tr").first().hover();
    await expect
      .poll(() => opacityOf(page.locator(".data-table tbody tr").first().locator(".quick-actions")))
      .toBe("1");
  });

  test.describe("coarse pointer", () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test("actions visible at rest; 44px tap target", async ({ page }) => {
      // Deterministic: force hover:none via CDP (touch emulation + media
      // query parity varies by Chromium version).
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setEmulatedMedia", {
        features: [
          { name: "hover", value: "none" },
          { name: "any-hover", value: "none" },
        ],
      });

      await signIn(page);
      await ensureRow(page);

      const row = page.locator(".data-table tbody tr").first();
      // At rest — no hover, no focus — the actions are visible, not hidden.
      await expect.poll(() => opacityOf(row.locator(".quick-actions"))).toBe("1");
      // …and stay visible even under a synthetic hover (they never disappear).
      await row.hover();
      await expect.poll(() => opacityOf(row.locator(".quick-actions"))).toBe("1");

      // Tap target: the 28px visual pads out via ::after inset -8px → 44px.
      const inset = await row
        .locator(".quick-action")
        .evaluate((el) => {
          const cs = getComputedStyle(el, "::after");
          return { top: cs.top, left: cs.left };
        });
      expect(inset.top).toBe("-8px");
      expect(inset.left).toBe("-8px");

      // The action actually works by tap (navigates into the client).
      await row.locator(".quick-action").click();
      await expect(page).toHaveURL(/\/clients\//);
    });
  });
});

import { expect, test } from "@playwright/test";

const EMAIL = "dev@signal.test";
const PASSWORD = "Dev-Password-456";

/**
 * Command palette footer adapts per device: arrow-key hints are keyboard-only
 * noise on touch, so under a coarse primary pointer they swap for a search
 * cue. Fine pointers (incl. touchscreen laptops with a trackpad) keep the
 * keyboard hints; ↵ open / esc close stay on both, since tablets have
 * hardware keyboards.
 */
async function signInAndOpenPalette(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.locator(".command-palette")).toBeVisible();
}

test.describe("command palette device-adaptive footer", () => {
  test("fine pointer: arrow hints shown, search cue hidden", async ({ page }) => {
    await signInAndOpenPalette(page);
    await expect(page.locator(".palette-hint-nav")).toBeVisible();
    await expect(page.locator(".palette-hint-touch")).toBeHidden();
    await expect(page.getByText("Type to search")).toBeHidden();
    // open/close hints remain on desktop.
    await expect(page.locator(".palette-footer")).toContainText("open");
    await expect(page.locator(".palette-footer")).toContainText("close");
  });

  test.describe("coarse pointer (touch)", () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test("search cue replaces arrow hints; open/close stay", async ({ page }) => {
      // Deterministic: force the primary pointer to coarse via CDP even
      // though hasTouch is on (Chromium touch emulation + media query parity
      // varies by version).
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setEmulatedMedia", {
        features: [
          { name: "pointer", value: "coarse" },
          { name: "any-pointer", value: "coarse" },
        ],
      });

      await signInAndOpenPalette(page);

      await expect(page.locator(".palette-hint-nav")).toBeHidden();
      await expect(page.locator(".palette-hint-touch")).toBeVisible();
      await expect(page.getByText("Type to search")).toBeVisible();
      // The search cue is a real affordance with a hidden-from-SR glyph.
      await expect(page.locator(".palette-hint-touch svg")).toHaveAttribute("aria-hidden", "true");
      // ↵ open / esc close are retained for hardware keyboards.
      await expect(page.locator(".palette-footer")).toContainText("open");
      await expect(page.locator(".palette-footer")).toContainText("close");
    });
  });
});

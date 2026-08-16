import { expect, test } from "@playwright/test";

const EMAIL = "dev@signal.test";
const PASSWORD = "Dev-Password-456";

/**
 * §3.0/§3.1 — form controls get the SINGLE 2px beacon focus ring, same as
 * every other control (the old border-strong + box-shadow halo on .input is
 * deleted). Verified with real keyboard focus semantics (focusVisible flag)
 * in both modes, since the beacon token resolves to text-primary per mode.
 */
test.describe("form focus ring (§3.0)", () => {
  test("input shows the 2px beacon ring, not the old halo — dark + light", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();

    await page.getByRole("button", { name: "Add client" }).first().click();
    const name = page.locator("#cf-name");
    await expect(name).toBeVisible();

    // Real keyboard-focus semantics — programmatic focus with focusVisible
    // matches the :focus-visible pseudo-class exactly.
    await name.focus({ focusVisible: true });

    const check = async () => {
      const ring = await name.evaluate((el) => {
        const cs = getComputedStyle(el);
        // Resolve the --beacon token chain (it aliases --text-primary per
        // mode) through a probe element rather than reading the raw var().
        const probe = document.createElement("span");
        probe.style.color = "var(--beacon)";
        document.body.appendChild(probe);
        const beacon = getComputedStyle(probe).color;
        probe.remove();
        return {
          style: cs.outlineStyle,
          width: cs.outlineWidth,
          offset: cs.outlineOffset,
          color: cs.outlineColor,
          boxShadow: cs.boxShadow,
          beacon,
        };
      });
      expect(ring.style).toBe("solid");
      expect(ring.width).toBe("2px");
      expect(ring.offset).toBe("2px");
      // Ring is the beacon (resolves to text-primary in both modes)…
      expect(ring.color).toBe(ring.beacon);
      // …and the old halo box-shadow is gone.
      expect(ring.boxShadow).toBe("none");
    };

    // Dark (default :root).
    await check();

    // Light mode — same register, different beacon resolution.
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await check();
  });
});

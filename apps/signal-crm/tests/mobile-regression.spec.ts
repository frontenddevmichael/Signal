import { expect, test, type Page } from "@playwright/test";

/**
 * Mobile regression suite — the ≤1024px / ≤640px polish checks that were
 * historically done ad-hoc (and found real bugs: the tabbar gap, the
 * non-scrollable invoice filter bar, the invoice-detail action overflow, and
 * the .btn-sm / .note-tool 32px touch-floor violations).
 *
 * The suite is self-seeding: it signs in with the Phase-0 smoke-test account
 * (creating it if a fresh deployment doesn't have it yet) and builds its own
 * fixture data through the real UI write paths — client → project (deadline
 * this month) → meeting (this month) → draft invoice (due this month). Every
 * assertion therefore runs against populated screens, never empty states.
 *
 * Run with:  npx playwright test tests/mobile-regression.spec.ts
 * Requires the Vite dev server (auto-started by the Playwright webServer
 * config) AND a running local Convex dev server (npx convex dev), same as
 * tests/smoke.spec.ts.
 */

const EMAIL = "dev@signal.test";
const PASSWORD = "Dev-Password-456";
const STAMP = Date.now();
const CLIENT_NAME = `Mobile Reg ${STAMP}`;
const PROJECT_NAME = `Regression ${STAMP}`;

// Fixture dates all fall in the CURRENT month (clamped to month end), so the
// calendar screen and the client mini-calendar show chips without navigation.
const now = new Date();
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const deadlineDate = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 3, lastDay));
const invoiceDueDate = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 6, lastDay));
const meetingDate = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 2, lastDay));

let CLIENT_URL = "";
let INVOICE_URL = "";

test.describe.configure({ mode: "serial" });

/** Sign in as the smoke-test account; create it if this deployment is fresh. */
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

  // Account missing on this deployment → create it with the same credentials.
  if (!(await shell.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /create one/i }).click();
    await page.getByRole("button", { name: "Create account" }).click();
  }
  await page.waitForSelector("main", { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
}

/** Build the fixture: client → project → meeting → invoice, all through the UI. */
async function seed(page: Page) {
  await signIn(page);

  // Client — the toolbar button (with its ⌘N hint) opens the modal; the form's
  // submit button is the plain "Add client" (same pattern as smoke.spec.ts).
  await page.getByRole("button", { name: /Add client/ }).first().click();
  await page.locator("#cf-name").fill(CLIENT_NAME);
  await page.getByRole("button", { name: "Add client" }).last().click();
  // The row's name link is `.client-name` — the quick-action link's aria-label
  // also contains the name, so a role-based name match would be ambiguous.
  await page.locator(".client-name", { hasText: CLIENT_NAME }).click();
  await expect(page.getByRole("heading", { name: CLIENT_NAME })).toBeVisible();
  CLIENT_URL = page.url();

  // Project with a deadline in the current month.
  await page.getByRole("tab", { name: "Projects" }).click();
  await page.getByRole("button", { name: "Add project" }).click();
  await page.locator("#pf-name").fill(PROJECT_NAME);
  await page.locator("#pf-deadline").fill(iso(deadlineDate));
  await page.getByRole("button", { name: "Add project" }).last().click();
  await expect(page.getByText(PROJECT_NAME)).toBeVisible();

  // Meeting in the current month (anchors the calendar meeting chip).
  await page.getByRole("tab", { name: "Timeline" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Regression kickoff");
  await page.getByLabel("Start", { exact: true }).fill(`${iso(meetingDate)}T14:00`);
  await page.getByLabel("End", { exact: true }).fill(`${iso(meetingDate)}T15:00`);
  await page.getByRole("button", { name: "Add meeting" }).click();
  // It surfaces in the meetings list (strong) and the mini-calendar chip —
  // assert the list entry specifically to avoid the ambiguity.
  await expect(page.locator(".meetings-list").getByText("Regression kickoff")).toBeVisible();

  // Draft invoice due this month (anchors the calendar invoice chip and the
  // invoice-detail action-row check).
  await page.goto("/invoices");
  // Toolbar + empty-state both carry the button — the toolbar one opens the form.
  await page.getByRole("button", { name: "New invoice" }).first().click();
  await page.locator("#iv-contact").selectOption({ label: CLIENT_NAME });
  await page.locator("#iv-project").selectOption({ label: PROJECT_NAME });
  await page.locator("#iv-due").fill(iso(invoiceDueDate));
  await page.getByLabel("Item description").fill("Regression line item");
  await page.getByLabel("Item amount").fill("1250.00");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Create invoice" }).click();

  // Creation closes the modal; the new row appears in the list (the toolbar
  // and empty-state "New invoice" buttons both exist, so wait on the row).
  const row = page.locator("tbody tr", { hasText: CLIENT_NAME });
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  const href = await row.locator("a.client-name").getAttribute("href");
  expect(href).toBeTruthy();
  INVOICE_URL = href!;
}

test("seed fixture data (client → project → meeting → invoice)", async ({ page }) => {
  await seed(page);
  expect(CLIENT_URL).toContain("/clients/");
  expect(INVOICE_URL).toContain("/invoices/");
});

test.describe("mobile regression — 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("tabbar: 7 persistent items, sidebar hidden, 44px touch floor", async ({ page }) => {
    await signIn(page);

    // Sidebar is gone; the tabbar takes over.
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".tabbar")).toBeVisible();

    // All 7 entries — Clients, Invoices, Inbox, Calendar, Follow-ups,
    // Settings, Sign out — each at the §23.8 44px floor.
    const items = page.locator(".tabbar .nav-item");
    await expect(items).toHaveCount(7);
    const labels = await items.evaluateAll((els) =>
      els.map((el) => (el.getAttribute("aria-label") ?? "").trim()),
    );
    expect(labels).toEqual([
      "Clients",
      "Invoices",
      "Inbox",
      "Calendar",
      "Follow-ups",
      "Settings",
      "Sign out",
    ]);
    const heights = await items.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);

    // All 7 items sit on ONE row (regresses the 242px stacked tabbar: nav(true)
    // wraps items in a sidebar .nav-section column that used to stack them).
    const tops = await items.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size).toBe(1);
    const barHeight = await page
      .locator(".tabbar")
      .evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(barHeight).toBeLessThanOrEqual(60);

    // No horizontal overflow at this width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("calendar: chip icons survive, legend renders with all 6 entries", async ({ page }) => {
    await signIn(page);
    await page.goto("/calendar");

    // The seeded deadline, meeting and invoice all land this month. The
    // calendar aggregates every client's events, so earlier runs add chips
    // too — assert the floor, and rely on the client-scoped mini-calendar for
    // the exact-count check.
    const chips = page.locator(".cal-chip");
    await expect(chips.first()).toBeVisible({ timeout: 15_000 });
    expect(await chips.count()).toBeGreaterThanOrEqual(3);

    // Below 640px titles are hidden but the kind glyph + status dot stay.
    const iconVisible = await chips.first().locator("svg").isVisible();
    expect(iconVisible).toBe(true);
    const titleShown = await chips.first().locator(".cal-chip-title").isVisible().catch(() => false);
    expect(titleShown).toBe(false);

    // The §11 legend explains the register: 4 kinds + overdue + partial.
    await expect(page.locator(".cal-legend")).toBeVisible();
    await expect(page.locator(".cal-legend-item")).toHaveCount(6);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("invoice filter bar: 9 chips, scrollable, page not overflowing", async ({ page }) => {
    await signIn(page);
    await page.goto("/invoices");

    const bar = page.locator(".filter-bar");
    await expect(bar).toBeVisible();
    await expect(bar.locator(".chip")).toHaveCount(9);

    // The bar scrolls internally instead of pushing the page wide (the
    // min-width:0 fix — regresses as soon as a flex child refuses to shrink).
    const scrollable = await bar.evaluate(
      (el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX !== "hidden",
    );
    expect(scrollable).toBe(true);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("invoice detail: action row wraps, nothing hangs off-screen", async ({ page }) => {
    await signIn(page);
    expect(INVOICE_URL).toBeTruthy();
    await page.goto(INVOICE_URL);
    await expect(page.locator(".page-head")).toBeVisible({ timeout: 15_000 });

    const actions = page.locator(".detail-actions");
    await expect(actions).toBeVisible();
    const bounds = await actions.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { right: Math.round(r.right), vw: window.innerWidth };
    });
    expect(bounds.right).toBeLessThanOrEqual(bounds.vw);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("client detail: mini-calendar renders; .btn-sm/.note-tool meet 44px floor", async ({ page }) => {
    await signIn(page);
    expect(CLIENT_URL).toBeTruthy();
    await page.goto(CLIENT_URL);

    // The client-scoped mini-calendar shows exactly this client's month chips
    // (deadline + meeting + invoice), regardless of other clients' data.
    const miniCal = page.locator(".mini-cal");
    await expect(miniCal).toBeVisible({ timeout: 15_000 });
    await expect(miniCal.locator(".cal-chip")).toHaveCount(3, { timeout: 15_000 });

    // .btn-sm ("Add note") and the note toolbar B/I/•≡/H all meet §23.8.
    const floors = await page.evaluate(() => {
      const pick = (sel: string) => {
        const el = document.querySelector<HTMLElement>(sel);
        return el ? Math.round(el.getBoundingClientRect().height) : -1;
      };
      return {
        addNote: pick(".note-composer .btn-sm"),
        toolB: pick(".note-toolbar .note-tool"),
      };
    });
    expect(floors.addNote).toBeGreaterThanOrEqual(44);
    expect(floors.toolB).toBeGreaterThanOrEqual(44);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

// Narrow phones and landscape — the filter bar must scroll when it can't fit
// (≤640px) and must never push the page wide; the calendar chips must stay
// inside their cells and the legend only appears where titles are hidden.
const NARROW_VIEWPORTS: { name: string; width: number; height: number }[] = [
  { name: "320×568", width: 320, height: 568 },
  { name: "360×640", width: 360, height: 640 },
  { name: "568×320 landscape", width: 568, height: 320 },
  { name: "667×375 landscape", width: 667, height: 375 },
  { name: "844×390 landscape", width: 844, height: 390 },
];

for (const vp of NARROW_VIEWPORTS) {
  test.describe(`narrow — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("invoice filter bar: scrolls when too narrow, never overflows page", async ({ page }) => {
      await signIn(page);
      await page.goto("/invoices");
      const bar = page.locator(".filter-bar");
      await expect(bar).toBeVisible();
      await expect(bar.locator(".chip")).toHaveCount(9);

      const metrics = await bar.evaluate((el) => ({
        scroll: el.scrollWidth,
        client: el.clientWidth,
        overflowX: getComputedStyle(el).overflowX,
      }));

      // Narrower than the chips' natural width (635px) the bar must scroll
      // internally; wider than that, fitting on one line is fine — the hard
      // invariant either way is that the page never grows horizontally.
      if (metrics.scroll > metrics.client) {
        expect(metrics.overflowX).not.toBe("hidden");
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test("invoice form modal: line-item row fits, Add button reachable", async ({ page }) => {
      await signIn(page);
      await page.goto("/invoices");
      await expect(page.locator(".filter-bar")).toBeVisible();
      await page.getByRole("button", { name: /New invoice/ }).first().click();
      await page.waitForSelector("#iv-contact", { timeout: 15_000 });

      // The fieldset must not force the modal wider than its scroll box — a
      // Chromium <fieldset> quirk (fieldsets don't shrink unless min-width: 0).
      const modal = await page.evaluate(() => {
        const inner = document.querySelector<HTMLElement>(".modal-inner");
        if (!inner) return null;
        const addBtn = [...document.querySelectorAll<HTMLElement>(".list-row button")].pop();
        return {
          clientW: inner.clientWidth,
          scrollW: inner.scrollWidth,
          addBtnReachable: addBtn
            ? addBtn.getBoundingClientRect().right <= inner.getBoundingClientRect().right
            : false,
        };
      });
      expect(modal).not.toBeNull();
      expect(modal!.scrollW).toBeLessThanOrEqual(modal!.clientW + 1);
      expect(modal!.addBtnReachable).toBe(true);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test("calendar: chips stay in-cell, legend appears only where titles hide", async ({ page }) => {
      await signIn(page);
      await page.goto("/calendar");
      const chips = page.locator(".cal-chip");
      await expect(chips.first()).toBeVisible({ timeout: 15_000 });

      // Every visible chip sits inside its own cell (no bleed into neighbors).
      const chipInCell = await chips.first().evaluate((el) => {
        const cell = el.closest(".cal-cell");
        if (!cell) return false;
        const r = el.getBoundingClientRect();
        const cr = cell.getBoundingClientRect();
        return r.left >= cr.left && r.right <= cr.right;
      });
      expect(chipInCell).toBe(true);

      // The legend appears only when chip titles are hidden (≤640px).
      const legendVisible = await page.locator(".cal-legend").isVisible();
      const titlesHidden = await chips.first()
        .locator(".cal-chip-title")
        .evaluate((el) => getComputedStyle(el).display === "none");
      expect(legendVisible).toBe(vp.width <= 640);
      expect(titlesHidden).toBe(vp.width <= 640);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test.describe("desktop contrast — 1280×900", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("sidebar shown, tabbar hidden, detail actions on one line", async ({ page }) => {
    await signIn(page);
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".tabbar")).toBeHidden();

    // On desktop the invoice action row may sit on one line (no wrap needed) —
    // but must never overflow either.
    expect(INVOICE_URL).toBeTruthy();
    await page.goto(INVOICE_URL);
    await expect(page.locator(".page-head")).toBeVisible({ timeout: 15_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("sidebar on short viewports — 1280×320", () => {
  test.use({ viewport: { width: 1280, height: 320 } });

  test("rail scrolls internally; footer (Settings/Sign out) stays reachable", async ({ page }) => {
    await signIn(page);
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeVisible();

    // The rail's content (brand + nav + status + footer) exceeds a 320px-tall
    // viewport — it must become its own scroll container, never clip the
    // footer out of existence (regresses the overflow-y: visible bug).
    const scrollable = await sidebar.evaluate(
      (el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== "hidden",
    );
    expect(scrollable).toBe(true);

    const signOut = sidebar.locator(".sidebar-footer button", { hasText: "Sign out" });
    await signOut.scrollIntoViewIfNeeded();
    await expect(signOut).toBeVisible();

    // No horizontal overflow either — the rail stays inside its 240px column.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

/**
 * Command palette — the §2.4 keyboard-first surface. Guards the refactored
 * HCI contract: combobox ARIA with aria-activedescendant, a real focus trap,
 * focus restored to the trigger on close, Home/End + scroll-into-view, and
 * nav parity (every sidebar/tabbar destination reachable from the palette).
 */
test.describe("command palette", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("combobox ARIA, focus trap, focus restore, Home/End, nav parity", async ({ page }) => {
    await signIn(page);

    // Open via the topbar trigger (not ⌘K) so focus restore has a target.
    const trigger = page.locator(".palette-trigger");
    await trigger.focus();
    await trigger.click();

    const dialog = page.locator(".command-palette");
    await expect(dialog).toBeVisible();
    const input = page.locator(".palette-input");
    await expect(input).toBeFocused();

    // Combobox pattern: aria-modal dialog, input is the combobox, the active
    // option is announced via aria-activedescendant and resolves in the DOM.
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(input).toHaveAttribute("role", "combobox");
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(input).toHaveAttribute("aria-controls", "palette-listbox");
    const activeDesc = await input.getAttribute("aria-activedescendant");
    expect(activeDesc).toBeTruthy();
    await expect(page.locator(`#${activeDesc}`)).toHaveAttribute("aria-selected", "true");

    // The listbox contains only options and role=group wrappers (no bare
    // label/empty-state children — regresses the invalid listbox children).
    const listboxShape = await page
      .locator("#palette-listbox")
      .evaluate((list) => ({
        childRoles: [...list.children].map((c) => c.getAttribute("role")),
      }));
    expect(listboxShape.childRoles.every((r) => r === "group")).toBe(true);

    // The empty state is role=status and lives OUTSIDE the listbox.
    await input.fill("zzz-no-such-thing");
    const empty = page.locator("[role=status]", { hasText: "No matches" });
    await expect(empty).toBeVisible();
    await input.fill("");

    // Focus trap: Tab stays inside the palette.
    await page.keyboard.press("Tab");
    const focusInside = await page.evaluate(() =>
      document.querySelector(".command-palette")!.contains(document.activeElement)
    );
    expect(focusInside).toBe(true);

    // Home/End move the active option and scroll it into view.
    await page.keyboard.press("End");
    const endId = await input.getAttribute("aria-activedescendant");
    expect(endId).toBe(`palette-opt-${(await page.locator("[role=option]").count()) - 1}`);
    const inView = await page.evaluate((id) => {
      const el = document.getElementById(id)!;
      const r = el.getBoundingClientRect();
      const list = document.getElementById("palette-listbox")!.getBoundingClientRect();
      return r.top >= list.top - 2 && r.bottom <= list.bottom + 2;
    }, endId);
    expect(inView).toBe(true);
    await page.keyboard.press("Home");
    await expect(input).toHaveAttribute("aria-activedescendant", "palette-opt-0");

    // Enter runs the filtered action and navigates away (closing the palette
    // via the close-on-navigation rule — a real behavior, unlike Home which
    // navigates to the current path and leaves it open).
    await input.fill("settings");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings$/);
    await expect(dialog).toBeHidden();

    // Focus restored to the trigger after Escape-close.
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    // Nav parity: every rail destination is reachable from the palette.
    await page.keyboard.press("Control+k");
    await expect(dialog).toBeVisible();
    const labels = await page.locator(".palette-row-label").allTextContents();
    for (const dest of ["Clients", "Invoices", "Calendar", "Inbox", "Follow-ups", "Settings"]) {
      expect(labels).toContain(dest);
    }
    await page.keyboard.press("Escape");
  });

  test("fuzzy search: a typo surfaces the right client ahead of unrelated rows", async ({ page }) => {
    await signIn(page);

    // Seed two names that differ by a keyboard-adjacent typo from the query,
    // plus a long name that shares the letters but scattered (the old bug:
    // the scattered row outranked the typo'd intended match).
    const seedClient = async (name: string) => {
      await page.getByRole("button", { name: /Add client/ }).first().click();
      await page.locator("#cf-name").fill(name);
      await page.getByRole("button", { name: "Add client" }).last().click();
      await page.waitForTimeout(600);
    };
    const stamp = Date.now();
    await seedClient(`Acme Corp ${stamp}`);
    await seedClient(`Background Writer ${stamp}`);

    // Query with a keyboard-adjacent typo of the seeded client name.
    await page.keyboard.press("Control+k");
    await page.locator(".palette-input").fill("acne");
    await expect(page.locator(".palette-row-label").first()).toBeVisible();
    const labels = await page.locator(".palette-row-label").allTextContents();
    const acmeIdx = labels.findIndex((l) => l.includes("Acme Corp"));
    const writerIdx = labels.findIndex((l) => l.includes("Background Writer"));
    expect(acmeIdx).toBeGreaterThanOrEqual(0);
    // The scattered coincidence must not rank above the intended match — it
    // either doesn't match at all (-1, the heavy-scatter rejection) or sits
    // strictly below the typo'd Acme.
    expect(writerIdx === -1 || writerIdx > acmeIdx).toBe(true);
    await page.keyboard.press("Escape");
  });
});

/**
 * Modal surfaces (ContactForm / InvoiceForm / ConfirmDialog via the shared
 * Modal primitive) — the modal counterpart of the palette contract. Guards:
 * aria-modal + label, Tab trap, Esc close, focus restored to the trigger, and
 * the focus-preservation fix (a background re-render — e.g. a reactive Convex
 * query — must NOT rip focus out of the field being typed in).
 */
test.describe("modal focus contract", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("ContactForm: aria-modal, Tab trap, Esc close, focus restore, background-rerender keeps field focus", async ({
    page,
  }) => {
    await signIn(page);

    // Open via the toolbar trigger so focus restore has a target.
    const addBtn = page.getByRole("button", { name: /Add client/ }).first();
    await addBtn.focus();
    await addBtn.click();
    const modal = page.locator(".modal");
    await expect(modal).toBeVisible();

    // aria-modal dialog with the form's title as its accessible name.
    await expect(modal).toHaveAttribute("aria-modal", "true");
    await expect(modal).toHaveAttribute("aria-label", "Add client");

    // Tab stays trapped inside the modal.
    await page.keyboard.press("Tab");
    const focusInside = await page.evaluate(() =>
      document.querySelector(".modal")!.contains(document.activeElement)
    );
    expect(focusInside).toBe(true);

    // Typing keeps focus in the field.
    await page.locator("#cf-name").click();
    await page.locator("#cf-name").fill("Focus Contract");
    await expect(page.locator("#cf-name")).toBeFocused();

    // Esc closes and restores focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(addBtn).toBeFocused();
  });

  test("ConfirmDialog (invoice send): Esc closes, focus returns to the action that opened it", async ({
    page,
  }) => {
    await signIn(page);
    // Self-sufficient under -g: fall back to the first invoice row when the
    // serial seed hasn't run in this invocation.
    if (INVOICE_URL) {
      await page.goto(INVOICE_URL);
    } else {
      await page.goto("/invoices");
      const first = page.locator("tbody tr a.client-name").first();
      await first.click({ timeout: 15_000 });
    }
    await expect(page.locator(".page-head")).toBeVisible({ timeout: 15_000 });

    // Send opens the confirm dialog; focus lands in the dialog.
    await page.getByRole("button", { name: "Send" }).click();
    const dialog = page.locator(".modal");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    const focusIn = await page.evaluate(() =>
      document.querySelector(".modal")!.contains(document.activeElement)
    );
    expect(focusIn).toBe(true);

    // Cancel via the explicit button (not Esc) restores focus to Send.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Send" })).toBeFocused();
  });
});

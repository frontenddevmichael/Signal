import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile, mkdir } from "node:fs/promises";

/**
 * §4 axe pass — every screen × both modes, plus modals, SignIn, and 404.
 * Scans after the page settles, records every violation to
 * test-results/axe-report.json, fails on any WCAG 2.2 AA violation.
 * Split into per-group tests so each has its own timeout budget — a single
 * long test blew its 180s budget mid-run under the loaded dev backend.
 */

const EMAIL = "dev@signal.test";
const PASSWORD = "Dev-Password-456";

interface Violation {
  id: string;
  impact: string;
  help: string;
  nodes: { target: string; html: string; failureSummary?: string }[];
}

interface Report {
  generatedAt: string;
  runs: { screen: string; mode: string; violations: Violation[] }[];
}

const report: Report = { generatedAt: new Date().toISOString(), runs: [] };
test.setTimeout(150_000);

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
  }
  await page.waitForSelector("main", { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible({ timeout: 15_000 });
}

/** Force a theme by setting data-theme directly — the Shell effect only
 *  re-runs when the DB preference changes, so the override holds. */
async function setTheme(page: Page, mode: "dark" | "light") {
  await page.evaluate((m) => {
    document.documentElement.dataset.theme = m;
  }, mode);
  await page.waitForTimeout(150);
}

async function scan(page: Page, screen: string, mode: "dark" | "light") {
  await setTheme(page, mode);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const violations: Violation[] = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => ({
      target: n.target.join(" "),
      html: n.html.slice(0, 300),
      failureSummary: n.failureSummary,
    })),
  }));
  report.runs.push({ screen, mode, violations });
  console.log(
    `AXE ${screen} [${mode}]: ${violations.length} violations` +
      (violations.length ? ` — ${violations.map((v) => v.id).join(", ")}` : "")
  );
  return violations;
}

async function gotoAndSettle(page: Page, path: string, settle: string) {
  await page.goto(path);
  await page.locator(settle).first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(400);
}

/** Sign in once, scan every list screen in both modes. */
test("axe AA — list screens (clients, invoices, inbox, followups, settings)", async ({ page }) => {
  await signIn(page);
  const all: Violation[] = [];
  const screens: { name: string; path: string; settle: string }[] = [
    { name: "clients", path: "/", settle: "main" },
    { name: "invoices", path: "/invoices", settle: "main" },
    { name: "inbox", path: "/inbox", settle: "main" },
    { name: "followups", path: "/followups", settle: "main" },
    { name: "settings", path: "/settings", settle: "main" },
  ];
  for (const s of screens) {
    await gotoAndSettle(page, s.path, s.settle);
    all.push(...(await scan(page, s.name, "dark")));
    all.push(...(await scan(page, s.name, "light")));
  }
  expect(all).toEqual([]);
});

/** Client detail + its tabs (calendar is its own test — heavier). */
test("axe AA — client detail + 404", async ({ page }) => {
  await signIn(page);
  await page.locator(".client-name").first().waitFor({ timeout: 20_000 });
  const href = await page.locator(".client-name").first().getAttribute("href");
  expect(href).toContain("/clients/");

  const all: Violation[] = [];
  await gotoAndSettle(page, href!, ".client-detail");
  all.push(...(await scan(page, "client-detail", "dark")));
  all.push(...(await scan(page, "client-detail", "light")));

  await gotoAndSettle(page, "/definitely-not-a-route", ".empty-state");
  all.push(...(await scan(page, "404", "dark")));
  all.push(...(await scan(page, "404", "light")));
  expect(all).toEqual([]);
});

/** Calendar (42-cell grid + chips) — own test so the heavy scan has budget. */
test("axe AA — calendar", async ({ page }) => {
  await signIn(page);
  await gotoAndSettle(page, "/calendar", ".cal-grid");
  const all: Violation[] = [];
  all.push(...(await scan(page, "calendar", "dark")));
  all.push(...(await scan(page, "calendar", "light")));
  expect(all).toEqual([]);
});

/** Invoice detail — needs an invoice id resolved from the list. */
test("axe AA — invoice detail", async ({ page }) => {
  await signIn(page);
  await gotoAndSettle(page, "/invoices", "main");
  const href = await page.locator("tbody tr a.client-name").first().getAttribute("href").catch(() => null);
  test.skip(!href, "no invoices on this deployment");
  const all: Violation[] = [];
  await gotoAndSettle(page, href!, ".page-head");
  all.push(...(await scan(page, "invoice-detail", "dark")));
  all.push(...(await scan(page, "invoice-detail", "light")));
  expect(all).toEqual([]);
});

/** Modal surfaces — add-client and new-invoice forms. */
test("axe AA — modal surfaces (contact form, invoice form)", async ({ page }) => {
  await signIn(page);
  const all: Violation[] = [];

  await gotoAndSettle(page, "/", "main");
  await page.getByRole("button", { name: /Add client/ }).first().click();
  await page.locator("#cf-name").waitFor({ state: "visible", timeout: 20_000 });
  all.push(...(await scan(page, "modal-contact-form", "dark")));
  all.push(...(await scan(page, "modal-contact-form", "light")));
  await page.keyboard.press("Escape");

  await gotoAndSettle(page, "/invoices", "main");
  await page.getByRole("button", { name: "New invoice" }).first().click();
  await page.locator("#iv-contact").waitFor({ state: "visible", timeout: 20_000 });
  all.push(...(await scan(page, "modal-invoice-form", "dark")));
  all.push(...(await scan(page, "modal-invoice-form", "light")));
  expect(all).toEqual([]);
});

/** Sign-in (unauthenticated — separate context so no token leaks). */
test("axe AA — sign-in", async ({ browser }) => {
  const anon = await browser.newContext();
  const fresh = await anon.newPage();
  const all: Violation[] = [];
  await fresh.goto("/");
  await fresh.waitForSelector("#email", { timeout: 30_000 });
  all.push(...(await scan(fresh, "signin", "dark")));
  all.push(...(await scan(fresh, "signin", "light")));
  await fresh.close();
  await anon.close();
  expect(all).toEqual([]);
});

test.afterAll(async () => {
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/axe-report.json", JSON.stringify(report, null, 2));
  console.log(`AXE report written: test-results/axe-report.json (${report.runs.length} scans)`);
});

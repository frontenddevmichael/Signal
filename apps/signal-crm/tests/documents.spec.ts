import { expect, test } from "@playwright/test";

const EMAIL = "dev@signal.test";
const PASSWORD = "Dev-Password-456";
const STAMP = Date.now();

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible({ timeout: 15_000 });
}

/**
 * §documents regression — the Docs tab on the client detail must render a
 * real list (never the disabled "Coming soon"), the New document flow must
 * create a proposal/contract end to end, and delete must offer Undo.
 * Uses the shared smoke-test account; the first client in the list is the
 * target (the seed fixture guarantees at least one exists).
 */
test("documents: create a proposal from a template and see it listed", async ({ page }) => {
  await signIn(page);

  // Open the first client.
  await page.goto("/");
  const firstClient = page.locator("table a").first();
  await expect(firstClient).toBeVisible();
  await firstClient.click();

  // Docs tab — must be a live panel, not the old disabled button.
  const docsTab = page.getByRole("tab", { name: "Docs" });
  await docsTab.click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();

  // New document flow.
  await page.getByRole("button", { name: "New document" }).first().click();
  await expect(page.getByRole("dialog", { name: "New document" })).toBeVisible();

  const clientName = await page.locator("#nd-clientName").inputValue().catch(() => "");
  const name = clientName ? `${clientName} ${STAMP}` : `Regression ${STAMP}`;

  await page.locator("#nd-clientName").fill(name);
  await page.locator("#nd-projectName").fill("Regression project");
  await page.locator("#nd-scope").fill("Automated end-to-end scope.");
  await page.locator("#nd-timeline").fill("2 weeks");
  await page.locator("#nd-fee").fill("1,250");

  // Live preview reflects the input.
  await expect(page.locator(".doc-preview")).toContainText("Proposal — " + name);
  await expect(page.locator(".doc-preview")).toContainText("1,250 USD");

  const create = page.getByRole("button", { name: /Create Proposal/ });
  await expect(create).toBeEnabled();
  await create.click();

  // Back on the list with the new document.
  await expect(page.getByRole("button", { name: new RegExp(`Proposal — ${name}`) })).toBeVisible({ timeout: 15_000 });
});

test("documents: delete offers Undo and restores the row", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await page.locator("table a").first().click();
  await page.getByRole("tab", { name: "Docs" }).click();

  // Unique name so prior runs' rows never collide (strict mode).
  const docName = `Undo ${STAMP}`;

  // Create one document to delete.
  await page.getByRole("button", { name: "New document" }).first().click();
  await page.locator("#nd-clientName").fill(docName);
  await page.locator("#nd-projectName").fill("Undo project");
  await page.locator("#nd-scope").fill("Scope for undo test.");
  await page.locator("#nd-timeline").fill("1 week");
  await page.locator("#nd-fee").fill("500");
  await page.getByRole("button", { name: /Create Proposal/ }).click();
  const row = page.locator("li", { hasText: docName }).first();
  await expect(row.getByRole("button", { name: /Proposal —/ })).toBeVisible({ timeout: 15_000 });

  // Delete → Undo toast → row restored.
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(new RegExp(`${docName} deleted`))).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row.getByRole("button", { name: /Proposal —/ })).toBeVisible({ timeout: 15_000 });
});

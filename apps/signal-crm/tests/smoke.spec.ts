import { expect, test } from "@playwright/test";

const EMAIL = "dev@signal.test";
const PASSWORD = "Dev-Password-456";
const STAMP = Date.now();

/**
 * §21.1 smoke test — the core happy path of Phase 1: sign in, create a
 * contact, drop a note on the timeline, attach a project. It exercises the
 * single write-path rule end to end (note creation must produce a timeline
 * event in the same transaction).
 */
test("core Phase 1 flow: contact → note → project → timeline", async ({ page }) => {
  // Sign in (existing account created in Phase 0).
  await page.goto("/");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Land on the clients table.
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();

  // Create a contact.
  await page.getByRole("button", { name: "Add client" }).click();
  const name = `Smoke ${STAMP}`;
  await page.locator("#cf-name").fill(name);
  await page.locator("#cf-company").fill(`Company ${STAMP}`);
  await page.getByRole("button", { name: "Add client" }).last().click();
  // The form closes; navigate into the new client's detail page. The row's
  // name link is `.client-name` — the quick-action link's aria-label also
  // contains the name, so a role-based name match would be ambiguous.
  await page.locator(".client-name", { hasText: name }).click();
  await expect(page.getByRole("heading", { name: name })).toBeVisible();

  // Add a note → must surface on the timeline (§18 single write path).
  await page.getByLabel("Note body").fill(`Hello from the smoke test ${STAMP}`);
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText(`Hello from the smoke test ${STAMP}`)).toBeVisible();
  await expect(page.getByText("Note added")).toBeVisible();

  // Add a project.
  await page.getByRole("tab", { name: "Projects" }).click();
  await page.getByRole("button", { name: "Add project" }).click();
  await page.locator("#pf-name").fill(`Project ${STAMP}`);
  await page.getByRole("button", { name: "Add project" }).last().click();
  await expect(page.getByText(`Project ${STAMP}`)).toBeVisible();

  // Timeline still intact and note body renders through the projection.
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("Note added")).toBeVisible();
  await expect(page.getByText(`Hello from the smoke test ${STAMP}`)).toBeVisible();
});

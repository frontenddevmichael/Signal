# Design: User-initiated full data export

- **Status:** Approved for implementation
- **Date:** 2026-08-16
- **Owner:** Signal — Signal CRM product
- **Consumers:** the pricing page's "export it" promise (`apps/signal-site/src/pages/index.astro:49`), PRD §4 full-export promise (`apps/signal-crm/crm-spec.md:100`)

## Problem

The product promises the freelancer they can take their data. Nothing lets them do it by hand. The weekly backup (`convex/backup.ts` §21.16) only covers contacts, invoices, and line items, runs on a cron, and lands in R2 — the user never sees it.

## Goal

A user-initiated *full-dataset* export from Settings that builds a single archive in the browser: a complete JSON set per entity (lossless) plus flat CSVs for the tabular entities (spreadsheet-ready). One click, take it with you. $0, no lock-in, no server storage.

## Decisions (all user-approved)

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| A | Dataset scope | **Full dataset** — every user-owned table | PRD §4 says "full export"; anything less is lock-in |
| B | Format | **Both** — full JSON per entity + flat CSVs | JSON is lossless for re-import; CSVs are what people open |
| C | Delivery | **Client-side single `.zip`** | Browser builds it, costs nothing, no Convex storage/lifecycle machinery |
| D | Money | Integer minor units everywhere | Locked §18 rule; exported exactly as stored |
| E | Dates | ISO-8601 UTC strings everywhere | Unambiguous across timezones |

Stopped/out of scope (deliberate): **no import/re-import path** (YAGNI; the export is a takeaway, not a migration vehicle). Honesty note: **no raw API keys** — they are hashed at rest by design; the export carries key *metadata* (label/created/last used), documented in the manifest.

## Bundle spec (part 1, approved)

Archive filename: `signal-export-YYYY-MM-DD.zip` (date in the user's local timezone).

Contents:

- manifest.json — schema version, generated-at (ISO-8601 UTC), per-table row counts, the money-encoding note, the api-keys honesty note. Single source of truth for what's inside.
- `README.md` — plain-language: what's here, what the money numbers mean (minor units), what a CSV column means, what's deliberately *not* here (raw API keys, sessions/push tokens could not reveal anything).

**Entity-set reconciliation (2026-08-16, flagged at implementation):** the approved file list below was written against a sketchy earlier entity review. The real schema differs, and decision A ("full dataset — every user-owned table") wins:
- There is **no `meetings` table** — meetings are `calendarEvents` rows (`meetings.ts` writes `calendarEvents` with `googleEventId: "manual-…"`). They export inside `calendar_events.json`, not a separate file.
- The design's `repo_links` maps to two real tables: `repos.json` (the repo rows) + `project_repos.json` (the link table).
- File list omits tables decision A requires — all now exported: `contact_emails`, `contact_phones`, `documents`, `follow_up_reminders`, `portal_tokens`, `invoice_counters`, `audit_log`, `contact_undo`, `repo_activity`, `gmail_filter_setup`.
- `user.json` carries the account row.
- `audit_log.json` / `contact_undo.json` are JSON-only (free-form `metadata` / multi-KB `snapshot` blobs are worse than useless as flat CSV cells).
- Entity JSON names match the schema's table names (camelCase JSON keys, snake_case filenames).

Entity JSON files (one per user-owned table, flat + lossless, nested relations preserved via the FK columns):
1. `contacts.json`, `contact_emails.json`, `contact_phones.json`
2. `projects.json`, `repos.json`, `project_repos.json`, `repo_activity.json`
3. `notes.json`, `timeline_events.json`
4. `invoices.json` (raw counters + `derivedStatus` per §18), `invoice_line_items.json`
5. `messages.json`, `documents.json`, `calendar_events.json` (meetings incl.), `follow_up_reminders.json`
6. `custom_field_definitions.json`, `custom_field_values.json`
7. `portal_tokens.json`, `push_subscriptions.json`, `sessions.json`, `api_keys.json` (**label/created/last-used only** — keys are hashed at rest and can never be reconstructed)
8. `invoice_counters.json`, `audit_log.json`, `contact_undo.json`, `gmail_filter_setup.json`
9. `user.json`

Flat CSVs for the tabular entities (same rows as the JSON — every CSV row count equals its JSON row count): `contacts`, `contact_emails`, `contact_phones`, `projects`, `notes`, `timeline_events`, `messages`, `documents`, `calendar_events`, `follow_up_reminders`, `repos`, `project_repos`, `repo_activity`, `invoices`, `invoice_line_items`, `custom_field_definitions`, `custom_field_values`, `portal_tokens`, `push_subscriptions`, `sessions`, `api_keys`, `invoice_counters`, `gmail_filter_setup`.

CSV rules: escaped exactly (commas, embedded quotes, newlines, UTF-8); no BOM games — always UTF-8 with a header row of the entity's stored field names. Money appears as integers in minor units in both.

Every row carries `_creationTime` where the schema stores it, plus the Convex `_id` (the FK map).

## Implementation (part 2, approved)

### Server: `convex/exportData.ts`

One authenticated query, `api.exportData.all`, returns the full dataset assembled server-side: every user-owned row pulled via the existing `userId` scoping helpers, contacts with their nested children joined, invoices with line items. Deterministic ordering (creation-time then id) so the archive is reproducible and diffable. The browser never re-derives schema or scoping.

### Client: `src/lib/export.ts`

Pure builder: `buildExportBundle(data): { filename: string; content: string }[]`. Produces manifest, README, every JSON, every CSV. Handles CSV escaping, duplicate-safe filenames, deterministic ordering, manifest counts. **Pure** → unit-tested with no DOM, no network.

### Dependency

`jszip` (dev dependency, ~50 KB gz). The client zips the built files, `URL.createObjectURL`, an `<a download>` click. Nothing touches Convex storage; works offline after the single query.

### UI: Settings → "Data" group

New `ExportSection.tsx` using the existing `SettingsSection` primitive. Description: honest, quotes the no-lock-in promise. Primary button **"Download archive"** with a spinner + disabled state while the query loads and while zipping. Error path: toast + button re-enabled. No partial downloads (bundle is built fully in memory before the URL is created).

### Error handling

- Query failure → toast, button re-enabled.
- Zip/Blob/URL failure → toast, button re-enabled.
- Bundle build is deterministic → a failure cannot leave inconsistent state.

## Testing

- Vitest `tests/exportLogic.test.ts`:
  - CSV quoting edge cases (commas, embedded quotes, newlines, UTF-8)
  - every CSV row count equals its JSON row count
  - money stays integer minor units
  - manifest counts match the data
  - deterministic filenames
  - full dataset round-trips through the builder
- Playwright: one contract guard in the regression suite — sign in → Settings → Download archive → assert a download fires with the expected `signal-export-*.zip` name, and the manifest inside parses with the seeded client present.

## Behavior change / drift flags

- None to the schema. The export is read-only. No new table, no new column.
- The weekly backup is untouched and remains independent.

## Open items

- None blocking. The date in the filename uses the user's local timezone (consistent with the rest of the UI); the manifest timestamp is UTC.
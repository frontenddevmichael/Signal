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

- `manifest.json` — schema version, generated-at (ISO-8601 UTC), per-table row counts, the money-encoding note, the api-keys honesty note. Single source of truth for what's inside.
- `README.md` — plain-language: what's here, what the money numbers mean (minor units), what a CSV column means, what's deliberately *not* here (raw API keys, sessions/push tokens could not reveal anything).
- 15 entity JSON files (nested, lossless):
  1. `contacts.json` — contacts with nested arrays: projects, notes, timeline events, meeting events, document/email links, GitHub activity.
  2. `projects.json` (relation map in addition to nesting)
  3. `notes.json`
  4. `timeline_events.json`
  5. `invoices.json` — with nested line items and amounts, statuses derived per §18 exported as derived fields alongside raw counters.
  6. `invoice_line_items.json`
  7. `messages.json`
  8. `meetings.json`
  9. `custom_field_definitions.json`
  10. `custom_field_values.json`
  11. `repo_links.json`
  12. `calendar_events.json` (incl. the 4 chip kinds)
  13. `push_subscriptions.json` — metadata rows (no raw push data beyond what the user owns)
  14. `sessions.json` — metadata rows
  15. `api_keys.json` — **label/created/last-used only**; keys are hashed at rest and can never be reconstructed.
- 12 flat CSVs for the tabular entities: contacts, projects, notes, timeline_events, invoices, invoice_line_items, messages, meetings, custom_field_definitions, custom_field_values, repo_links, calendar_events.

CSV rules: escaped exactly (commas, embedded quotes, newlines, UTF-8); no BOM games — always UTF-8 with a header row of the entity's stored field names. Every CSV row count equals its JSON row count. Money appears as integers in minor units in both.

Every row carries `_creationTime` where the schema stores it.

## Implementation (part 2, approved)

### Server: `convex/exportData.ts`

One authenticated query, `api.export.all`, returns the full dataset assembled server-side: every user-owned row pulled via the existing `userId` scoping helpers, contacts with their nested children joined, invoices with line items. Deterministic ordering (creation-time then id) so the archive is reproducible and diffable. The browser never re-derives schema or scoping.

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
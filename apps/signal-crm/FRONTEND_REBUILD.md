# Frontend Rebuild — Audit Inventory & Progress

Cross-session source of truth for the frontend work on the Signal CRM product.
Scope: `apps/signal-crm/src/` (product UI), against `signal-design.md` (§0–§6, §5.1–5.9 HCI)
and the token ground truth `apps/signal-crm/src/index.css`.

Status legend per unit: `DONE` (v3-compliant, verified) · `FIX` (defects found, listed below) · `REBUILD` (needs fresh implementation).

## Audit result (2026-08-15, three parallel passes)

**The v3 "Quiet Future OS" rebuild has ALREADY been executed across the product.** Every one
of the 51 component files is on the token system. Cross-cutting sweeps found:

- `beacon-hue` / `glass-card` / `violet` / `indigo` → **zero matches**
- Numbered pagination (`pagination|pageSize|page=|limit.*offset`) → **zero matches** (full dataset + client-side filter/sort)
- Raw hex in inline `style={{…}}` or classNames → **zero** (only the sanctioned Google brand mark in `Icons.tsx`)
- `window.__` debug hooks → **zero** in product (marketing site only)
- `TODO|FIXME|HACK|XXX` → **zero**
- Global `:focus-visible` ring (2px `--beacon`) + `@supports (corner-shape: squircle)` progressive enhancement → present
- 44px touch floor (≤1024px), dark/light parity, status monochrome register, glass limited to L2/L3 floating shells wrapping solid inner cards → present

**Conclusion: the remaining work is a targeted defect-fix pass, NOT a delete-and-rebuild.**
Forcing a from-scratch rebuild onto already-compliant units would regress verified behavior
and violate the standing "product untouched, creds-test readiness" rule.

## User decision (2026-08-16): FORCE delete-and-rebuild anyway

The audit conclusion was presented at the checkpoint with the recommendation to fix defects in
place. The user explicitly overrode it: **"Force delete-and-rebuild anyway."** So the plan is a
literal from-scratch rebuild of each unit, in order, deleting the existing implementation and
rewriting it against `signal-design.md` v3 with fresh eyes. Defects listed below remain the
target list — the rebuilds must not reintroduce them (and several overlap the work directly:
toast 44px floor, hardcoded hue fallbacks, EmptyState glyph reuse, filter-chip aria).

Phases:
- **2a shared primitives** — DONE (2026-08-16): buttons/icon-btn/kbd, loading hierarchy (spinner,
  skeleton, loader-page + signal-bar mark pulse), beacon-dot (opacity-only pulse, ring retired),
  empty-state (§3.5), forms (§3.1), status register (§1.1, dot registers from hue tokens), toasts
  (§3.2 + 44px undo/close targets in the →1024 floor block), touch floor (`.btn-sm`/`.note-tool`
  extended to `.toast .undo`/`.toast-close`), avatars/tag/row-count/quick-actions, table block
  (§3.4: filter-bar, chips with `--radius-sm` squircle not pill, data-table, th, row-in stagger),
  badge (monochrome + dot register, `badge-important` sage dot / `badge-spam` stone outline).
  Also: deleted two duplicated `.icon-btn`/`.kbd` blocks and the `.status-pending`
  hardcoded hue (index.css:3432), kbd shadow now `--border-default` (was hardcoded rgba),
  `EmptyState.tsx` now imports `IconClients` (was duplicated glyph with round join), `Toasts.tsx`
  rewritten (close = `icon-btn toast-close`, aria-label, 12×12 IconClose).
- **2b overlays** — PENDING: Modal, ConfirmDialog, CommandPalette, UserMenu, QuickCreate.
- **2c shell** — PENDING: Shell, App.
- **2d screens** — PENDING: ClientsList, ClientDetail, Invoices, InvoiceDetail, Calendar, FollowUps, Inbox.
- **2e settings/integrations/forms** — PENDING: SignIn, ContactForm, InvoiceForm, MergeDialog, projects, notes, meetings, gmail, integrations, settings, portal, mini-calendar.
- **Phase 3 HCI pass** — PENDING: StrictMode guards, aria-pressed, focus indicators, no-catch mutations, confirm/undo hardness.
- **Phase 4 verification + commit** — PENDING: full suite + FRONTEND_REBUILD.md final.

Phase 2a verified: `tsc --noEmit` clean, vitest green, `vite build` green, `oxlint` 0/0, Playwright 28/28,
both themes DOM-probed against the token ladder (dark: beacon inverts to light-fill; light: beacon dark-fill/light-text;
badge dot register, kbd shadow token, loader-pulse animation all resolving from `var(--…)`).

## Defects to fix (ranked)

### HIGH — real behavioral bugs
- [ ] **InvoiceForm edit mode dead-end** (`invoices/InvoiceForm.tsx:70-72`): `useEffect([contactId])` clears `projectId` on mount in edit mode → Project select locked blank + Save permanently disabled. Guard with `if (!editing)`.
- [ ] **ClientDetail financials table unstyled + rows not keyboard-accessible** (`clients/ClientDetail.tsx`): `.table` / `.ta-r` / `.row-link` are orphan classes with no CSS rule — no borders, no right-aligned Total, no cursor/hover affordance, `<tr onClick>` has no tabIndex/role/keydown path.
- [ ] **ClientDetail tablist incomplete ARIA**: no roving tabindex, no arrow-key nav, no `aria-controls`/`role="tabpanel"`/`aria-labelledby` on panels.

### MEDIUM — StrictMode / state
- [ ] **MergeDialog double-create under StrictMode** (`clients/MergeDialog.tsx:65-82`): deps-`[]` effect calls `contacts.create({force:true})` twice in dev → orphan contact B. Add idempotency guard.
- [ ] **ImportRepoDialog render-phase side effect** (`projects/ImportRepoDialog.tsx:37-41`): `setLoaded`/`loadRepos()` inside render → double GitHub API call under StrictMode. Move to `useEffect`.
- [ ] **No visible focus indicators on two editors**: `.palette-input` (`CommandPalette`, index.css:1558) and `.note-editor` (`NoteComposer`, index.css:3020) both `outline: none` later/equal specificity than the global `:focus-visible` rule.
- [ ] **ConfirmDialog swallows errors** (`ui/ConfirmDialog.tsx`): throwing `onConfirm` → unhandled rejection, dialog stays open, no message. Add error state.
- [ ] **Fire-and-forget mutations with no `.catch`** (unhandled rejections, no user feedback): `ProjectRepos` Unlink, `SecuritySettings` revokeSession/signOutEverywhere/revokeKey, `GmailConnect.setTriage`, `GmailSetupBlock.ensure/markAdded`, `CustomFieldsEditor.setValue`, `useOAuthCallbacks.storeInstallation`, `PreferencesSection` Save. Add pending/disabled + catch→toast.
- [ ] **FollowUps Done/Dismiss** fire unawaited, no pending/disabled state, no error path, inconsistent feedback (Done toasts, Dismiss doesn't).
- [ ] **Toast controls below 44px touch floor** (`ui/Toasts.tsx`): `.toast-close` 24px, `.undo` ~28px on mobile.

### LOW — polish / semantics
- [ ] **Hardcoded hue fallbacks in CSS tail** (index.css:3432,3447-3448): `var(--amber, #b45309)`, `var(--danger, #b91c1c)`, `var(--success, #15803d)` — last surviving pre-v3 attention colors; `.status-pending` redefined at :3432 shadowing the token version at :785.
- [ ] **WhatsAppConnect 🟢/⚠️ emoji-as-icon** (`integrations/WhatsAppConnect.tsx`): hue-based status off the monochrome register; 🟢 not `aria-hidden`, announced to SRs.
- [ ] **Filter chips lack `aria-pressed`/`aria-current`** (ClientsList, InvoicesList, theme selector).
- [ ] **Duplicate `aria-label="Primary"` landmarks** in `Shell.tsx` (aside + tabbar); inner sidebar `<nav>` unlabeled.
- [ ] **QuickCreate menu semantics** (`Shell.tsx`): `role="menu"`/`menuitem` but no arrow-key nav, no focus move into menu, no `aria-haspopup` on trigger.
- [ ] **UserMenu popover** (`UserMenu.tsx`): `role="dialog"` but not `aria-modal`, no focus trap, no initial focus move.
- [ ] **IconAlert doc/render mismatch** (`Icons.tsx:149`): comment says "Filled" but renders outline (base `Svg` sets `fill="none"`, IconAlert never overrides).
- [ ] **EmptyState duplicates IconClients glyph** with `strokeLinejoin="round"` (register is miter) instead of importing the Icons module.
- [ ] **Portal error states lack `role="alert"`**; no focus management on token redemption.
- [ ] **Calendar grids** (full + mini): `role="grid"` without focusable cells / arrow-key nav; chips' mobile accessible name relies on `title` fallback.
- [ ] **PreferencesSection**: Save has no loading state; theme radiogroup is buttons (no arrow-key nav); `role="radio"` + `aria-checked` pattern otherwise correct.
- [ ] **CustomFieldsSection**: `select` fields can be created with zero options (no guard on `optionsText`).
- [ ] **GmailSetupBlock `setup.rows[0]` logic smell** (`gmail/GmailSetupBlock.tsx:39-42`): flags reused for every filter group.
- [ ] **ReplyBox / CustomFieldsEditor loading**: return `null` instead of a skeleton (content pops in).
- [ ] **`settings-section` dead class** (`settings/SettingsSection.tsx:22`): no rule in index.css — removal cosmetic-safe.
- [ ] **Status spans without `role="status"`** (BackupSection, GithubConnect, GmailConnect connected states).
- [ ] **`formatMoney` hardcodes `en-NG`** for every currency (`lib/format.ts`) — confirm intent.
- [ ] **Stale comment** `lib/format.ts:5` ("browser default … later pass") — timezone preference shipped in Phase 5.
- [ ] **Timeline note rendering `dangerouslySetInnerHTML`** (`timeline/Timeline.tsx`) — implicit trust boundary; consider sanitizer.
- [ ] **`settings-section` raw `8px` radius / `.chip` `border-radius: 999px`** off the radius scale (design choices to confirm).

## Unit status

| Unit | File(s) | Status |
|---|---|---|
| Sign-in | `SignIn.tsx` | DONE (minor: no `.field-error .input` on error; no aria-live on pending label) |
| Shell | `Shell.tsx` | FIX (menu semantics, duplicate landmarks, tabbar nav label) |
| Command palette | `CommandPalette.tsx` | FIX (palette-input focus ring) |
| User menu | `UserMenu.tsx` | FIX (popover focus trap/initial focus) |
| Modal | `ui/Modal.tsx` | DONE (documented focus contract verified) |
| ConfirmDialog | `ui/ConfirmDialog.tsx` | FIX (error state on throwing onConfirm) |
| Toasts | `ui/Toasts.tsx` | FIX (44px floor on close/undo) |
| Icons | `Icons.tsx` | FIX (IconAlert fill; EmptyState glyph reuse) |
| Clients list | `clients/ClientsList.tsx` | FIX (aria-pressed chips; stale beacon role) |
| Client detail | `clients/ClientDetail.tsx` | FIX (financials table, tablist ARIA) |
| Client calendar | `clients/ClientCalendar.tsx` | FIX (grid keyboard nav) |
| Contact form | `clients/ContactForm.tsx` | FIX (aria-invalid/describedby; "Create anyway" double-click) |
| Merge dialog | `clients/MergeDialog.tsx` | FIX (StrictMode double-create) |
| Invoices list | `invoices/InvoicesList.tsx` | FIX (aria-pressed chips) |
| Invoice detail | `invoices/InvoiceDetail.tsx` | DONE |
| Invoice form | `invoices/InvoiceForm.tsx` | FIX (HIGH edit-mode bug; no `<form>`) |
| Projects | `projects/*` | FIX (ImportRepoDialog effect; ProjectRepos Unlink pending) |
| Notes | `notes/NoteComposer.tsx` | FIX (note-editor focus ring) |
| Timeline | `timeline/Timeline.tsx` | FIX (sanitizer consideration) |
| Meetings | `meetings/MeetingsPanel.tsx` | DONE (minor: `required` attr) |
| Gmail | `gmail/*` | FIX (GmailSetupBlock rows[0]; ReplyBox skeleton; fire-and-forget) |
| Integrations | `integrations/*` | FIX (WhatsApp emoji; status role; no-catch mutations) |
| Settings | `settings/*` | FIX (Preferences loading/radio nav; dead class; no-catch) |
| Custom fields | `customFields/*` | FIX (zero-option select; skeleton; fire-and-forget) |
| Portal | `Portal.tsx` | FIX (role=alert on errors; redemption focus) |
| Calendar | `Calendar.tsx` | FIX (grid keyboard nav) |
| Inbox | `Inbox.tsx` | DONE |
| Follow-ups | `FollowUps.tsx` | FIX (pending/disabled on Done/Dismiss) |
| Loader / EmptyState / NotFound / ErrorBoundary | — | DONE (Phase 2a: EmptyState imports IconClients; loader-pulse signal-bar) |
| App / main / lib / hooks | — | FIX (stale comment; formatMoney en-NG confirm) |

## Verification baseline (pre-fix)
- Vitest: 176/176 (23 files). Playwright: 28/28 (smoke, mobile-regression, palette, modal-focus, fuzzy).
- `npx.cmd tsc --noEmit` clean ×2 (product + site), `oxlint` 0/0, `vite build` green.
- CI `.github/workflows/lint.yml`: lint → typecheck → build → test → §21.9 isolation grep.

## Working notes
- Windows PowerShell: use `npm.cmd`/`npx.cmd`, never bare `npm`/`npx`.
- Local servers: Convex 3210 (PID), product Vite 5173, marketing Astro 4321.
- Playwright: baseURL 5173, `reuseExistingServer: true`; testMatch `**/*.spec.ts`.
- Auth JWT key in localStorage: `__convexAuthJWT_http1270013210`.
- Dev servers can die mid-session (astro ELIFECYCLE exit 1; vite stale bundles) — restart + re-register preview before verification.

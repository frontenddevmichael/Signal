# Signal — Build Prompts for OpenCode

How to use this file: it's a companion to the PRD (`crm-spec.md`), not a replacement for it. Give the agent both files. Run the phases **in order, one at a time**. Do not paste all phases into one session — each phase ends with an explicit stop-and-report point, and you sign off before the next one starts. This mirrors how Michael works: plans before code, phase gates, no silent scope creep.

Each phase prompt below is self-contained and assumes the agent has already read the PRD in full. The first line of every phase prompt tells the agent to re-read the PRD before starting — this is intentional repetition, not a mistake, because agents drift from spec over long sessions.

---

## How to run this

1. Start a fresh OpenCode session for each phase.
2. Paste in `crm-spec.md` (the PRD) first, then the phase prompt.
3. Let the agent work. When it stops and reports (every phase prompt ends with a mandatory stop condition), review before continuing.
4. Do not let the agent "keep going" into the next phase's scope even if it offers to. If it starts building Phase 2 work during Phase 1, redirect it back.
5. Credentials: every phase that needs a new external service credential includes an exact, numbered "how to get this" block for you specifically — the agent should present these steps to you and then wait, not proceed with a placeholder/fake key.

---

## Phase 0 — Foundation

```
You are building Signal, a CRM for solo freelance developers, from the attached PRD. Read the entire PRD before writing any code. This phase is foundation only — no CRM features yet, no integrations, no invoicing. The goal is a working skeleton everything else attaches to.

Scope for this phase, and ONLY this phase:

1. Project setup
   - Initialize a Vite + React project, plain CSS (CSS Modules or plain .css files per component — no Tailwind, no CSS-in-JS, per the PRD's stack decision).
   - Set up Convex in the project. If you need a Convex deployment URL or admin key to proceed, STOP and ask me for it — give me the exact steps to get it first, in this format:
     1. Go to https://dashboard.convex.dev
     2. Create a new project (suggest calling it "signal" or "signal-dev")
     3. From Settings → the deployment URL and deploy key you need
     Then wait for me to paste it back before continuing.
   - Set up the folder structure: keep it flat and obvious, no premature abstraction. A `convex/` folder for backend functions and schema, `src/` for the frontend.

2. Schema (Section 18 of the PRD, in full)
   - Implement every table from Section 18 in Convex's schema, exactly as specified — field names, types, and the notes on why each field exists (read the reasoning, don't just copy field names blindly, since some fields have non-obvious purposes like `github_repo_id` vs `full_name`).
   - Use Convex indexes wherever the PRD implies a lookup pattern (e.g. contacts by user_id, contact_emails by contact_id, messages by contact_id, processed_webhook_events by (provider, external_id) as a compound uniqueness check).
   - Do NOT implement any mutations or queries yet beyond what's needed for auth. Schema only.
   - Money fields are integers in minor units, per the PRD's locked money-handling rule at the top of the document. Flag me if you find a monetary field in Section 18 that isn't typed this way — don't silently fix it, ask.

3. Authentication (Section 20.1)
   - Implement Convex Auth: email/password plus "Sign in with Google" as an optional method.
   - If Google sign-in requires a Google Cloud OAuth client ID/secret, STOP and give me these exact steps:
     1. Go to https://console.cloud.google.com
     2. Create a new project (or select an existing one) — suggest "Signal"
     3. Go to APIs & Services → Credentials → Create Credentials → OAuth Client ID
     4. Application type: Web application
     5. Add the authorized redirect URI Convex Auth requires (look this up in Convex Auth's own docs and tell me the exact URL to add)
     6. Give me the Client ID and Client Secret it generates
     Then wait.
   - A `users` row is created on first successful sign-in, matching the Section 18 schema.
   - Sessions table (Section 18) — wire up session creation on login, but the "sign out everywhere" action itself is Phase 5 scope. Just make sure the table is populated correctly now so nothing needs backfilling later.
   - Design tokens (Section 22.1–22.5)
   - Implement the color tokens, typography stack (Inter, Geist Mono, Instrument Sans — load them, don't just reference the names), corner radii, and motion durations/easing as CSS custom properties at the root.
   - Implement light/dark mode switching (Section 22.8) — system preference on first load, manual override stored on the users row, applied via CSS custom property swap.
   - Do not build any actual feature UI yet. A blank authenticated shell (login screen, then an empty dashboard with just the sidebar nav structure from Section 22.7's reference layout) is the deliverable — no contacts, no invoices, nothing functional inside it yet.

5. CI baseline (Section 21.2, minimal version for this phase)
   - Set up a GitHub Actions workflow that runs lint on every PR. Don't add Vitest/Playwright yet — that's Phase 1+ once there's logic worth testing.

STOP CONDITION: When this is done, do not proceed to any CRM features. Report back:
- What credentials you needed and got from me
- Confirmation the schema matches Section 18 exactly, with any deviations called out explicitly and why
- A screenshot or description of the empty authenticated shell running locally
- Any part of Section 18 or 20.1 that was ambiguous and what assumption you made

Wait for my sign-off before starting Phase 1.
```

---

## Phase 1 — Core CRM loop (contacts, projects, notes, timeline)

```
Re-read the full PRD before starting. This phase builds the part of Signal that works with zero external integrations connected — contacts, projects, notes, custom fields, and the unified timeline. Do not touch GitHub, Gmail, WhatsApp, or invoicing in this phase — those are later phases and pulling them in now will make review harder, not easier.

Scope for this phase, and ONLY this phase:

1. Contacts (Section 3, Section 14, Section 18's contacts/contact_emails/contact_phones tables)
   - CRUD for contacts: name, company, status (lead/active/closed), source, tags, timezone.
   - contact_emails and contact_phones as separate tables per the schema — support multiple per contact, with an is_primary flag, from the start. Don't build a single-email version "for now" — the schema already assumes arrays, build the UI that way too.
   - Contact list view (table) per Section 13 — sortable/filterable columns for status, last contact date, next deadline, outstanding balance (this last one will show $0/blank until Phase 3's invoicing exists — that's fine, just don't error on it).
   - Client detail page per Section 14's full information architecture — build the layout and all the sections described, even ones that will stay empty until later phases (Financials, Linked repos, Documents). Empty sections should use the empty-state pattern from Section 22.15, not just be missing.

2. Projects (Section 18's projects table)
   - CRUD for projects, linked to a contact. A contact can have more than one project.
   - Simple status (active/closed), deadline, description.

3. Notes (Section 18's notes table)
   - Rich-text notes attachable to a contact or a specific project. A basic rich-text editor is fine (check what's easiest to integrate cleanly with React — don't build one from scratch).

4. Custom fields (Section 20.4)
   - custom_field_definitions management screen in settings (freelancer defines fields: label, entity_type, field_type).
   - custom_field_values rendered and editable on the contact/project detail pages wherever definitions exist for that entity_type.

5. Timeline (Section 18's timeline_events table, Section 20.11's write-path rule)
   - Build the shared `writeTimelineEvent()` helper FIRST, before any mutation that should write to it. Every mutation in this phase that creates a note must call it. This sets the pattern every future phase (GitHub activity, invoices, messages) must also follow — get this right now since it's much harder to retrofit later.
   - Render the unified timeline on the client detail page — chronological, one scroll, per Section 14.

6. Search (Section 20.5)
   - Convex search indexes on contacts.name, contacts.company, notes.body. A simple search bar is enough for this phase — cross-entity fan-out search is explicitly deferred per the PRD, don't build it now.

7. Duplicate contact detection + merge (Section 20.6)
   - On contact creation, check incoming email/phone against existing contact_emails/contact_phones. Surface the "this looks like an existing contact" prompt.
   - Build the full merge flow exactly as specced: older contact survives, FKs re-point, emails/phones combine, tags union, conflicting single-value fields (timezone, company) require an explicit per-field choice in the UI — don't silently pick one. Log to audit_log with both original contact IDs in metadata. (audit_log table itself just needs this one write path for now — the full audit logging system across all destructive actions is Phase 5.)

8. HCI baseline for this phase (Section 23)
   - Apply 23.1 (confirm before destructive actions — contact merge, contact/project delete) and 23.2 (visible status on every async action) to everything built in this phase. Don't defer this to a later "polish pass" — build it in now, since retrofitting confirmation dialogs after the fact tends to get skipped under time pressure.

9. Tests (Section 21.1's priority order, scoped to what exists so far)
   - Vitest tests for the merge logic specifically (highest-risk piece in this phase — get the FK re-pointing and field-conflict logic right).
   - A basic Playwright smoke test: sign in → create contact → create project → add note → see it on timeline.

STOP CONDITION: No credentials should be needed in this phase (everything is internal to Convex). Report back:
- A walkthrough of the contact → project → note → timeline flow
- Confirmation the writeTimelineEvent() helper is the only write path to timeline_events, with a note of every mutation that calls it
- Any ambiguity in the merge spec (Section 20.6) you hit and what you did
- Test results

Wait for my sign-off before starting Phase 2.
```

---

## Phase 2 — GitHub integration

```
Re-read the full PRD before starting, paying particular attention to Sections 9, 9a, 18 (repos/project_repos/repo_activity), 20.2 (backfill), 20.3 (uninstall/downgrade), and 20.11 (webhook signature verification). This phase adds GitHub as the product's differentiator — the dev-native context no competitor has.

Scope for this phase, and ONLY this phase:

1. GitHub App setup
   - This requires you to register a GitHub App. STOP and give me these exact steps before you write integration code:
     1. Go to https://github.com/settings/apps/new (or the org equivalent if I want this under an org account — ask me which)
     2. App name: suggest "Signal CRM" (must be globally unique on GitHub, may need a suffix)
     3. Homepage URL: [my domain or the Vercel/Cloudflare preview URL from Phase 0]
     4. Webhook URL: point this at the Convex HTTP action endpoint you'll build in step 3 below — tell me the exact Convex endpoint URL to use here
     5. Webhook secret: generate a random secret yourself and tell me to save it, OR ask me to generate one — either way this needs to end up in Convex's environment variables, not committed to code
     6. Permissions needed: Repository permissions → Contents (read), Pull requests (read), Issues (read), Deployments (read), Metadata (read). Do not request write access to anything — this app only reads.
     7. Subscribe to events: Push, Pull request, Issues, Deployment status
     8. Where can this GitHub App be installed: "Any account"
     9. After creation, generate a private key (.pem file) from the app settings — this is what generates installation tokens
     Give me the App ID, the private key file, and confirm the webhook secret with me. I'll paste these back for you to add to Convex's environment variables (server-side only, never exposed to the client).

2. Connect flow (Section 9a, steps 1-3)
   - "Connect GitHub" button in settings, redirects to the App's install URL.
   - Handle the redirect back with the installation_id, store on users.github_installation_id.

3. Repo import (Section 9a, steps 4-6; Section 9's monorepo edge case)
   - In a project, "Import repo" — call the installation's repo list, show a picker.
   - Any repo already linked to another project gets the inline "Already linked to [Client]" flag — do not hide or filter these out, per the PRD's explicit decision.
   - Writes to repos (if new, matched on github_repo_id, not full_name) and project_repos.
   - "Add more repos" links to GitHub's own installation Configure page — no custom widen-access UI needed.

4. Webhook handling (Section 9a step 7, Section 20.11)
   - Build the Convex HTTP action that receives GitHub webhooks.
   - FIRST: verify the X-Hub-Signature-256 header against the webhook secret. Reject anything that doesn't verify — do not process it, do not write anything, just reject.
   - SECOND: check X-GitHub-Delivery against processed_webhook_events for (provider: github, external_id: delivery_id). If already processed, acknowledge and do nothing.
   - THEN: filter to repos that exist in the repos table, write to repo_activity.
   - Billable default logic (Section 9, the flipped default): if the repo has exactly one active project_repos link, billable defaults true. If more than one, billable defaults false on every row for that repo. Get this conditional right — it's a deliberate risk-reduction decision, not an arbitrary default, so don't simplify it back to a flat default.

5. Historical backfill (Section 20.2)
   - On import, one-time REST API pull of merged PRs / closed issues from project.created_at or a 90-day cap, whichever is shorter.
   - If multiple repos are imported in the same session, queue backfills with a concurrency cap of 2 rather than firing them all at once.

6. Uninstall / permission downgrade (Section 20.3)
   - Handle the installation webhook (action: deleted/suspend) — set github_installation_id to null, mark affected repos disconnected. Do not delete repo_activity or invoice line items derived from it.
   - Handle installation_repositories webhook (partial downgrade) — same disconnected pattern, scoped to just the affected repo.
   - UI: disconnected repos show the Section 22.15 error-state pattern with "Reconnect" as the primary action.

7. Repo activity on the client detail page (Section 14)
   - Render merged PRs / closed issues / deploys, filtered to the contact, in the "Linked repos & activity" section that's been an empty state since Phase 1.
   - This activity also needs to write to timeline_events via the shared helper from Phase 1 — do not build a second write path.

8. Invoice-time flag (Section 9)
   - This is preview work for Phase 3 (invoicing doesn't exist yet) but build the underlying query now: given a repo_activity row, can you determine if its repo has more than one active project link? Expose this as a function Phase 3 will call to render the "also linked to [other client]" flag at invoice-generation time. Don't build the invoice UI itself yet.

STOP CONDITION: Report back:
- Confirmation the webhook handler rejects unsigned/invalid-signature payloads (show me a test case)
- Confirmation of the conditional billable default logic with a test case for both the single-link and multi-link scenario
- The full connect → import → webhook → timeline flow, walked through
- Any GitHub API rate-limit concerns you hit during backfill testing

Wait for my sign-off before starting Phase 3.
```

---

## Phase 3 — Invoicing & payments

```
Re-read the full PRD before starting, paying particular attention to Section 18's invoices/invoice_line_items tables (the full status state machine), Section 21.4 (payment confirmation + reconciliation), Section 21.5 (atomic invoice numbering), Section 21.6 (currency, no conversion), Section 6 (tax fields), and Section 22.18 (PDF styling). This is the highest-consequence phase in the whole build — it's real client money. Move carefully, and test the money math before anything else in this phase.

Scope for this phase, and ONLY this phase:

1. Invoice data model and status machine (Section 18)
   - Build invoices and invoice_line_items exactly per the schema.
   - Status is DERIVED, not manually set except for draft/sent/viewed/void: paid when amount_paid >= total, partially_paid when 0 < amount_paid < total, overdue when due_at has passed and amount_paid < total, refunded when amount_refunded > 0. Write this as a pure function you can unit test in isolation before wiring it into any UI.
   - void is a manual freelancer action, blocked in the UI (and in the mutation itself, not just the UI) once amount_paid > 0.
   - subtotal + tax_amount = total. tax_rate/tax_amount are freelancer-entered fields, never calculated.
   - invoice_number: atomic per-user increment INSIDE the same mutation that creates the invoice — not a separate read-then-write. Use Convex's transactional guarantees here directly. Write a test that fires two invoice-creation calls concurrently and confirms no collision.
   - Write Vitest tests for the full status state machine before building any UI on top of it. This is the Section 21.1 priority-one item — do not skip or defer this testing.

2. Manual invoice creation + line items from GitHub activity (Section 3, Section 9)
   - Manual line item entry.
   - Generate suggested line items from repo_activity where billable=true for the project — these are suggestions with included defaulting true but fully editable/removable, never auto-confirmed into a sent invoice.
   - Apply the "also linked to [other client]" flag from Phase 2's prep work here, on any suggested line item whose source repo has more than one active project link.

3. Payment links (Section 3, Section 6)
   - Stripe and Paystack integration for generating payment links per invoice. This needs API keys. STOP and give me these steps:
     Stripe:
     1. Go to https://dashboard.stripe.com/register (or sign in if I already have an account — ask me)
     2. Once in the dashboard, go to Developers → API keys
     3. Use TEST mode keys first (toggle in the top-left) — give me the "Publishable key" and "Secret key" from test mode
     4. We'll switch to live keys together once the whole flow is tested end to end — do not use live keys during development
     Paystack:
     1. Go to https://dashboard.paystack.com/#/signup (or sign in if I already have an account)
     2. Go to Settings → API Keys & Webhooks
     3. Give me the Test Secret Key and Test Public Key
     Wait for both before building the payment link generation.
   - Currency handling per Section 21.6: no conversion, each invoice keeps its own currency, reporting groups by currency rather than blending.

4. Webhook listener + reconciliation (Section 21.4 — read this section closely, it's two required parts, not one)
   - Part 1: Convex HTTP action for checkout.session.completed (Stripe) and the equivalent Paystack event. Verify the provider's signing secret BEFORE processing anything — same signature-first, then-idempotency-check pattern as Phase 2's GitHub webhook. On a verified new event, increment amount_paid (never set a boolean directly).
     For webhook secrets: Stripe gives you a webhook signing secret when you register the endpoint in Developers → Webhooks → Add endpoint (use the Convex HTTP action URL). Paystack similarly under Settings → API Keys & Webhooks. Ask me to add the endpoint in both dashboards once you have the Convex URL, and get the resulting secrets from me before finishing this part.
   - Part 2: a Convex scheduled function (daily) that queries invoices with status in (sent, overdue) and stale updated_at, calls each provider's list-sessions/list-charges API, and applies any completed payment not yet reflected — through the exact same idempotent write path as the webhook handler (keyed on charge/session ID via processed_webhook_events). Do not write a second, separate code path for this — it must call the same underlying mutation the webhook handler calls.
   - Do not skip Part 2. It's explicitly the highest-priority addition in the whole PRD given the money-handling bar — a webhook-only implementation is not acceptable for this phase to be considered done.

5. PDF generation (Section 15, Section 22.18)
   - Server-side PDF generation for invoices, using the separate print-specific stylesheet described in 22.18 — white background, black text, no glass/dark mode, Geist Mono for figures, freelancer's own branding only.

6. Client-facing send (Section 15)
   - This depends on Gmail integration which doesn't exist until Phase 4. For this phase, build invoice sending via the Section 15 "system-generated/transactional" path only (Resend or Brevo — pick one and tell me why) so invoices can be sent even before Gmail is connected. STOP and give me these steps for whichever you pick:
     Resend: 1. Sign up at https://resend.com  2. Go to API Keys → Create API Key  3. Give me the key
     (or Brevo's equivalent if you pick that instead)
   - This also needs domain verification (Section 21.11 — SPF/DKIM/DMARC). Give me the exact DNS records to add once you've set up the sending domain, and tell me which DNS provider I need to add them at (wherever the domain is registered).

7. HCI for financial actions (Section 23.9)
   - Every action that sends money-related communication (send invoice, send payment reminder) requires explicit confirmation before it fires, regardless of how minor it might otherwise seem. Do not use the undo-after pattern (23.3) for these specific actions — confirm-first only, per 23.9's explicit carve-out.

STOP CONDITION: Report back:
- Test results for the status state machine and the concurrent invoice-numbering test
- A full walkthrough: create invoice → generate payment link → simulate a test payment → webhook fires → status updates correctly
- Confirmation the reconciliation job exists and calls the same write path as the webhook handler (show me the shared function)
- Any credentials still outstanding

Wait for my sign-off before starting Phase 4. Do not switch any keys to live/production mode without my explicit confirmation.
```

---

## Phase 4 — Gmail integration

```
Re-read the full PRD before starting, paying particular attention to Section 17 (the entire $0 Gmail architecture, including the forwarding confirmation flow and its threading caveat) and Section 20.9 (token encryption). This is the most manually fragile flow in the whole product — move carefully and build the status-visibility pieces (Section 23.2) alongside the flow itself, not after.

Scope for this phase, and ONLY this phase:

1. Google OAuth setup
   - You likely already have a Google Cloud project from Phase 0's "Sign in with Google." Reuse it — do not create a second one unless there's a good reason to, and ask me first if you think there is.
   - Add the gmail.send scope (sensitive, not restricted — no CASA required, per Section 16/17).
   - STOP and confirm with me:
     1. Go back to the same Google Cloud project from Phase 0
     2. APIs & Services → OAuth consent screen → Data access → Add or remove scopes
     3. Add https://www.googleapis.com/auth/gmail.send
     4. Confirm the scope shows as "Sensitive" not "Restricted" in the consent screen review before proceeding — if Google flags it as Restricted, stop and tell me, something's wrong with the scope selection
   - Store google_refresh_token_encrypted per Section 20.9: encrypted at the application layer before write, using a symmetric key in Convex environment variables, decrypted only inside server-side Convex actions, never in a client-facing query. STOP and ask me to generate/provide the encryption key, or generate one yourself and tell me to save it securely outside the codebase.

2. Sending (Section 17)
   - Use gmail.send so the freelancer sends from their own identity. Wire this into the invoice-sending flow from Phase 3 (client-facing sends now go through Gmail when connected, falling back to the Phase 3 transactional email path when not).

3. Forwarding + confirmation flow (Section 17 — read this twice, it's the most detailed flow in the PRD)
   - Generate a per-contact dedicated inbound address (client-{contact_id}@inbound.yourdomain.com). This requires an inbound email parsing service. STOP and give me these steps:
     1. Go to https://www.mailgun.com (or Postmark, https://postmarkapp.com — pick one, tell me why)
     2. Sign up, add the domain we're using for inbound mail (may be a subdomain like inbound.signalapp.com — tell me which)
     3. Get the DNS records needed to receive mail at that domain (MX records specifically)
     4. Give me the exact records to add and where (same DNS provider as Phase 3's SPF/DKIM setup)
     5. Get the API key for parsing/receiving inbound mail, give it to me to add to Convex env vars
   - Show the freelancer both the filter text AND the forwarding address as a single copy-button block (Section 23.7 — forgiving input, not something to retype).
   - Build the confirmation-detection handler: recognize Google's forwarding-confirmation email format when it arrives at the inbound address, surface the confirmation code back to the freelancer in the UI automatically (poll or re-check on page load per Section 23.7 — don't require a manual "I did it" click as the only way to progress).
   - gmail_filter_setup.forwarding_confirmed tracks this state. Show "pending confirmation" clearly in the UI (Section 23.2) until it flips true.
   - Filter chain limit: once a freelancer has ~15-20 client emails in one filter, auto-generate a second numbered filter block and surface both separately (gmail_filter_setup.filter_group).

4. Inbound message handling + spoofing guard (Section 17's inbound spoofing guard)
   - On a forwarded message arriving, verify SPF/DKIM pass on the ORIGINAL forwarded message (check what your inbound provider exposes for this — Mailgun/Postmark both parse and expose these headers) before writing to messages. Reject and log anything that fails this check — do not silently write it to a client's timeline.
   - Write to messages and, via the shared helper from Phase 1, to timeline_events.
   - Build the reply box on the client's page — replying sends via gmail.send.

5. LLM triage gating (Section 6, Section 20.14) — build this now since email triage is the first place it applies
   - users.ai_triage_enabled toggle in settings, default true.
   - If you're implementing any LLM-based classification in this phase, gate it behind this flag and behind a per-user daily cap (rate_limits table, action_type: llm_triage). Falls back to rule-based-only when the flag is off or the cap is hit. If Groq/Gemini keys are needed:
     Groq: 1. Go to https://console.groq.com  2. API Keys → Create  3. Give me the key
     Gemini: 1. Go to https://aistudio.google.com/apikey  2. Create API key  3. Give me the key
     Ask me which one to use as primary before implementing.

STOP CONDITION: Report back:
- The full flow demonstrated: connect Google → send test invoice via Gmail → set up forwarding for a test contact → confirm forwarding → send a test email to the forwarding address → see it land on the timeline
- Confirmation of the SPF/DKIM spoofing guard with a test case showing a forged message gets rejected
- Confirmation the refresh token is encrypted at rest (show me where the decrypt-only-in-actions boundary is enforced in code)
- Any issue with the threading caveat (Section 17) — does In-Reply-To survive forwarding in your testing, or does threading break as the PRD warned it might?

Wait for my sign-off before starting Phase 5.
```

---

## Phase 5 — WhatsApp, client portal, remaining hardening

```
Re-read the full PRD before starting. This is the last feature phase — WhatsApp, the client portal, follow-up nudges, push notifications — plus every remaining Section 20/21 hardening item not already built in earlier phases (session security, full audit logging, rate limiting, account deletion, backups, error monitoring).

Scope for this phase, and ONLY this scope:

1. WhatsApp Business Cloud API (Sections 10, 16, 17, 21.12)
   - STOP and give me these steps:
     1. Go to https://developers.facebook.com and create a Meta App (type: Business)
     2. Add the WhatsApp product to the app
     3. Go through Meta's business verification (warn me now: this is a manual review, can take days — start this early, don't block the rest of Phase 5 on it)
     4. Get the temporary access token for testing, and the phone number ID from the WhatsApp → API Setup page
     5. Give me both, plus the App Secret from Settings → Basic
   - Webhook handler: verify X-Hub-Signature-256 (Meta's signature, same pattern as GitHub/Stripe) before processing, then idempotency check via processed_webhook_events, same as every other webhook in this build.
   - Match inbound messages to contacts by phone number (contact_phones table). Unmatched → general inbox.
   - Gate LLM-based spam/cold-outreach classification behind ai_triage_enabled and the daily cap, same as Phase 4's email triage — reuse the same rate-limit logic, don't duplicate it.
   - Write to messages and timeline_events via the shared helper.

2. Client portal (Sections 3, 20.7)
   - Magic-link auth: time-limited (15 min), and explicitly SINGLE-USE — invalidate immediately on first successful use, not just on expiry. Write a test for this specifically.
   - Portal shows: shared docs, invoice status, project status, branded to the freelancer only.
   - Uses the Resend/Brevo transactional path from Phase 3 to send the magic link.

3. Follow-up nudges (Section 3, follow_up_reminders table)
   - The core "you haven't followed up with X in N days" logic, surfaced via the Beacon motif (Section 22.6) on the relevant contact.
   - Push notifications (Section 12) via Web Push/VAPID for this and the other event types listed in Section 12.

4. Documents (Section 15's Google Docs/Sheets/Slides generation path)
   - Generate-from-template via Drive/Docs API for proposals, linked back to the contact record.

5. Remaining Section 20/21 hardening not yet built:
   - Sessions: "sign out everywhere" action (Section 20.13/21).
   - api_keys table + scoped API authentication (Section 20.12) — the free-from-day-one API access.
   - Full audit_log coverage across every destructive/financial action listed in Section 21.8 (some of this exists already from earlier phases — fill in the gaps, don't duplicate).
   - Rate limiting (Section 21.10) on magic links, webhook receivers, signup, and API keys.
   - Account deletion (Section 21.7) — cascading hard delete with the two stated exceptions (export-first prompt for active invoices, audit_log persists per Section 18's retention exception).
   - Weekly backup export (Section 21.16) to Cloudflare R2 (or your chosen $0 cold storage) for invoices/invoice_line_items/contacts.
   - Error monitoring: self-hosted GlitchTip (Section 21.3) — STOP and ask me where to deploy it (a free Fly.io/Render instance) before setting this up, since it needs its own hosting decision.
   - CI: add the Playwright smoke tests and multi-tenant isolation tests (Section 21.9) to the pipeline from Phase 0.

6. Final HCI pass (Section 23, sitewide)
   - Audit every flow built across all five phases against 23.1–23.9. This is a review pass, not new feature work — go screen by screen and confirm: destructive actions confirm, async actions show status, financial actions confirm-first (not undo-after), integration flows share one pattern, mobile touch targets meet 44px minimum.
   - Report back anything that doesn't comply rather than silently fixing everything — some of these may be judgment calls worth reviewing with me first.

7. Legal/compliance documentation (Section 20.10)
   - Draft (don't just describe) a privacy policy and ToS covering what's actually stored, all third-party subprocessors (Google, GitHub, Meta, Stripe/Paystack, Documenso if used, Resend/Brevo, Groq/Gemini), the audit_log retention exception, and data deletion. Flag the NDPR registration-threshold question to me directly — this needs a human decision, not an agent guess, about whether we're at a scale that requires registration.

STOP CONDITION: This is the last phase. Report back a full walkthrough of the entire product, phase by phase, plus:
- A list of every credential currently in use and whether it's still in test/sandbox mode or has been switched to live
- Every open question flagged during any phase that's still unresolved
- Your own honest assessment of what's NOT production-ready yet, if anything — I explicitly want pushback here, not a clean bill of health if one isn't warranted

Wait for my review before considering this shipped.
```

---

## Notes for you, not the agent

- **Phase 3 and Phase 4 are the two phases where I'd personally review the agent's code most carefully before signing off** — money and Gmail are the two places a subtle bug is expensive or embarrassing, not just annoying.
- **Live credential switches** (Stripe/Paystack from test to live, WhatsApp from sandbox) should be a conscious decision you make, not something the agent does automatically because a phase said "connect payments." Every prompt above says this explicitly, but it's worth double-checking in review too.
- If the agent tries to skip a STOP CONDITION and keep building into the next phase, that's a sign to interrupt and re-anchor it — the phase boundaries exist specifically so you get a review point before scope grows further.

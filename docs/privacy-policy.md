# Signal CRM — Privacy Policy (draft for §20.10)

> **Status: draft.** Written to cover what the product *actually* stores and does
> today. Review before the hosted instance accepts its first real user. This is
> plain-language, not legal advice; have it reviewed by someone qualified before
> publishing.

## What this product is

Signal is a CRM for solo freelance developers. It stores your client
relationships, projects, GitHub activity, email/WhatsApp messages, invoices and
payments, and lets you generate documents and send client-facing communication.

## What we store (Section 18 of the spec)

- **Your account:** name, email, integration tokens (GitHub, Gmail, WhatsApp,
  payment providers), theme preference, timezone.
- **Your client data:** contact details (name, company, emails, phones, tags),
  projects, notes, custom fields, timeline events, follow-up reminders.
- **Activity:** GitHub repo activity, email/WhatsApp messages, calendar events.
- **Financial:** invoices, line items, payment records. **Money fields are stored
  as integers in minor units** (cents/kobo) — we never store floats for money.
- **Security:** sessions, API key hashes, audit log, rate-limit counters.

## How we protect it

- Passwords are handled by Convex Auth (we never see or store your password hash
  on our tables).
- Gmail refresh tokens are **encrypted at rest** with a symmetric key held in
  server-side environment variables, and are only decrypted inside server-side
  functions — never in the browser.
- API keys are hashed (SHA-256); the raw key is shown once at creation and never
  stored or displayed again.
- All queries and mutations are scoped to the authenticated user (§21.9); the
  product is single-operator, so one account is the only user of its own data.

## Third-party subprocessors

| Service | What it sees/does | Why |
|---|---|---|
| Convex | Hosts the database and backend functions | Primary data store |
| Vercel / Cloudflare Pages | Hosts the frontend | Static hosting |
| GitHub | Your repos, webhook payloads | Repo linking + activity |
| Google (Gmail API) | Your Gmail send; forwarded inbound mail | Sending/receiving client email |
| Meta (WhatsApp Cloud API) | WhatsApp messages to/from your number | WhatsApp messaging |
| Stripe / Paystack | Payment sessions/charges | Client payments |
| Resend / Brevo | Transactional email (invoice sends, magic links) | System email |
| Groq / Gemini | Message content **only when AI triage is enabled** — ambiguous messages only, daily-capped | Spam/important classification |
| Cloudflare R2 (or S3-compatible) | Weekly backup exports of invoices/line items/contacts | Backups |
| Mailgun / Postmark | Inbound email parsing | Email forwarding |

**LLM disclosure:** when `ai_triage_enabled` is on, ambiguous inbound messages
may be sent to a free-tier LLM provider (Groq or Gemini) for classification,
subject to a per-user daily cap. Rule-based filtering runs first and catches the
obvious cases without any third-party call. You can disable AI triage in
Settings; when off, no message content leaves for LLM processing.

## Data retention and deletion

- You can delete your account at any time from Settings. This **hard-deletes**
  your contacts, projects, invoices, messages, tokens, sessions, and API keys.
- **Two exceptions, stated plainly:**
  1. If you have active (issued, unpaid) invoices, we prompt you to **export
     first** — we won't destroy financial records a client may still need
     without that confirmation.
  2. **Audit log rows persist after deletion** as an orphaned record. This is a
     deliberate retention exception: financial and destructive actions (invoice
     status changes, merges, deletions, integration disconnects) stay traceable
     even after the account is gone. These rows reference entity IDs that no
     longer resolve to anything.
- **Weekly backups:** invoices, line items, and contacts are exported weekly to
  cold storage (Cloudflare R2 or equivalent). Backups are retained according to
  the storage provider's lifecycle policy.

## Your rights

You can request a copy of your data at any time (the product's export path, or
contact us directly). Deletion is self-service via Settings and takes effect
immediately.

## NDPR — IMPORTANT FLAG (needs a human decision)

This product targets the Nigerian market first. **NITDA's NDPR requires data
processors to register when processing Nigerian residents' personal data at
"meaningful scale."** Whether Signal's expected user volume crosses that
threshold is a judgment call we are explicitly not making here — it needs a
human decision before the hosted instance accepts real Nigerian users. This
document is a placeholder on that point until the decision is made and (if
required) registration is completed.

## Changes to this policy

We'll update this document as the product changes and note the date of the last
change at the top.

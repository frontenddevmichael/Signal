# The Complete Vision — A Free CRM Built For Solo Devs

Full-build spec. Not phased, not MVP-scoped — this is what the finished product looks like. Research base: Folk, Notion-as-CRM, HubSpot Free, Attio, HoneyBook/Bonsai/Dubsado, plus a realistic pass on what it takes to actually build and sustain this as a free, donation-funded product.

**Stack decision (locked):** Vite + plain CSS + Convex. Convex's document/table model with indexes replaces the FK-style joins in Section 18's schema — e.g. `contact_emails` becomes a table with an index on `contactId` rather than a foreign key constraint. Convex's scheduled functions also cover the follow-up nudges (Section 3) and any polling needs without a separate cron layer.

**Money handling (locked):** every monetary field in this spec — `total`, `subtotal`, `amount_paid`, `amount_refunded`, `tax_amount`, `invoice_line_items.amount` — is stored as an **integer in minor units** (cents/kobo), never a float. All arithmetic happens in minor units; conversion to a display string (`₦12,500.00`) happens only at render time. This is a schema-level rule, not a suggestion, since a float-based money bug is expensive to find after real invoices exist.

**Schema migrations (locked):** new fields are added as optional/nullable by default so existing rows stay valid without a backfill. Anything that isn't backward-compatible (a field going from nullable to required, a type change) needs an explicit one-time backfill mutation, run and verified against a Convex dev deployment before it touches production data. This applies from the first schema change onward, not just once real users exist.

---

## 1. The core idea

A CRM built around one person running their own dev business, where the record of a client relationship isn't just emails and notes — it's the actual work: the repo, the merged PRs, the closed issues, the deploy that shipped, next to the invoice, the proposal, and the next follow-up. Every competitor in this space (Folk, Attio, HoneyBook) treats "the work" as an opaque external thing. Because this is built by a developer for developers, it doesn't have to.

**The moat: dev-native context.** A generic CRM can copy a pipeline view or an invoice generator in a sprint. It cannot cheaply replicate deep GitHub-aware relationship tracking, because that requires actually understanding how developers work — not just adding a "GitHub" icon to an integrations page.

---

## 2. What each competitor contributes (recap)

| Tool | Best idea to take | Real weakness |
|---|---|---|
| Folk | Person-centered records, one-click capture, relationship timeline | Paid-only, deal management gated, no real automation |
| Notion | Fully flexible views/fields over any data | Zero CRM logic — no reminders, no invoicing, no auto-capture |
| HubSpot Free | Proof a full-shaped free CRM can exist | Caps (1,000 contacts/2 users), branding tax, built for teams |
| Attio | Custom object model + relationships, not rigid contacts/deals | Cold-start problem — flexible shell, nothing pre-filled |
| HoneyBook/Bonsai/Dubsado | Full lead → proposal → contract → invoice → paid flow | $20–$109/mo, weaker outside US/UK |

---

## 3. Complete functional requirements

### Contacts & relationships
- Person-centric record as the core object, with company/organization as a linked (not required) secondary object
- Full interaction timeline per contact: emails, calls/meetings, notes, invoices, GitHub activity — one scroll, chronological
- One-click capture from LinkedIn/web via browser extension
- Custom fields, no schema lock-in
- Tags and saved filtered views

### Data model
- Attio-style architecture: user-definable object types (Project, Invoice, Contact, Retainer, whatever they need) with native relationships between them, not just manual page links
- Multiple views over the same data: table, kanban/pipeline, calendar, timeline
- **Retainers are explicitly out of scope for the core build** — see Section 7a. "Retainer" appears here only as an example of the kind of custom object type the model supports, not as a promised feature.

### Pipeline
- Loose, reshapeable stages per project type — not a forced sales funnel

### Follow-up automation
- "You haven't followed up with X in N days" nudges, the single highest-leverage feature for a solo operator working alone

### Dev-native context (the differentiator)
- Connect GitHub once at the account level via a **GitHub App** (not per-client) — see Section 9a for the full connect + import flow and the reasoning behind choosing a GitHub App over a plain OAuth App
- Import one or more repos onto a *project* (not the top-level contact) from whatever the GitHub App installation has been granted access to
- Pull merged PRs, closed issues, and deploy events onto that contact's timeline automatically, delivered via the App's installation-scoped webhooks
- Generate invoice line items from closed issues/merged PRs instead of typing them manually
- Optional: surface a "what did I actually ship for this client this month" view, generated from repo activity — useful for both invoicing and the client update email

### Proposals & contracts
- Draft and send proposals from inside the tool, track opens
- Contracts handled via integration with an established e-signature provider (see Section 6) rather than building e-signature natively

### Invoicing & payments
- Generate invoices from a project (manually or from GitHub activity), track payment state in full (Section 18 — paid/partially paid/overdue/void/refunded, not a binary)
- Payment collection via payment *links* from Stripe/Paystack — the CRM never touches card data or holds funds itself
- Multi-currency, since this is international from day one (no conversion — see Section 21.6)
- Tax/VAT as a freelancer-set field on each invoice (Section 18), never calculated or filed by the product

### Time tracking
- Optional per-project timer for anyone billing hourly

### Automation
- Trigger-based workflows: stage change → send reminder, invoice overdue → nudge, project marked complete → prompt for a review/testimonial ask

### Client portal
- Optional client-facing view: shared docs, invoice status, project status — branded to the freelancer, never to the CRM tool

### Notes
- Rich-text notes/docs per contact or project, Notion-style

### Reporting
- Money in/out, pipeline value, follow-ups pending — deliberately not enterprise BI

### Google integration ("Google superpowers")
- **Calendar** — meetings on the contact record automatically, follow-ups scheduled as real events, a lightweight booking-link flow for sharing availability
- **Meet** — auto-attach a Meet link when scheduling from the CRM; pull call duration back onto the timeline after
- **Gmail** — auto-log emails to/from a contact on their timeline; send proposals/invoices from the user's own Gmail identity so replies land normally
- **Contacts (People API)** — optional two-way sync with the user's phone contacts
- **Drive** — attach/link proposal docs and deliverables stored in Drive directly to a record instead of re-uploading

---

## 4. Non-functional requirements

| Category | Requirement | Why |
|---|---|---|
| Access model | No artificial contact/user caps | HubSpot's 1,000-contact cap hits a working freelancer within a year |
| Branding | Never stamp CRM branding on client-facing invoices/portals | Directly hurts the freelancer's professional image |
| Data ownership | Full export (CSV/JSON) at any time, no lock-in | Standard freelancer pain point across every tool reviewed |
| Performance | Fast, keyboard-friendly UI | Attio and Notion's most-praised trait |
| Onboarding | Usable within ~20 minutes for first login, **with an explicitly stated recurring per-client tax** (Section 17 — the Gmail filter step happens on every new client, not just once), no sales call required | Folk's biggest strength; Attio's biggest complaint is the opposite. Honesty about the per-client cost matters more than a clean one-time number that isn't true |
| Mobile | Responsive web app at minimum; native app as a later goal | Folk is criticized for having no mobile app at all |
| Extensibility | API access free from day one, never gated, authenticated via scoped per-user API keys (Section 20.12) | Folk gates API access behind its priciest tier |
| International-first | Multi-currency, WhatsApp as a real channel, no US/UK-only assumptions | Bonsai/HoneyBook are explicitly weaker outside the US/UK |
| Security & compliance | See Section 6 — this has to be built correctly, not skipped | Payments, e-signature, and Gmail access all carry real regulatory/legal weight |

---

## 5. The funding/hosting decision this depends on

This has to be picked before the architecture is finalized, because it changes everything downstream:

- **Self-hosted, open source** — users run their own instance. **Stated plainly: because the stack is Convex, "self-hosted" means running your own Convex deployment (Convex supports this), not a drop-in `docker compose up` the way a Postgres-backed app would be.** Your infra cost stays near zero regardless of how many people adopt it, and GitHub Sponsors/Open Collective funds ongoing development. Trade-off: real adoption friction, since most solo devs won't want to run and maintain their own server or Convex deployment, even if they're capable of it. Document the actual self-hosting steps (Convex deployment setup, env vars, DNS for email deliverability per Section 21.11) as a first-class guide, not an afterthought — an inaccurate "just self-host it" promise is worse than no promise at all.
- **You host it, donation-supported** — zero setup friction for users, but your infra cost scales with every user you gain, and donation income historically does not track usage growth for free tools. This only works if you can keep infra cost per user very low (lightweight stack, aggressive caching, no heavy AI calls by default) or if you're comfortable subsidizing it as a loss-leader tied to PrimeAxis' reputation.
- **Realistic middle ground** — ship it as open source and self-hostable by default, and *also* offer a hosted instance for people who don't want to self-host, where the hosted version is what carries a "support this project" prompt. This gets you both adoption paths without forcing the choice — but it's more engineering surface area (you're now maintaining a multi-tenant hosted product *and* a self-host-friendly single-tenant build), which is worth being honest about up front.

## 6. Handling the regulated pieces correctly (not skipping them)

Since this is the full build, these need real answers, not deferrals:

- **Payments** — never touch card data or hold client funds directly. Route all payment collection through Stripe Payment Links / Paystack, so PCI scope stays with them, not you.
- **E-signature** — integrate an established provider (e.g. embed a signing flow via an e-signature API) rather than building legally-binding signature capture from scratch. Legal validity of e-signatures varies by country; building this natively is a liability you don't want to own.
- **Tax/invoicing** — generate invoices, don't attempt to calculate or file taxes. `invoices.tax_rate` and `invoices.tax_amount` (Section 18) are fields the user sets themselves per invoice, or as a settings default that pre-fills — never derived from jurisdiction logic.
- **Gmail access at scale** — Google requires app verification for sensitive scopes, and once past roughly 100 users, a **CASA third-party security assessment** is required, which has a real cost and isn't a formality. Budget for this explicitly as part of the full build rather than discovering it at launch — this is the single most likely place a "free forever" product hits a real dollar cost that donations need to cover.
- **Data handling** — store the minimum necessary from any connected account (message metadata/snippets over full email bodies where possible), both to reduce privacy risk and to make the CASA assessment and any future audit smaller in scope.
- **LLM-based message triage (WhatsApp/email spam classification, Section 10; "Recap" assistant, Section 19) is a data-processing relationship in its own right, not covered by the Google/CASA discussion above.** Message content from unmatched contacts may be sent to Groq/Gemini for classification. This needs: (1) explicit disclosure of Groq/Gemini as subprocessors in the privacy policy (Section 20.10), (2) a real per-user toggle (`users.ai_triage_enabled`, default true) that falls back to rule-based-only classification when off, and (3) truncation of message content sent to the LLM (strip attachments/links, cap length) rather than forwarding full bodies by default. This is cheap to build and closes a real gap between what the product does and what the privacy policy would otherwise claim.

---

## 7. Deliberately excluded, permanently

Not deferred to "later" — structurally out of scope regardless of how much this grows:

- Multi-user/team permissions, roles, seat management — this is a single-operator tool by design
- Marketing/email campaign sending at volume
- Deep BI/forecasting/reporting
- A full project-management tool (task boards, sprints) — GitHub/Linear/Trello already own this; only the business layer of the relationship belongs here

## 7a. Explicitly deferred (not excluded, not in the core build)

Distinct from Section 7 — these are real, plausible features that are *not* structurally against the product's philosophy, but are cut from this build to keep the schema and scope honest:

- **Recurring invoices / retainer billing.** §3's data model references "Retainer" only as an example of a user-definable object type, not a shipped feature. `invoices` has no `recurrence_rule` or subscription concept in Section 18. If retainer-based work is common enough in the target market to matter, it should be scoped as its own section before building — not assumed to fall out of the existing invoice model for free, since recurring billing (proration, failed-renewal handling, cancellation) is a meaningfully different problem from one-off invoicing.
- **Two-factor authentication.** Worth adding post-launch (Section 20.13 covers baseline session security for launch); not a blocker for the first real users.

---

## 8. Why this can win

- **Vs. Folk** — same relationship-first, one-click-capture philosophy, free, no deal-management paywall
- **Vs. Notion** — same flexible data model, but real CRM logic (follow-ups, invoicing, GitHub-aware timeline) instead of a blank structure the user has to build themselves
- **Vs. HubSpot Free** — same "genuinely free" pitch, no branding tax, no contact cap, architecturally built for one person instead of a team that happens to be small
- **Vs. Attio** — same flexible object model, but the cold-start problem is solved because the client-ops workflow and GitHub-aware data are pre-built, not left empty
- **Vs. HoneyBook/Bonsai/Dubsado** — same "one platform instead of three subscriptions" pitch, free instead of $20–$109/month, and the only one of the group that actually understands developer workflow

---

## 9. Matching edge cases (GitHub, email, WhatsApp all share this problem)

- **One repo, multiple clients** (agency-style monorepo) — the repo-to-client link must be many-to-many, not one repo = one client. **Billing decision (locked, default flipped for the ambiguous case):** `repo_activity` is written once per `project_repo` link, not once per repo — a PR merged on a repo linked to two projects still produces two `repo_activity` rows, one per project, so both clients keep accurate timeline visibility. The `billable` default depends on how many active projects the underlying repo is linked to at write time: **exactly one project → `billable: true` by default** (the overwhelming majority case, unchanged, no extra friction). **More than one project → `billable: false` by default on every row for that repo.** This flips the risk deliberately: forgetting to mark something billable is a missed line item; forgetting to mark something *non*-billable in the multi-client case is a double-invoiced PR, which is a billing-integrity failure, not just a missed one — so the ambiguous case is opt-in, not opt-out. Automatic guessing about which client a given commit belongs to is still avoided entirely, for the same reason as before: it would be wrong often enough to be worse than requiring a manual choice. The existing "already linked to Acme Co." inline flag (Section 9a) makes the multi-link visible at import time, and at invoice-generation time any suggested line item drawn from a multi-linked repo carries an inline "also linked to [other client]" flag, so the ambiguity surfaces again at the exact moment it matters most — right before something gets billed.
- **A contact using multiple identifiers** — email and phone fields need to support arrays, not a single value, or matching silently breaks the moment a client emails from a second address or messages from a second number
- **Non-billable activity on a linked repo** — an internal refactor or unrelated fix shouldn't become an invoice line item automatically. Suggested line items from GitHub activity must always be editable/removable before an invoice is sent, never auto-confirmed

---

## 9a. GitHub connection flow — decided

**Decision: a GitHub App, not a plain OAuth App.** Both are entirely free to build and run at any usage level — App creation, API calls (5,000 req/hr per installation), webhooks, and installs all carry no cost. The GitHub App is chosen because it's a strictly better free option, not a paid upgrade: it gives per-repo (or per-org) scoped access instead of all-or-nothing account access, and it comes with installation-scoped webhooks for free, which live PR/issue/deploy events on the timeline (Section 3) depend on.

A plain OAuth App was considered and rejected as a *second, parallel* connection path ("give the user more options") — rejected specifically because offering both would mean building and maintaining two auth flows, two token-refresh models, and forcing a meaningless choice on the user on day one, for no real gain over just using the GitHub App. Where "more options" *does* apply is scope, and the GitHub App already provides that for free (see below) — so nothing is lost by not building a second path.

**The flow:**

1. **"Connect GitHub" lives on the account/settings page — once, not per-client.** Redirects to GitHub's install screen for the App.
2. **On GitHub's side**, the user picks which org/account to install into, and whether to grant "All repositories" or "Only select repositories" (with a picker, if select). This is GitHub's own hosted UI — nothing custom to build here.
3. **GitHub redirects back** with an `installation_id`, stored on the `users` row.
4. **In a project, "Import repo"** calls the installation's repo list and shows a picker of whatever was granted in step 2, scoped to a *project*, not the top-level contact — matches the `project_repos` many-to-many table in Section 18, since repos belong to the work, not the person.
5. **Selecting a repo** writes to `repos` (if new) and `project_repos` (the link).
6. **"Add more repos" later** links straight to GitHub's own installation "Configure" page — GitHub hosts this, so no custom widen-access UI is needed on our end.
7. **Webhooks** (`push`, `pull_request` merged, `issues` closed, deployment events) arrive automatically for every repo the installation covers, no per-repo subscription step. The webhook handler verifies the `X-Hub-Signature-256` header against the App's webhook secret before processing anything (Section 20.11), then filters to repos that exist in the `repos` table and writes to `repo_activity`.

**Decided:** the "import repo" picker does not exclude repos already linked to a different client. It shows all repos the installation has access to, and any repo already attached to another contact/project is flagged inline (e.g. "Already linked to Acme Co.") rather than hidden or blocked. The freelancer can still import it — this supports the legitimate monorepo case from Section 9 (one repo, multiple clients), and drives the per-`project_repo` billing decision above — the flag just makes sure it's a deliberate choice, not an accidental double-link.

**Backfill queuing (see Section 20.2 for the full backfill decision):** when multiple repos are imported in quick succession (e.g. a freelancer connects 10+ repos in one settings session), backfill jobs are queued with a small concurrency cap (e.g. 2 at a time) rather than fired simultaneously, so a large import doesn't temporarily starve webhook processing for the same installation against the shared 5,000 req/hr ceiling.

---

## 10. WhatsApp integration

### What's realistic
WhatsApp doesn't work like Gmail/Calendar OAuth — there's no "connect your personal WhatsApp" option. To programmatically receive and send messages, this requires the **WhatsApp Business Platform (Cloud API)**, accessed through Meta directly or a provider (Twilio, 360dialog, WATI). Two things to know going in:

- **The number gets "converted."** If the freelancer wants this on their existing business number, that number can no longer be used in the regular WhatsApp mobile app once it's on the Business Platform API — it's one or the other. This needs to be communicated clearly during setup, not discovered afterward.
- **It isn't free at scale.** Meta charges per business-initiated conversation once a user is outside the 24-hour customer-service window (replies within 24 hours of an inbound message are free; freelancer-initiated messages outside that window incur a per-conversation fee). For a donation-funded product, this is a direct, metered cost per active client relationship — worth planning into the funding model in Section 5, not treated as a free feature.
- **Business verification is a manual review, not instant.** Meta's own business verification (submitting the freelancer's business details) is free but can take days and occasionally requires documentation — stated as an onboarding expectation ("WhatsApp connection may take a few days to approve"), not presented as instant like the GitHub/Google connections (Section 21.12).

### How matching works (same pattern as email)
Incoming WhatsApp messages are matched to a contact by phone number. A message from a known client's number triggers a notification/alert tied to that contact's record and lands on their timeline. A message from an unrecognized number lands in a general inbox the freelancer can view and reply to directly from the app — with a prompt to "add as contact?" the same way an unmatched email would.

Every inbound webhook payload is verified against Meta's `X-Hub-Signature-256` header (using the app secret) before any write to `messages` — this is a stated requirement, not implicit, matching the same rule applied to GitHub webhooks (Section 9a) and payment webhooks (Section 21.4). An unverified webhook endpoint is an open door for someone to inject fake messages onto a client's timeline.

### Useful vs. useless message sorting
This is a genuinely good idea and technically doable: run incoming messages from unmatched numbers through a lightweight classifier (a small LLM call, or simple keyword/heuristic rules first) to flag likely spam/cold outreach vs. a real inquiry, and sort the general inbox accordingly — gated by `users.ai_triage_enabled` (Section 6). Worth noting honestly: every classification call is a small recurring cost too (if LLM-based), and it will occasionally misclassify — so it should assist triage (sort/label), not silently hide or delete anything. A per-user daily cap on LLM triage calls (Section 20.14) prevents one high-volume number from burning through free-tier limits for everyone.

---

## 11. Scoped Gmail — the reality behind "per-client only"

Scoping the *UI* to only show client-linked email threads is the right call for reducing clutter — but it doesn't reduce the underlying **OAuth scope** or the CASA assessment requirement from Section 6. To know a new email arrived from a client at all, the system still needs read access to the inbox (or at minimum a filtered watch via the Gmail API) — filtering happens after the read, not instead of it. So this is good UX scoping, not a way around the Google verification/compliance cost flagged earlier. Worth knowing that going in so it doesn't come as a surprise later.

One implementation option worth considering: have the freelancer set up a Gmail filter/label per client (many people already do this manually), and have the CRM only pull messages carrying that label via the Gmail History API. This keeps the *data actually stored* minimal even though the OAuth grant itself is still broad.

---

## 12. Push notifications

Realistic event types worth triggering on:
- New message received (WhatsApp or client email) — "Client X reached out"
- Deadline approaching for a client's project/milestone
- Calendar reminder for an upcoming meeting/Google Meet
- Invoice overdue or just paid
- Follow-up nudge fired ("you haven't followed up with X in N days")
- A proposal or invoice was opened/viewed by the client

Technically this is a standard web push (service worker) + optional native push if a mobile app exists later — not a heavy lift compared to everything else in this spec.

---

## 13. Client visualizer + table view

**Visualizer** — a node-based canvas (React Flow is the realistic library choice here — it's very likely what powers Supabase's own schema visualizer, so the instinct to reference it is a good one). Each client is a node; node size/color reflects status (active/closed), urgency (deadline proximity), or revenue — freelancer's choice of what the visual encodes. Hover shows a compact summary (status, last contact, next deadline, outstanding invoice amount). Click opens the full client detail page.

**Table view** — the companion, not a replacement: sortable/filterable columns for status (active/closed), last contact date, next deadline, outstanding balance, linked repo(s). This is what most freelancers will actually use day-to-day for quick scanning; the visualizer is better for "how many active relationships am I juggling right now" at a glance — worth building both since they serve different moments, not competing views of the same need.

---

## 14. Client detail page — full information architecture

Beyond what was proposed, the complete page should hold:

- **Contact info** — name, all linked emails/phone numbers, company, tags, custom fields
- **Relationship timeline** — unified feed: emails, WhatsApp messages, calls/meetings, notes, GitHub activity, invoice events, all chronological in one scroll
- **Linked repos & activity** — merged PRs, closed issues, deploy events, filtered to this client
- **Documents** — proposals, contracts, invoices, and any created docs (see Section 15), all in one place, with status (sent/viewed/signed/paid)
- **Financials** — invoice history, total billed, outstanding balance, payment method on file (link only, never stored card data)
- **Milestones/deadlines** — project timeline with dates, so the "approaching deadline" notification has something to point at
- **Communication preferences** — worth adding: which channel this client actually prefers (email vs. WhatsApp) and any notes on availability/timezone, since solo devs often juggle clients across time zones
- **Relationship health indicator** — worth adding: a simple signal (e.g. days since last contact, unanswered follow-ups) surfaced at the top of the page, since this is the fastest way for a solo operator to spot a relationship going cold
- **Referral/source tracking** — worth adding: where this client came from (referral, cold outreach, platform like Upwork) — useful data for the freelancer to know what's actually generating work over time
- **Testimonial/review capture** — worth adding: a lightweight prompt at project close to request a testimonial, since solo devs rely heavily on social proof and this is otherwise easy to forget

---

## 15. Document creation & sending — a realistic approach

Building a native Word/Excel/PowerPoint-style editor from scratch is a multi-year engineering effort on its own (this is what makes Google Docs/Sheets/Slides and Microsoft Office genuinely hard products) — not realistic for a free, largely solo-built product. The pragmatic version of this idea, given Google is already integrated:

- **Use the Google Docs/Sheets/Slides APIs directly** — generate a document from a template (proposal template, invoice template, simple report) via the Drive/Docs API, pre-filled with client data already in the CRM. The freelancer edits it in actual Google Docs/Sheets/Slides (a real, proven editor) rather than a custom-built one, and it's automatically linked back to the client record via Drive.
- **For simpler cases (invoices, one-page proposals), generate PDFs server-side** instead — far lighter than any office suite, and often what's actually needed rather than an editable document.

This also resolves the "how do we send it to the client" question in two parts, which are actually two different systems:
- **Client-facing sends** (proposals, invoices, replies) go out through the freelancer's own connected Gmail — matching the identity they already communicate from, so replies land normally
- **System-generated/transactional messages** (payment reminders, "your invoice is now overdue," in-app notifications) need a separate transactional email service (e.g. Postmark, AWS SES) sent from the platform itself, since these shouldn't depend on the freelancer's personal Gmail being connected or online

---

## 16. Cost audit — what actually costs money, and the near-zero alternative

Given the constraint that this needs to cost close to nothing to build and run, here's every piece of the spec that has a real dollar cost attached, and the cheapest realistic way to get it anyway.

| Piece | The costly default | The near-zero alternative |
|---|---|---|
| **WhatsApp** | Going through a BSP like Twilio/360dialog/WATI — they charge Meta's fee *plus* their own markup on top | Integrate directly with **Meta's WhatsApp Cloud API** (no middleman, no markup). More importantly: as of Nov 2024, **customer-initiated ("service") conversations are free and unlimited** — since the core use case here is "client messages you, you reply," almost the entire feature is genuinely free. Cost only appears if the freelancer *proactively* sends a template message (e.g. a deadline reminder) outside a 24-hour reply window — keep those rare, or send that specific nudge as a push notification instead of a WhatsApp template |
| **Gmail scope** | Requesting full `https://mail.google.com/` access triggers the most expensive CASA tier ($5,000–$75,000+ historically, though 2026 self-serve Tier 2 labs have brought this down to roughly $540–$1,000 for the lower tier) | Scope the app to **`gmail.send` + `gmail.modify`** (send, archive, label — never permanently delete) instead of full IMAP access. This is documented to qualify for the cheaper CASA Tier 2 path (~$540 DAST scan) instead of the expensive Tier 3 penetration test. Small design decision, big cost difference — worth locking in before writing any Gmail code |
| **Message classification (WhatsApp/email triage)** | Calling a paid LLM API per incoming message | Simple rule-based filtering first (keyword/sender-pattern heuristics catch most obvious spam for free), falling back to a **free-tier LLM API** (Gemini and Groq both currently offer usable free tiers with rate limits) only for the ambiguous remainder — gated by `users.ai_triage_enabled` and a per-user daily cap (Sections 6, 20.14) |
| **E-signature** | DocuSign/HelloSign charge per envelope/month | **Documenso** — open-source and self-hostable, genuinely free if you run it yourself; this fits the self-hosted architecture direction from Section 5 particularly well |
| **Transactional email** (system notifications, not client-facing) | Enterprise email platforms with monthly minimums | **Resend or Brevo** — both have free tiers (thousands of emails/month) that comfortably cover a solo-dev-scale product |
| **Hosting/infra** | A single always-on server sized for peak load | **Convex (free tier) + Vercel/Cloudflare Pages (free-tier hosting)** — serverless/edge architecture means you pay close to nothing until real usage shows up, which matches the "prove it before it costs money" instinct from the funding discussion in Section 5 |
| **Push notifications** | Third-party push service subscription | **Web Push via VAPID keys** — a browser standard, completely free, no third-party service required |
| **Client visualizer** | N/A | React Flow is open-source and free regardless of scale |
| **Google Docs/Sheets/Slides/Drive/Calendar/Meet APIs** | N/A beyond the Gmail scope question above | These APIs themselves are free with generous quotas — the only cost driver in the whole Google stack is the CASA assessment tied to Gmail's restricted scope, addressed above |
| **GitHub API / GitHub App** | N/A | Free at any usage level — App creation, API calls, webhooks, and installs all carry no cost (Section 9a) |
| **Payments (Stripe/Paystack)** | N/A to you | The freelancer's client pays the transaction fee, not the CRM — this was never a cost to the product itself |

**The one line worth remembering:** almost everything in this spec is free by default — the two genuine cost centers are the Gmail restricted-scope CASA assessment and any WhatsApp messaging that falls outside the free customer-service window. Design around both (narrower Gmail scope, lean on free service conversations) and this is realistically buildable and runnable at near-zero cost, at least until real usage justifies real spend.

---

## 17. Getting to true $0 — the Gmail scope workaround

Google's own scope classification makes this possible: `gmail.send` is a **sensitive** scope (standard review only, free, no CASA — ever). `gmail.labels` is **neither** sensitive nor restricted (no verification needed at all). CASA is only triggered by `gmail.readonly` or `gmail.modify`, because those grant inbox read access.

**The $0 architecture:**
- **Sending** — use `gmail.send` so the freelancer sends client emails from their own Gmail identity. Free, no CASA, no annual recertification, ever.
- **Receiving/auto-logging** — never request Gmail read access. The freelancer manually sets up a Gmail filter (one filter, an OR list of client email addresses) that forwards client mail to a dedicated inbound address, caught by a free-tier inbound email parsing service (Mailgun or Postmark both support this free at low volume). **Important correction:** the CRM cannot create or manage this filter on the freelancer's behalf — `gmail.settings.basic` (filter management) is itself a *restricted* scope, same CASA tier as `gmail.readonly`/`gmail.modify`. So this step is manual: when a new client is added, the CRM surfaces the exact filter text to paste into Gmail's own filter settings once. Small one-time friction per new client, in exchange for staying at true $0.
- **Forwarding confirmation (the step this section previously skipped):** Gmail requires a forwarding address to be *confirmed* before mail actually forwards to it — this is a Google-side security requirement, not optional, and sits underneath the filter step above. The concrete flow: the CRM shows the freelancer both the filter text *and* the dedicated forwarding address (e.g. `client-{contact_id}@inbound.yourapp.com`); the freelancer adds that address under Gmail's "Add a forwarding address" setting (a separate step from the filter itself); Gmail emails a confirmation code to that address; the inbound parser (Mailgun/Postmark) has a dedicated handler that recognizes Google's confirmation email format and surfaces the code back to the freelancer to paste into Gmail, completing confirmation. `gmail_filter_setup.forwarding_confirmed` (Section 18) tracks this state so the UI can show "pending confirmation" rather than silently assuming the forward is live.
- **Filter chain limits.** Gmail's OR-chain filters have a practical length ceiling. Once a freelancer passes roughly 15–20 client email addresses in one filter, the CRM auto-generates a second numbered filter block (`gmail_filter_setup.filter_group`) and surfaces both separately, rather than silently failing once the freelancer's client list grows past the point anyone tested at.
- **Threading caveat, stated honestly:** forwarded mail frequently loses or rewrites the original `In-Reply-To`/`References` headers, which can break reply-threading on the client's side of the conversation. Worth testing against real Gmail forwarding before treating this as the final architecture rather than a documented trade-off.
- Once a forwarded copy arrives (post-confirmation), the CRM has the **full email content** (not just a log entry) and shows a reply box on the client's page — replying sends via `gmail.send`, landing in the client's inbox as a normal email.
- **Inbound spoofing guard:** because the inbound parsing address is effectively a public secret, the handler verifies SPF/DKIM pass on the *original forwarded message* (not just "Mailgun/Postmark accepted it") before writing to `messages` — otherwise anyone who learns or guesses a contact's forwarding address could inject fake messages directly, bypassing Gmail's forward entirely.

This fully removes the one identified recurring dollar cost in the entire spec, with the one honest trade-off being manual filter setup — and its confirmation step — per client, in exchange for staying at true $0. **This per-client setup step recurs for every new client added, for the life of the account** — it is not a one-time onboarding cost, and Section 4's onboarding-time framing states this plainly rather than implying it disappears after the first client.

**WhatsApp stays $0** as long as freelancer-initiated template messages outside the 24-hour customer-service window are avoided — route anything like a deadline nudge through push notifications instead. Note that Meta delivers *every* incoming message to the connected number regardless of sender — there's no way to filter at Meta's end. The CRM receives all of them and then checks the sender's number against the contact list: matched numbers route to that client's page with an alert, unmatched numbers land in a general inbox tab. Replying works from both — matched contacts get a reply box on their page, and the general inbox supports replying too (useful when an unmatched number turns out to be a real lead).

**Honest caveat, not a workaround:** hosting free tiers (Convex/Vercel/Cloudflare) are $0 until usage outgrows them — that threshold is real, not a trick to route around, but it's generous enough to cover solo-dev scale for a long time. Every other component in this spec (Documenso, React Flow, GitHub App, Google Docs/Sheets/Slides/Calendar/Meet, Resend/Brevo, web push) is free with no asterisk at this scale.

---

## 18. Data model / schema

Every design decision below traces back to something established earlier in this doc — the notes in parentheses point back to the relevant section. Written in Postgres-style FK notation for readability; in Convex this maps to tables with `v.id("tableName")` fields and indexes rather than literal foreign key constraints. All monetary fields are integers in minor units (cents/kobo), per the money-handling rule at the top of this doc.

### `users`
The freelancer's own account — there's only ever one per account, since this is a single-operator tool by design (Section 7). `github_installation_id` replaces a flat access token because the GitHub App issues short-lived installation tokens generated on demand from this ID, not one long-lived token (Section 9a). `google_refresh_token_encrypted` is application-layer encrypted before write and only ever decrypted inside a server-side action, never in a client-facing query (Section 20.9). `timezone` (IANA format, e.g. `Africa/Lagos`) drives render-time conversion of every UTC timestamp shown on the freelancer's own dashboard (Section 20.8). `theme_preference` backs dark mode (Section 22.8). `ai_triage_enabled` gates LLM-based message classification (Section 6). Auth itself is handled by Convex Auth (Section 20.1), so no password hash lives on this table.
`id, name, email, google_refresh_token_encrypted, github_installation_id, whatsapp_business_number, timezone, theme_preference (system/light/dark, default: system), ai_triage_enabled (boolean, default: true), created_at`

### `sessions`
Backs "sign out everywhere" (Section 20.13) — a real security action for a tool holding Gmail refresh tokens and financial data, distinct from whatever session record Convex Auth manages internally.
`id, user_id (FK), created_at, last_active_at, user_agent, revoked_at (nullable)`

### `api_keys`
Backs the free-from-day-one API access promised in Section 4 with an actual auth mechanism instead of leaving it unspecified. Keys are scoped per user, hashed at rest (never stored plaintext), and rate-limited the same way public endpoints are (Section 21.10).
`id, user_id (FK), key_hash, label, last_used_at, created_at, revoked_at (nullable)`

### `contacts`
The client. Status covers the active/closed split from Section 13's table view. `timezone` (IANA format) gives Section 14's communication-preferences field a concrete type instead of free text, and drives client-facing date rendering (Section 20.8). `name` and `company` carry a Convex search index for the keyword search described in Section 20.5.
`id, user_id (FK), name, company, status (lead/active/closed), source (referral/cold outreach/platform), tags[], timezone, created_at`

### `contact_emails`
Split into its own table rather than a single field on `contacts` — required because a client using a second email address needs to still match (Section 9's edge case).
`id, contact_id (FK), email, is_primary`

### `contact_phones`
Same reasoning as `contact_emails`, for WhatsApp number matching.
`id, contact_id (FK), phone_number, is_primary`

### `projects`
The unit a repo, invoice, and deadline all attach to. A contact can have more than one project over time. Repos import onto a project, not the contact directly (Section 9a).
`id, contact_id (FK), name, status (active/closed), deadline, description, created_at`

### `repos` and `project_repos`
Two tables, not one, because the repo-to-project relationship is many-to-many (Section 9 — an agency monorepo can belong to more than one client, and one client can have several repos). `github_repo_id` is GitHub's stable numeric ID — matching must not rely on `full_name` alone since `owner/repo` can be renamed (Section 9a).
`repos: id, user_id (FK), github_repo_id, full_name (owner/repo), connection_status (connected/disconnected), connected_at`
`project_repos: id, project_id (FK), repo_id (FK)`

`connection_status` flips to `disconnected` on an `installation: deleted`/`suspend` webhook (Section 20.3) rather than deleting the row — existing `repo_activity` and any invoice line items generated from it must survive a disconnect since they're already-issued financial records. The same `disconnected` pattern applies to a **partial permission downgrade** — an org admin narrowing the installation from "All repositories" to "Only select repositories" and removing a repo already linked to a project (Section 20.3) — triggered by GitHub's `installation_repositories` webhook event, not just full uninstall/suspend.

The import picker queries `project_repos` for existing links on a selected repo and flags them inline rather than filtering them out — a repo can intentionally belong to more than one project (Section 9a's decided behavior, and the billing decision in Section 9), so this is a UI-level warning, not a constraint enforced at the schema level.

### `repo_activity`
Raw GitHub events pulled for a linked repo, delivered via the GitHub App's installation-scoped webhooks (Section 9a), written once per `project_repo` link (Section 9's shared-repo billing decision — a repo linked to two projects produces two rows for the same event, not one). `billable` defaults conditionally at write time, not to a flat constant: `true` when the underlying repo has exactly one active `project_repos` link, `false` when it has more than one (Section 9) — the freelancer opts a row *in* to billing for the ambiguous multi-client case, rather than having to remember to opt one *out*. Either way it's a flag the freelancer can toggle, which is what makes non-billable activity (Section 9) editable/removable before it reaches an invoice.
`id, project_repo_id (FK), type (pr_merged/issue_closed/deploy), title, url, occurred_at, billable (boolean, default: conditional — see Section 9)`

### `invoices` and `invoice_line_items`
`status` is derived from `amount_paid` rather than a single manually-set field, so partial payments and refunds are representable rather than forced into a binary paid/unpaid: `draft`/`sent`/`viewed` are set directly; `paid` when `amount_paid >= total`; `partially_paid` when `0 < amount_paid < total`; `overdue` when `due_at` has passed and `amount_paid < total`; `void` is a manual freelancer action blocked once `amount_paid > 0` (a partially-paid invoice gets refunded, not voided); `refunded` when `amount_refunded > 0`. `amount_paid` and `amount_refunded` are incremented by verified payment-provider webhooks (Section 21.4), never set directly by a manual status toggle. `subtotal` + `tax_amount` = `total`; `tax_rate`/`tax_amount` are freelancer-set fields (Section 6), never calculated by the product. `invoice_number` (e.g. `INV-2026-0001`) is generated via an atomic per-user counter at issue time — a read-max-then-increment pattern is explicitly rejected here since two near-simultaneous invoice creations (two tabs, a retried request) would otherwise collide on the same number (Section 21.5). Line items generated from `repo_activity` are suggestions, not commitments — `included` defaults true but stays editable, matching Section 9's requirement that generated line items must never auto-confirm.
`invoices: id, project_id (FK), invoice_number, status (draft/sent/viewed/paid/partially_paid/overdue/void/refunded), currency, subtotal, tax_rate (nullable), tax_amount (nullable), total, amount_paid (default 0), amount_refunded (default 0), issued_at, due_at, paid_at (nullable), voided_at (nullable), refunded_at (nullable)`
`invoice_line_items: id, invoice_id (FK), description, amount, source (manual/github_activity), source_activity_id (FK, nullable), included (boolean, default true)`

### `messages`
One table for both channels rather than separate email/WhatsApp tables, since they play the same role on the timeline. `contact_id` is nullable specifically to support the general-inbox case from Section 10 — an unmatched WhatsApp number or an unrecognized email has no contact yet.
`id, contact_id (FK, nullable), channel (email/whatsapp), direction (inbound/outbound), from_address, body, occurred_at`

### `documents`
Covers proposals, contracts, and generated docs (Section 15). `provider_ref` holds the Google Doc ID or the Documenso envelope ID depending on `type`.
`id, contact_id (FK), project_id (FK, nullable), type (proposal/contract/invoice_pdf/other), provider (google_docs/documenso/pdf), provider_ref, status (draft/sent/viewed/signed), created_at`

### `notes`
Rich-text, attachable to either a contact or a specific project.
`id, contact_id (FK), project_id (FK, nullable), body, created_at`

### `calendar_events`
Synced from Google Calendar, matched to a contact the same way messages are (Section 3/6).
`id, contact_id (FK, nullable), google_event_id, title, start_time, end_time, meet_link`

### `follow_up_reminders`
Backs the nudge feature from Section 3 — the highest-leverage feature for a solo operator.
`id, contact_id (FK), due_at, reason, status (pending/done/dismissed)`

### `timeline_events`
The unified feed shown on the client detail page (Section 14). Rather than the UI querying five separate tables and merging them at render time, this table gets a row written whenever a message, note, invoice status change, calendar event, or repo activity happens — one ordered scroll per contact, source-agnostic. **Write-path enforcement (locked):** every mutation that touches `messages`, `notes`, `invoices`, `calendar_events`, or `repo_activity` must call a single shared `writeTimelineEvent()` helper in the same transaction — no mutation writes to its source table without also writing here. Convex can't enforce this at the schema level, so it's enforced by code convention: one shared function, never duplicated inline, checked in review.
`id, contact_id (FK), project_id (FK, nullable), type (email/whatsapp/note/call/invoice/repo_activity/document), source_table, source_id, occurred_at`

### `gmail_filter_setup`
Tracks whether each contact's email has actually been added to the freelancer's filter, and whether the forwarding address itself has completed Google's confirmation step (Section 17) — otherwise messages silently stop auto-logging for anyone missed during setup or stuck pre-confirmation. `filter_group` supports the multi-filter case once a freelancer's client list exceeds one filter's practical OR-chain length.
`id, contact_email, added_to_filter (boolean, default false), forwarding_confirmed (boolean, default false), filter_group (integer, default 1)`

### `custom_field_definitions` and `custom_field_values`
Backs the "no schema lock-in" requirement from Sections 3/4 with an actual mechanism instead of an untyped blob (Section 20.4). Definitions are managed by the freelancer from settings; values are looked up per entity at render time.
`custom_field_definitions: id, user_id (FK), entity_type (contact/project), label, field_type (text/number/date/select), created_at`
`custom_field_values: id, definition_id (FK), entity_type (contact/project), entity_id, field_value`

### `processed_webhook_events`
Makes GitHub, WhatsApp, and payment provider webhook handling idempotent (Sections 20.11, 21.4) — all three providers retry delivery on any non-2xx response, and without a dedupe check this can double-write `repo_activity`, `messages`, or invoice-paid updates. A uniqueness check on `(provider, external_id)` before any write is the guard, applied only after the provider's signature header has been verified (Section 20.11) — idempotency and authenticity are two separate checks, both required.
`id, provider (github/whatsapp/stripe/paystack), external_id, processed_at`

### `audit_log`
Tracks destructive and financial actions specifically — invoice status changes, contact merges, account deletion, integration disconnects — not routine reads or minor edits (Section 21.8). **Retention exception (locked):** on account deletion (Section 21.7), `audit_log` rows for that account are *not* hard-deleted along with everything else — they persist as an orphaned record referencing entities that no longer exist. This exception is stated explicitly in the privacy policy (Section 20.10) rather than left implicit, since it's a deliberate carve-out from the "we delete everything" promise.
`id, user_id (FK), action, entity_type, entity_id, metadata, occurred_at`

### `rate_limits`
Backs abuse prevention on public-facing endpoints — magic-link requests, webhook receivers, signup, API key usage — by tracking attempts per key (IP, email, or API key) within a rolling window, checked before the action runs (Section 21.10).
`id, key (IP, email, or api_key_id), action_type, window_start, attempt_count`

---

## 19. Folk's apps/extensions/integrations — what's worth adapting

### What Folk actually offers
- **folkX Chrome extension** (their strongest feature) — one-click capture from LinkedIn, Sales Navigator, X, Instagram, TikTok, Gmail (open a thread, click, pulls sender info), and Google Meet (pulls all meeting participants). Also surfaces saved message templates directly inside Gmail/LinkedIn with variable auto-fill.
- **Native integrations** — Gmail, Outlook, Google Calendar, WhatsApp Business, auto-logging to the contact timeline (already covered in Sections 3, 6, 10 of this doc).
- **Zapier/Make ("5,000+ integrations")** — marketed heavily, but independent reviews note the actual connector is thin: no trigger functionality, minimal custom field support, no real dev API behind it as of 2026.
- **Mobile apps (iOS/Android)** — on-the-go lead capture and follow-ups.
- **API access** — gated behind the paid Premium tier.
- **Magic Fields (enrichment)** — waterfall enrichment across six paid data providers, rate-limited even on paid plans.
- **Four AI assistants** — Follow-up, Recap, Research, Workflow.

### What to build, and why

| Folk feature | Our version | Reasoning |
|---|---|---|
| folkX Chrome extension | Build it — free to build, just calls our own API | Scope to LinkedIn, X, Gmail, Google Meet, **and GitHub profiles** — the last one is a capture source no competitor offers, reinforcing the moat from Section 1 |
| Zapier/Make app | Skip the official app; expose generic incoming/outgoing webhooks instead | Folk's own connector shows the trap: building and certifying a Zapier app is real ongoing maintenance for uncertain payoff. Generic webhooks let users wire into Zapier's free "Webhooks" action themselves — same outcome, none of the burden |
| Native iOS/Android apps | PWA (installable web app) instead | Apple's Developer Program costs $99/year (recurring), Google Play $25 one-time — a PWA using the same web push from Section 12 avoids both entirely, consistent with the $0 architecture |
| API access | Free from day one, authenticated via scoped `api_keys` (Section 18) | Folk gates this behind Premium; no reason to copy that here |
| Magic Fields (enrichment) | Skip entirely | Folk's audience does cold outbound and needs to enrich scraped lead lists; a solo dev's clients have almost always already made contact, so there's little to enrich — this isn't a gap, it's a non-need |
| AI assistants (Recap) | Build a "summarize this relationship" action using a free-tier LLM, gated by `ai_triage_enabled`-equivalent consent | Same free-tier approach as the WhatsApp triage in Section 10 — genuinely useful, near-$0, same disclosure obligation as Section 6 |
| AI assistants (Research) | Skip | Same reasoning as enrichment above — solves a cold-prospecting problem this product doesn't have |

---

## 20. Gaps closed

The sections above cover the product's core loops in detail, but a pass over the full doc surfaced a set of foundational pieces that were either assumed silently or never addressed. Each is resolved below, in the same reasoning style as the rest of this spec, with the resulting schema changes rolled into Section 18.

### 20.1 Freelancer authentication
No signup/login flow was specified anywhere — every integration in Sections 3/6/9a/17 assumes an authenticated `users` row already exists. **Decision: Convex Auth**, not a third-party provider (Clerk, Auth0). It's free, has no per-user pricing to track against the $0 architecture in Section 16, and avoids introducing a second identity system alongside Convex's own data layer. Email/password plus optional "Sign in with Google" (which also conveniently primes the OAuth consent screen the Google integration in Section 3 needs anyway) covers this without added cost. **Stated honestly:** Convex Auth is newer and less battle-tested than Clerk/Auth0 — worth accepting that maturity trade-off consciously rather than assuming parity, and worth a fast rollback plan (Convex Auth's data model is simple enough that migrating to Clerk later, if needed, is a bounded project, not a rewrite).

### 20.2 GitHub historical backfill
Section 9a only ever covers *live* events arriving after a repo is imported. If a freelancer connects a repo mid-relationship, the timeline would otherwise start blank. **Decision:** on import, run a one-time backfill via the REST API — pull merged PRs and closed issues from the project's `created_at` date (or a 90-day cap, whichever is shorter, to keep the initial call cheap and bounded) — and write them straight to `repo_activity` with `billable: true` as the default, same as any live event. Webhooks take over from that point forward. This is a one-time API call per import, not a recurring cost. When several repos are imported together, backfills are queued with a small concurrency cap rather than fired simultaneously (Section 9a), so a large import doesn't starve webhook processing on the same installation's shared rate limit.

### 20.3 GitHub App uninstall / revocation / permission downgrade
Not previously handled: if the freelancer, or an org admin, uninstalls the App from GitHub's side, `repos`/`project_repos` rows are orphaned silently with no signal to the product. **Decision:** GitHub sends an `installation` webhook event (`action: deleted` or `suspend`) when this happens, and an `installation_repositories` webhook event when access is narrowed without a full uninstall (e.g. "All repositories" → "Only select repositories," dropping a repo already linked to a project). Both handlers set the affected state — `users.github_installation_id` to null on full removal, or just the specific `repos` row on a partial downgrade — to `connection_status: disconnected` rather than deleting anything — historical `repo_activity` and past invoice line items must stay intact even after disconnection, since they're already-issued financial records. The UI surfaces disconnected repos with a clear "reconnect" prompt rather than failing silently on the next import attempt.

### 20.4 Custom fields — implementation, not just requirement
Sections 3 and 4 require "no schema lock-in" custom fields, but Convex tables have a defined schema, so this needed an actual mechanism, not just a stated requirement. **Decision:** a dedicated `custom_field_values` table (id, `entity_type` [contact/project], `entity_id`, `field_key`, `field_value`) paired with a `custom_field_definitions` table (id, `entity_type`, `label`, `field_type` [text/number/date/select]) the freelancer manages from settings. This keeps the field definitions queryable and typed, rather than an untyped JSON blob on `contacts`/`projects` that's hard to validate or index against later.

### 20.5 Search
Not addressed anywhere — once a freelancer has more than a handful of clients, finding a contact, invoice, or timeline entry by keyword becomes necessary, not optional. **Decision:** Convex's built-in search indexes (full-text search over a table, no external service) on `contacts.name`, `contacts.company`, and `notes.body` covers the common case for free. A cross-entity "search everything" bar can be added later by fanning a query out across a small number of indexed tables — not worth building on day one, but the indexes themselves should exist from the start since retrofitting search onto existing tables later is more work than defining the index up front.

### 20.6 Duplicate contact handling & merge
The one-click capture flow (Section 19's folkX-equivalent extension) pulls a contact from LinkedIn, Gmail, or GitHub independently — nothing stops the same person being captured twice from two different sources. **Decision:** on capture, check the incoming email/phone against existing `contact_emails`/`contact_phones` rows before creating a new `contacts` row. A match surfaces a "this looks like an existing contact — merge or create new?" prompt rather than silently creating a duplicate or silently merging (silent merging risks combining two actually-different people who happen to share a proxy email, e.g. a shared company inbox).

**Merge mechanics (locked, since this touches money and shouldn't be left implicit):** the older contact (by `created_at`) survives as contact A; every FK referencing contact B (`projects`, `messages`, `documents`, `notes`, `calendar_events`, `follow_up_reminders`, `custom_field_values`, `timeline_events`) is re-pointed to contact A. `contact_emails`/`contact_phones` rows from both survive and are combined — that's precisely what those tables exist for (Section 9's edge case). `tags[]` are unioned. For single-value fields that can genuinely conflict (`timezone`, `company`), the merge UI shows both values and requires the freelancer to pick one per field rather than silently defaulting to contact A's value. The merge itself is logged to `audit_log` with both original contact IDs preserved in `metadata`, so the action is traceable even though contact B's row no longer exists.

### 20.7 Client portal authentication
Section 3 specifies an optional client-facing portal but never states how a client — who has no account in the system — gets into it. **Decision:** passwordless magic links, not a password-based account for clients. The freelancer shares a portal link tied to that contact's record; opening it emails a time-limited (e.g. 15-minute) sign-in link to the client's on-file email address before granting access. **The link is single-use, invalidated immediately on first successful use, not just time-expired** — without that, a link sitting in an old email thread remains a standing access risk for its full expiry window rather than a genuine one-time key. No password to manage or leak, and it reuses the transactional email service already in the stack (Section 15's Resend/Brevo) rather than adding a new auth system just for clients.

### 20.8 Timezone handling
Section 14 captures a client's timezone as a display note, but the schema fields that actually drive behavior — `projects.deadline`, `invoices.due_at`, `follow_up_reminders.due_at` — never specified what timezone they're stored or computed in. **Decision:** all timestamps are stored in UTC across every table, full stop. `users` gets a `timezone` field (freelancer's own, IANA format e.g. `Africa/Lagos`) and `contacts` gets one too (from Section 14's communication-preferences field, now given a concrete type instead of free text). Every date shown in the UI converts from UTC to the relevant party's timezone at render time — the freelancer's for their own dashboard, the client's for portal-facing dates. This avoids the class of bug where a deadline silently shifts by a day depending on which timezone the server happens to run in.

### 20.9 Token security at rest
`google_refresh_token` in Section 18 sits as a plain schema field with no handling specified, and this data — refresh tokens for Gmail and Calendar access, tied to real client communications — deserves more than an afterthought given Section 6's own point that this handles regulated, sensitive data. **Decision:** refresh tokens are only ever read inside Convex actions (server-side, never exposed to a client query or the browser), and encrypted at the application layer before being written — using a symmetric key held in Convex's environment variables, not in the database — rather than relying solely on Convex's own storage-level encryption. This means even a database-level leak doesn't hand over usable tokens directly.

### 20.10 Legal basics for the hosted version
Nowhere in the doc is there a ToS, privacy policy, or data-processing disclosure — necessary the moment a hosted instance (Section 5's "realistic middle ground") is live and public, separate from and in addition to the CASA discussion in Section 6, which covers Google's requirements but not the freelancer's/product's own legal obligations to end users. **Decision:** a plain-language privacy policy and ToS, written once, covering what's actually stored (Section 18's tables), what third parties see data (Google, GitHub, Meta, Stripe/Paystack, Documenso, Resend/Brevo, **and Groq/Gemini as LLM subprocessors when `ai_triage_enabled` is on**, per Section 6), the `audit_log` retention exception on account deletion (Section 18), and data retention/deletion on account close. **NDPR:** since this product targets the Nigerian market first, a lightweight check of NITDA's NDPR registration thresholds is a required part of this same pass, not a separate future task — distinct from and in addition to any GDPR-flavored language, since NDPR has its own registration/compliance requirements once processing Nigerian users' personal data at meaningful scale. This is a documentation and light legal-research task, not an engineering one, and should exist before the hosted instance accepts its first real user, not after.

### 20.11 Webhook reliability
Section 9a's GitHub webhook handler, Section 10's WhatsApp handler, and Section 21.4's payment handler all implicitly assumed each event arrives exactly once *and* that every payload is authentic — two separate problems, both required. In reality, GitHub, Meta, and Stripe/Paystack all retry webhook delivery on any non-2xx response, which can double-write a `repo_activity` row, a `messages` row, or an invoice-paid update if the handler doesn't account for it; separately, an unverified endpoint accepts forged payloads from anyone who finds the URL. **Decision:** every inbound webhook handler, for all three providers, first verifies the provider's signature header (`X-Hub-Signature-256` for both GitHub and WhatsApp/Meta, the provider-specific signing secret for Stripe/Paystack) before touching the database at all — a rejected signature is dropped, not processed. Only after signature verification does the handler check the event against its provider's own delivery ID (`X-GitHub-Delivery` for GitHub, `message.id` for WhatsApp, the charge/session ID for payments) — a small `processed_webhook_events` table (id, `provider`, `external_id`, `processed_at`) with a uniqueness check on `(provider, external_id)` makes this idempotent at almost no cost, and prevents a slow webhook handler (which triggers a retry) from silently duplicating timeline entries or invoice-relevant activity.

### 20.12 API authentication
Section 4/19 promise free API access from day one but never specified how a third party actually authenticates to it. **Decision:** scoped per-user API keys (`api_keys` table, Section 18), generated from settings, hashed at rest, never displayed again after creation (only the hash is stored, matching standard practice). Each key is subject to the same rate-limiting infrastructure as public endpoints (Section 21.10), tracked per `api_key_id` rather than per IP for authenticated requests.

### 20.13 Session security
Not previously addressed: no mechanism to end an active session if a device is lost, shared, or compromised — a real scenario for a tool holding Gmail refresh tokens and invoice data, in a context (a freelancer's laptop, sometimes used at a client site) where this isn't hypothetical. **Decision:** a `sessions` table (Section 18) with a "sign out everywhere" action in settings that revokes every session except the current one. Two-factor authentication is a real, valuable addition but is explicitly sequenced as a fast-follow post-launch item (Section 7a) rather than a blocker, to keep the initial security work scoped and shippable.

### 20.14 LLM triage cost and abuse ceiling
Sections 10/19 introduce free-tier LLM calls for WhatsApp/email triage and the Recap assistant, but nothing previously capped usage *per user* — a single freelancer connecting a high-volume WhatsApp number could exhaust shared free-tier limits (Groq/Gemini) on behalf of every other user, or become a real cost if the product ever needs to upgrade past free tiers. **Decision:** a per-user daily cap on LLM-based triage/classification calls, tracked the same way as other rate limits (`rate_limits` table, Section 18, keyed by `user_id` + `action_type: llm_triage`). Once exceeded for the day, triage falls back to rule-based-only classification (already built as the first-pass filter per Section 10) rather than failing or silently stopping.

---

## 21. Production-grade gaps — second pass

Section 20 closed structural gaps in the product itself. This pass is different: it's everything that separates "the features work in a demo" from "a solo freelancer can trust this with real client money and real client data, indefinitely, without a team behind it." Every item below gets a $0 path where one genuinely exists, and an honest flag where it doesn't — same standard as Section 17.

### 21.1 Testing strategy
Nothing in the spec specifies how correctness gets verified before something ships, and for a tool that touches invoicing and client communication, an untested bug is a trust-breaking one, not a cosmetic one. **Decision:** Vitest for unit/integration tests (covers Convex functions directly, free, no paid tier), Playwright for end-to-end flows (free, open source) — run against a Convex dev deployment, not production. Priority order for coverage, given limited solo-dev time: invoice generation/line-item/payment-state math first (real money, real errors are expensive — this now includes the partial-payment/refund/void state machine from Section 18, not just simple paid/unpaid), webhook signature verification and idempotency second (Section 20.11), auth/data-isolation third (Section 21.9), everything else after. Not full coverage on day one — but these are non-negotiable before real users touch real client data.

### 21.2 CI/CD
Not addressed anywhere — deploys were implicitly assumed to just happen. **Decision:** GitHub Actions, free (2,000 minutes/month on private repos, unlimited on public — and Section 5's open-source-by-default direction means this project likely qualifies for the unlimited public tier anyway). Pipeline: lint + Vitest on every PR, Playwright smoke tests on merge to main, auto-deploy to Convex + Vercel/Cloudflare Pages on a tagged release rather than every commit, so a bad merge doesn't immediately hit production.

### 21.3 Error monitoring & observability
No mechanism specified for finding out something broke before a client tells the freelancer it broke. **Decision:** GlitchTip — an open-source, self-hostable, Sentry-API-compatible error tracker — rather than Sentry's own hosted free tier, which caps at a low monthly event volume and pushes toward a paid plan quickly. GlitchTip self-hosted (e.g. on the same free-tier infra as everything else, or a $0 Fly.io/Render free instance) keeps this at true $0 regardless of error volume, and the client SDK is a drop-in since it speaks the same protocol as Sentry's.

### 21.4 Payment confirmation flow & reconciliation
Section 3 says invoices track payment state, but nothing specifies *how* an invoice actually gets updated, or what happens if the update never arrives. **Decision, two parts:**

1. **Webhook listener** for `checkout.session.completed` (Stripe) / the equivalent Paystack event, signature-verified against the provider's signing secret *before* any processing (Section 20.11), then checked for idempotency via `processed_webhook_events`. On a verified, new event, the handler increments `invoices.amount_paid` (not a boolean flip), which lets the derived-status logic in Section 18 land on `paid` or `partially_paid` correctly. Free — standard webhook usage on both platforms' free/pay-as-you-go tiers, no subscription needed.
2. **Daily reconciliation job (Convex scheduled function)** — webhook delivery isn't guaranteed indefinitely; if the endpoint is down when a provider fires its webhook, both Stripe and Paystack retry for a limited window and then stop. A daily job queries `invoices` where `status in (sent, overdue)` and `updated_at` is stale, calls each provider's list-sessions/list-charges API for the corresponding payment link reference, and applies any completed payment found but not yet reflected locally — through the exact same idempotent write path as the webhook handler (keyed on the charge/session ID via `processed_webhook_events`), so there's no separate code path to keep in sync. Reconciliation-triggered updates are logged to `audit_log` distinctly from webhook-triggered ones, so a high reconciliation rate is itself a signal the webhook endpoint has an uptime problem worth investigating. This is the single highest-consequence addition in this doc given the "real client money" bar — worth building before launch, not after the first missed payment is reported by a client.

### 21.5 Invoice numbering
Section 18's `invoices` table has a sequential `invoice_number` (e.g. `INV-2026-0001`), generated per-user rather than globally so numbering doesn't reveal total platform-wide invoice volume, and each freelancer's sequence starts clean. **Generation is an atomic increment inside the same mutation that creates the invoice** — explicitly not a read-max-then-increment pattern, since two near-simultaneous invoice creations (two open tabs, a retried request after a timeout) would otherwise collide on the same number. Convex's transactional mutation guarantees make this a small, contained fix rather than requiring external locking.

### 21.6 Currency handling — no conversion, by design
Multi-currency was a stated requirement (Section 4), but "multi-currency" and "currency conversion" are different problems, and only the first is actually needed here. **Decision:** each invoice stores its own currency and amount (in minor units, per the money-handling rule) as entered — no live exchange-rate conversion anywhere in the core flow, since a freelancer invoicing in USD and EUR doesn't need those numbers converted into one number to be useful, and a conversion introduces a moving target (today's rate vs. the rate on the invoice date) that creates more confusion than it resolves. For the reporting view in Section 3 ("money in/out"), group and total *by currency* rather than force a single blended total. If a blended estimate is ever wanted later, the Frankfurter API (free, ECB-based, no key required) is the $0 option — but it's explicitly not part of the core build.

### 21.7 Account deletion & data erasure
Section 20.10 specifies a privacy policy needs to state a retention/deletion policy — this closes the gap of what deletion actually *does*. **Decision:** an account-close action that cascades a hard delete across every table scoped to that `user_id` (contacts, projects, invoices, messages, tokens, sessions, api_keys, everything in Section 18), with two exceptions: (1) already-issued invoice records tied to a still-active client relationship should prompt "export first?" before deletion, since destroying financial records a client may still need is a worse outcome than a slightly manual export step, and (2) `audit_log` rows for the account persist as an orphaned record rather than being deleted (Section 18) — both exceptions are stated explicitly in the privacy policy (Section 20.10), not left as a silent gap between policy and behavior. This is a Convex mutation, not a manual/support-ticket process — free to build, and necessary for GDPR/NDPR-style erasure requests to be honored in practice, not just promised in a policy document.

### 21.8 Audit log
Not previously addressed: for a tool holding financial records and sensitive tokens, "who changed this invoice and when" matters, especially since Section 20.6's contact-merge tool and Section 21.7's deletion flow are both destructive-by-nature actions. **Decision:** a lightweight `audit_log` table (id, `user_id`, `action`, `entity_type`, `entity_id`, `metadata`, `occurred_at`) written to on financial and destructive actions specifically (invoice status changes, contact merges, account deletion, disconnecting an integration, reconciliation-triggered payment updates per Section 21.4) — not every read or minor edit, which would bloat storage for little value. Free — it's just another Convex table, no external service.

### 21.9 Multi-tenant data isolation
Relevant specifically because of Section 5's hosted-instance option: once more than one freelancer's data lives in the same Convex deployment, every query and mutation must be scoped to the authenticated `user_id`, with no code path that can return another user's rows. **Decision:** this isn't a nice-to-have, it's the actual security boundary of the hosted product, and it belongs in Section 21.1's non-negotiable test coverage — every query/mutation gets an isolation test asserting user A can never read or write user B's data, run in CI on every PR, not just checked by eye during review.

### 21.10 Rate limiting & abuse prevention
Public-facing endpoints — the magic-link portal login (Section 20.7), webhook receivers, the signup flow (Section 20.1), and the API (Section 20.12) — have no abuse protection specified, and all are realistic targets (login-link spam against a client's inbox, webhook flooding, fake signups, API key abuse). **Decision:** Convex's own rate-limiting patterns (a `rate_limits` table tracking attempts per IP/email/API-key within a time window, checked before the action runs) cost nothing extra to add — no external service needed for this scale. This is worth building alongside the features themselves, not bolted on after an incident.

### 21.11 Email deliverability
Section 15/17's transactional email (Resend/Brevo) and Gmail-send flow both depend on the sending domain actually being trusted by receiving mail servers — without correct SPF, DKIM, and DMARC DNS records, client-facing emails land in spam, silently breaking the product's core trust loop. **Decision:** this is a one-time DNS configuration step, not a recurring cost — Resend and Brevo both walk through the exact records to add for free on their free tiers. Worth documenting as a required setup step for anyone self-hosting (Section 5), since a misconfigured domain is a silent failure mode that looks like "the CRM isn't working" when it's actually a DNS issue.

### 21.12 WhatsApp Business & Meta verification
Section 10/16/17 cover WhatsApp's cost model in depth but not the *process* of getting a number production-ready. **Decision, stated honestly:** Meta's own business verification (submitting the freelancer's business details to Meta) is free, but it is a manual review process that can take days and occasionally requires business documentation — this is a real setup-time cost, not a dollar cost, and worth surfacing to the freelancer as an expectation during onboarding ("WhatsApp connection may take a few days to approve") rather than presenting it as instant like the GitHub/Google connections.

### 21.13 Browser extension distribution — one honest exception
Section 19's folkX-equivalent Chrome extension has one real, unavoidable cost: the **Chrome Web Store developer registration fee is a one-time $5**, not recurring, but it is not $0. **The $0 alternative:** publish to the Firefox Add-ons store instead (free, no registration fee) as the primary distribution channel, and offer the Chrome version as a manually-loadable unpacked extension (a downloadable zip with load instructions) for Chrome users, skipping the Store entirely. This keeps the whole build at true $0, at the cost of a slightly rougher install experience for Chrome users specifically — worth stating plainly rather than quietly absorbing a $5 charge into "the free build."

### 21.14 Domain name — the other honest exception
A professional product benefits from its own domain, but domain registration is a genuine recurring cost (roughly $10–15/year) with no real $0 equivalent if a custom domain is wanted. **The $0 alternative:** ship on the free subdomain your host provides (`yourapp.vercel.app` or `yourapp.pages.dev`) — fully functional, zero cost, and consistent with everything else in this build. A custom domain is a reasonable single exception to the $0 rule if the freelancer/operator chooses to pay for one later, but it is not required for the product to work, and the doc should be honest that it's the one place "free" means "free unless you want a nicer URL."

### 21.15 Free-tier ceilings, stated plainly
Section 16/17 already flag that hosting free tiers aren't infinite — this extends the same honesty to every other free-tier dependency introduced in this pass: GitHub Actions (2,000 min/month private), Convex (function calls/storage/bandwidth caps), GlitchTip if self-hosted on a free compute tier, Resend/Brevo's email-send caps, and the LLM free tiers now explicitly capped per-user (Section 20.14). None of these are workarounds-with-a-catch; they're generous enough to cover true solo-dev, early-stage usage — but the doc should keep stating this plainly rather than letting "free" quietly start meaning "free until it silently isn't."

### 21.16 Backups & disaster recovery
Not previously addressed: for a tool holding financial records, "the database provider handles it" isn't a documented answer on its own. **Decision:** confirm and state explicitly what Convex's own backup/point-in-time-recovery guarantees actually are before launch, rather than assuming. In addition — not instead of — a weekly scheduled Convex function exports `invoices`, `invoice_line_items`, and `contacts` (the records with real financial/legal weight, not the full dataset) to cold storage (Cloudflare R2's free tier is the $0 option), giving a recovery path independent of the primary provider. This directly backs Section 4's data-ownership promise with an actual mechanism rather than leaving export as something that only happens if the freelancer remembers to click it.

---

## 22. Design system — locked

Visual and interaction identity for the product, decided with the same "resolve it now, not later" standard as every architectural decision above. Two parts: the token system (22.1–22.7) and the production-standard UX behaviors that make the visual system actually usable (22.8–22.18).

### 22.1 Color
Warm-neutral monochrome base, one reserved accent, muted status colors — kept deliberately separate in hue so none compete with each other.

| Token | Value | Role |
|---|---|---|
| `canvas-light` | `#FAFAF8` | Base surface, light mode |
| `canvas-dark` | `#17161B` | Base surface, dark mode |
| `ink-900` → `ink-100` | warm gray scale, `#1C1B20` → `#F1F0ED` | Text, borders, flat surfaces — carries the majority of the UI |
| `beacon` | `#1E1E1E` (near-black) | The one accent — primary actions, focus rings, links, and the signature nudge motif (22.6) |
| `status-paid` | `#6E8B6E` (muted sage) | Desaturated deliberately — information, not alarm |
| `status-overdue` | `#B2604A` (muted rust) | |
| `status-pending` | `#B08948` (muted gold) | |
| `status-void` | `#8A8880` (muted stone) | Deliberately the flattest status color — a voided invoice is inert, not urgent |

`beacon` is reserved exclusively for things that need the freelancer's attention or action — never used decoratively — so the accent stays meaningful.

### 22.2 Typography
Three faces, each with one job, never interchanged:
- **Inter** — UI, body, labels, navigation. Carries the majority of the interface and stays neutral.
- **Geist Mono** — all numerals: money, dates, invoice numbers, commit hashes. Tabular figures anywhere precision matters, the same instinct behind Apple Wallet's number treatment.
- **Instrument Sans** — headlines, empty-state copy, onboarding only. Never in dense UI.

### 22.3 Iconography
Custom-drawn, one fixed spec so 60+ unrelated icons still read as one hand: 24×24 grid, 1.5px stroke, rounded caps/joins, outline as the default style with filled reserved only for active/selected states. Every icon carries an `aria-label` (Section 22.9) since none are semantic alone.

### 22.4 Glass
Reserved for exactly three surfaces — top nav/status bar, modals/overlays, mobile bottom sheets — never on table rows, list cards, or any data-dense content, which stay flat with a hairline border instead. **Hard rule: text never sits directly on a glass surface** — any text inside a glass panel gets a solid inner card, keeping blur purely atmospheric rather than load-bearing for legibility (ties directly to the contrast requirement in 22.9).

### 22.5 Corners & motion
Corners: 8px controls, 14px cards, 20px modals/sheets. Motion: three durations (120ms micro-interaction, 240ms standard transition, 400ms panel/sheet transition), one easing curve throughout (`cubic-bezier(0.32, 0.72, 0, 1)`, the iOS sheet curve), and `prefers-reduced-motion` respected from day one, not retrofitted.

### 22.6 Signature element — the Beacon
A single reused visual device: a small glass-morphic glowing ring in `beacon` black with a soft pulse, appearing next to anything needing action — an overdue follow-up, an unopened proposal, an overdue invoice, a new message in the general inbox. Same shape, color, and animation everywhere it appears. This directly visualizes the product's own thesis (Section 3's follow-up nudge, the single highest-leverage feature) rather than existing as decoration, and doubles as the basis for the app icon (22.15).

### 22.7 Reference layout — client detail page
```
┌──────────┬─────────────────────────────────────┐
│          │  ← Acme Co.          ⚬ beacon (health)│
│  Side    │  ─────────────────────────────────── │
│  nav     │  Timeline │ Repos │ Docs │ Financials │
│  (glass) │  ─────────────────────────────────── │
│          │                                       │
│  Clients │   ● PR merged        2h ago           │
│  Invoices│   ● Invoice sent     yesterday         │
│  Inbox   │   ● Note added       3d ago            │
│          │   ...flat rows, no glass, hairline    │
│          │   borders, generous vertical rhythm   │
└──────────┴─────────────────────────────────────┘
```
Sidebar and top status bar are the only glass surfaces on this screen; the timeline itself stays flat and legible so dense content never competes with its own container for attention.

### 22.8 Dark mode
Both light and dark are supported, not just designed for. Default follows system preference (`prefers-color-scheme`) on first load, with a manual override stored per user. `users` gets a `theme_preference` field (`system/light/dark`, Section 18 schema addition below). Implemented as CSS custom properties swapped at the root — no extra dependency, $0.

### 22.9 Accessibility
WCAG AA minimum across the product: 4.5:1 contrast for body text, 3:1 for large text/icons. Every interactive element gets a 2px `beacon`-colored focus-visible ring, keyboard navigation follows logical DOM order (sidebar → tabs → content), and the glass-text rule from 22.4 exists specifically to keep this floor from being silently broken by the glass aesthetic.

### 22.10 Responsive breakpoints
Three: `640px` (mobile), `1024px` (tablet), `1024px+` (desktop). Below 1024px, the sidebar collapses into a bottom tab bar (Home/Clients/Invoices/Inbox) rather than a separate mobile nav pattern, consistent with the PWA direction in Section 19. Financial figures stay in Geist Mono regardless of viewport width — precision is never sacrificed for space.

### 22.11 Forms & validation
Input states: default → focus (`beacon` ring) → error (rust-toned border + inline message below the field, never a toast) → disabled (reduced opacity, no interaction). Validation runs on blur, not per keystroke. Required fields marked with a subtle dot rather than a red asterisk, keeping the monochrome discipline intact even in error states.

### 22.12 Toasts & inline notifications
Toasts confirm one-off actions ("Invoice sent," "Contact merged"), `beacon`-accented, bottom-right on desktop / bottom-center on mobile, with an Undo action wherever the operation is reversible (contact merge, delete — reinforcing Section 21.7's deletion-safety pattern). Ongoing state (invoice overdue, integration disconnected) is never a toast — it lives as a persistent inline indicator on the relevant record, since a toast disappears and the underlying problem doesn't.

### 22.13 Loading-state hierarchy
Three tiers, each with a distinct job — not interchangeable:
- **Skeleton screens** for anything data-shaped (tables, timeline, contact list) — gray pulse blocks matching the eventual layout.
- **Inline spinners** for button-level actions (Send Invoice, Save), small and `beacon`-colored, inside the button itself.
- **Custom SVG loaders** reserved for full-page/first-load moments only (initial app load, a slow GitHub backfill per Section 20.2) — where the illustration work actually earns attention instead of being diluted across every minor fetch.

### 22.14 Data table interactions
Column headers sort on click (three-state: asc/desc/none), a filter bar above the table for status/tags, infinite scroll instead of numbered pagination — matches Section 4's "fast, keyboard-friendly" requirement, and Convex's reactive queries make incremental loading close to free to build.

### 22.15 Error/failure states
Deliberately distinct from empty states. Empty state = custom SVG + a concrete next action (nothing's wrong yet, nothing exists). Error state = flat and quiet — icon, plain-language explanation, retry action, no illustration — so it doesn't visually compete with genuinely bad news. A disconnected GitHub integration (Section 20.3) uses this pattern, with "Reconnect" as the primary action.

### 22.16 Microcopy voice
Buttons name the exact action ("Send invoice," never "Submit"); confirmations echo the button's own word ("Invoice sent," never "Success!"); empty states name the next concrete step; errors state what happened and what to do next, never "Oops!" or exclamation points. A quiet voice matching the monochrome visual system — the product doesn't perform friendliness, it stays clear.

### 22.17 App icon & favicon
The Beacon motif (22.6) reduced to a mark: a simple ring in `beacon` black on the canvas color, with light/dark variants for OS-level icon theming. One motif carried from in-product UI down to the home-screen icon, rather than a separately designed logo.

### 22.18 Invoice print/PDF styling
The in-app invoice view keeps the full design system. The client-facing generated PDF (Section 15) uses a **completely separate, print-specific stylesheet**: white background, black text, no glass, no dark mode, Geist Mono for all figures, and minimal branding — the freelancer's own name/logo only, never the CRM's, per Section 4's no-branding-tax rule. A polished in-app UI and a printable invoice have different jobs, and conflating them risks a PDF that looks broken outside a browser.

---

## 23. HCI & interaction standards — sitewide, locked

Section 22 locks the visual language (color, type, motion, contrast). This section locks the *behavioral* discipline underneath it — the difference between a UI that looks production-grade and one that actually holds up once a freelancer is trusting it with real client money and real client relationships. These are sitewide rules, not per-feature suggestions: every new screen or flow built against this spec follows them by default, not by individual judgment call.

### 23.1 Error prevention over error handling
The product's default posture is to make mistakes hard to make, not just recoverable after the fact. Concretely: every destructive or hard-to-reverse action — contact merge (Section 20.6), account deletion (Section 21.7), voiding an invoice, disconnecting an integration, deleting a custom field definition that has live values — requires an explicit confirmation step that names what's about to happen in plain language ("This will merge Jane Doe into Acme Co. — their timelines and invoices will combine.), never a bare "Are you sure?". Actions that are genuinely irreversible (hard delete on account close) get a second, harder confirmation (typing the account/contact name) than actions that are merely inconvenient to undo.

### 23.2 Visibility of system status
No action that takes longer than ~300ms happens silently. Every async operation — sending an invoice, importing a repo, running a GitHub backfill, waiting on a Gmail forwarding confirmation, a WhatsApp message send — has a visible, specific state at every stage: pending → in progress → success or a named failure, using the three-tier loading hierarchy already locked in Section 22.13. A failure state always says what happened and what to do next (Section 22.16's microcopy voice), never fails silently into a state indistinguishable from "still loading." This applies with particular force to the manual, multi-step flows already flagged as fragile elsewhere in this doc — Gmail forwarding confirmation (Section 17) and WhatsApp business verification (Section 21.12) both need explicit, persistent status indicators (not just a toast that disappears), since both can sit in a pending state for hours or days.

### 23.3 Undo as the default, confirmation as the fallback
Where an action is genuinely reversible, the product prefers "do it, then offer Undo" (Section 22.12's toast pattern) over "confirm, then do it" — undo is faster for the common case (the freelancer didn't make a mistake) and just as safe for the rare one. Where an action is *not* reversible or only partially reversible (Section 21.7's account-deletion export prompt is the model here), the product falls back to upfront confirmation instead, per 23.1. The two patterns are chosen deliberately per action, not mixed arbitrarily — a merge offers Undo; a hard account deletion does not.

### 23.4 Consistency of interaction patterns
One pattern per action type, reused everywhere it appears, so the freelancer's learned behavior in one part of the product transfers to every other part. Concretely: every "connect an external account" flow (GitHub, Google, WhatsApp) follows the same shape (a settings-page entry point → external provider's own hosted consent screen → redirect back with a visible connected/pending/failed state) rather than each integration inventing its own layout. Every destructive-action confirmation uses the same modal structure. Every list view (contacts, invoices, repos) shares the same sort/filter/search affordances (Section 22.14) rather than each screen re-deriving its own table behavior.

### 23.5 Recognition over recall
The product surfaces context rather than requiring the freelancer to remember it. The "already linked to Acme Co." flag (Section 9a) and the invoice-time "also linked to [other client]" flag (Section 9) are both instances of this principle applied to the one place it matters most (billing) — the same instinct extends sitewide: a contact's relationship-health indicator (Section 14) is visible on the list view, not just the detail page; a disconnected integration (Section 20.3) shows its reconnect prompt on every screen where that integration's absence would otherwise silently break something, not only in settings.

### 23.6 Progressive disclosure
Primary flows (viewing a client, sending an invoice, replying to a message) stay uncluttered by advanced functionality. Custom field management, API key generation, webhook configuration, and integration-scope details live in settings, one level removed from daily-use screens — available and fully functional, per Section 4's no-artificial-limits philosophy, but not competing for attention with the tasks a freelancer does every day.

### 23.7 Forgiving input, especially in manual/external-dependency flows
The two flows in this spec that depend on the freelancer correctly performing a manual step outside the product — pasting a Gmail filter and confirming a forwarding address (Section 17), and Meta's WhatsApp business verification (Section 21.12) — are exactly where input needs to be most forgiving, since they're also the most likely places a freelancer makes a copy-paste error or loses track of an in-progress step. Concretely: filter/forwarding text is presented as a single copy-button block, not something to retype; the CRM re-checks confirmation status automatically (polling or on next page load) rather than requiring the freelancer to manually mark a step done; and any of these multi-step external flows can be resumed from wherever they were left off, not restarted from scratch if the freelancer navigates away mid-setup.

### 23.8 Touch target sizing & mobile ergonomics
Below the 1024px breakpoint (Section 22.10), every interactive element — bottom tab bar items, buttons, form inputs, table row tap targets — meets a minimum 44×44px touch target (Fitts's-law baseline for reliable thumb interaction), even where the visual element itself is smaller (e.g. a small icon button gets padding to reach the minimum tappable area, not a resized icon). This is a floor, not a target to hit exactly — generous spacing is preferred over minimum-compliant spacing anywhere financial actions (send invoice, mark paid) are involved, since a mis-tap on a money action is a worse outcome than a mis-tap on, say, a filter toggle.

### 23.9 Cognitive load in financial actions specifically
Given this product's core trust surface is money and client relationships, financial actions get the most conservative interaction treatment in the app: no single tap or click sends money-related communication (an invoice, a payment reminder) without the confirm-first pattern from 23.1, regardless of how minor the action might otherwise seem under 23.3's undo-by-default preference. The trade-off is deliberate — slightly more friction on the specific class of action where a mistake has real-world consequences outside the app, in exchange for speed everywhere else.

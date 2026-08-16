import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * Signal schema — Section 18 of crm-spec.md, mapped to Convex.
 *
 * Conventions applied (flagged at the Phase 0 stop gate):
 * - Table/field names are camelCase (Convex standard) for the PRD's snake_case names.
 * - `id` is implicit on every Convex table; FKs are `v.id("tableName")` fields.
 * - Money fields are v.int64() in minor units (cents/kobo) — never float.
 *   Fields: invoices.subtotal/tax_amount/total/amount_paid/amount_refunded,
 *   invoice_line_items.amount.
 * - schema-level defaults used where the PRD states a fixed default (amountPaid 0,
 *   aiTriageEnabled true, tags [], included true, gmailFilterSetup booleans).
 *   Conditional defaults (repo_activity.billable) are set at write time, per §9.
 * - Union status fields are required and always supplied by the writing mutation
 *   (Convex has no schema default for unions).
 * - New fields stay optional unless the PRD says otherwise (§ schema-migrations rule).
 */
export default defineSchema({
  // Convex Auth's own tables (authAccounts, authSessions, authVerificationCodes,
  // authRefreshTokens, authVerifiers, authRateLimits). §20.1.
  ...authTables,

  /**
   * The freelancer's account — one per install (§7). Managed by Convex Auth
   * (name/email/image/emailVerificationTime are written by its default
   * createOrUpdateUser); Signal-specific fields below.
   */
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    // Standard Convex Auth user fields kept optional so any provider's writes
    // fit the schema (we replace authTables' users wholesale with our own).
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // §20.9 — encrypted at the application layer, decrypted only in actions.
    googleRefreshTokenEncrypted: v.optional(v.string()),
    // Phase 4 — OAuth CSRF state for the gmail.send connect flow; cleared after
    // the callback verifies it. Never read by the client.
    gmailOauthState: v.optional(v.string()),
    // §9a — GitHub App installation id; replaces a flat token.
    githubInstallationId: v.optional(v.number()),
    whatsappBusinessNumber: v.optional(v.string()),
    // §20.8 — IANA format, e.g. "Africa/Lagos".
    // Optional: Convex Auth inserts the user BEFORE our afterUserCreatedOrUpdated
    // callback patches in these defaults (timezone UTC, themePreference system,
    // aiTriageEnabled true, createdAt). Read-side code treats undefined as the
    // PRD default. Consistent with the schema-migrations rule (optional fields).
    timezone: v.optional(v.string()),
    // §22.8 — dark mode override.
    themePreference: v.optional(v.union(v.literal("system"), v.literal("light"), v.literal("dark"))),
    // §6 — gates LLM-based message triage; callback sets true on create.
    aiTriageEnabled: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
  }).index("email", ["email"]),

  /**
   * Backs "sign out everywhere" (§20.13) — distinct from Convex Auth's internal
   * session records. Populated on every sign-in (convex/sessions.ts).
   */
  sessions: defineTable({
    userId: v.id("users"),
    createdAt: v.number(),
    lastActiveAt: v.number(),
    userAgent: v.optional(v.string()),
    // DEVICE-ID EXTENSION (flagged at Phase 0 gate): lets lastActiveAt track the
    // same browser across page loads without one row per load. Optional/nullable
    // per the schema-migrations rule; needed so §20.13 sign-out-everywhere has
    // a meaningful "this device" unit.
    deviceId: v.optional(v.string()),
    // §20.13 audit fix: the REAL Convex Auth session this device row tracks, so
    // revokeSession/signOutEverywhere can invalidate actual auth sessions instead
    // of a decorative table. Optional per the migrations rule.
    authSessionId: v.optional(v.id("authSessions")),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_device", ["userId", "deviceId"]),

  /**
   * Scoped API keys, hashed at rest (§18, §20.12). Built in Phase 5.
   */
  apiKeys: defineTable({
    userId: v.id("users"),
    keyHash: v.string(),
    label: v.string(),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  /**
   * The client. Status covers the §13 table-view split; timezone drives
   * client-facing date rendering (§20.8). name/company carry §20.5 search indexes.
   */
  contacts: defineTable({
    userId: v.id("users"),
    name: v.string(),
    company: v.optional(v.string()),
    status: v.union(v.literal("lead"), v.literal("active"), v.literal("closed")),
    source: v.optional(v.union(v.literal("referral"), v.literal("cold_outreach"), v.literal("platform"))),
    tags: v.array(v.string()),
    timezone: v.optional(v.string()),
    createdAt: v.number(),
    // NOTE (Phase 0): tags/status/createdAt have no schema default in this
    // Convex version — the Phase 1 create mutation supplies tags: [] etc.
    // explicitly.
  })
    .index("by_user", ["userId"])
    .searchIndex("search_name", { searchField: "name" })
    .searchIndex("search_company", { searchField: "company" }),

  /**
   * Multi-email support — a client's second address must still match (§9 edge case).
   */
  contactEmails: defineTable({
    contactId: v.id("contacts"),
    email: v.string(),
    isPrimary: v.boolean(),
  })
    .index("by_contact", ["contactId"])
    .index("by_email", ["email"]),

  /** WhatsApp number matching (§10). */
  contactPhones: defineTable({
    contactId: v.id("contacts"),
    phoneNumber: v.string(),
    isPrimary: v.boolean(),
  })
    .index("by_contact", ["contactId"])
    .index("by_phone", ["phoneNumber"]),

  /** The unit a repo, invoice, and deadline attach to. A contact can have several. */
  projects: defineTable({
    contactId: v.id("contacts"),
    name: v.string(),
    status: v.union(v.literal("active"), v.literal("closed")),
    deadline: v.optional(v.number()),
    description: v.optional(v.string()),
    createdAt: v.number(),
    // §12 — set by the daily push cron so each approaching deadline pings once.
    deadlineNotifiedAt: v.optional(v.number()),
  }).index("by_contact", ["contactId"]),

  /**
   * Many-to-many with projects (§9 — a monorepo can serve several clients).
   * githubRepoId is GitHub's stable numeric id — matching never relies on fullName
   * alone since owner/repo can be renamed (§9a).
   */
  repos: defineTable({
    userId: v.id("users"),
    githubRepoId: v.number(),
    fullName: v.string(),
    connectionStatus: v.union(v.literal("connected"), v.literal("disconnected")),
    connectedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    // NOTE (flagged at Phase 0 gate): this Convex version has no schema-level
    // unique constraints — uniqueness on githubRepoId is enforced by the import
    // mutation's lookup-first (match on github_repo_id, §9a), never by inserting
    // blind.
    .index("by_github_repo_id", ["githubRepoId"]),

  /** Link table for repos ↔ projects. */
  projectRepos: defineTable({
    projectId: v.id("projects"),
    repoId: v.id("repos"),
  })
    .index("by_project", ["projectId"])
    .index("by_repo", ["repoId"]),

  /**
   * Raw GitHub events, written once per project_repo link (§9 shared-repo billing).
   * billable defaults CONDITIONALLY at write time (§9): true for a single active
   * link, false for multi-link. No flat schema default.
   */
  repoActivity: defineTable({
    projectRepoId: v.id("projectRepos"),
    type: v.union(v.literal("pr_merged"), v.literal("issue_closed"), v.literal("deploy")),
    title: v.string(),
    url: v.string(),
    occurredAt: v.number(),
    billable: v.boolean(),
  }).index("by_project_repo", ["projectRepoId"]),

  /**
   * status is DERIVED from amount_paid except draft/sent/viewed/void (§18).
   * amount_paid/amount_refunded are only ever incremented by verified payment
   * webhooks (§21.4), never set by a status toggle. subtotal + tax_amount = total;
   * tax_rate/tax_amount are freelancer-entered, never calculated (§6).
   * invoice_number is an atomic per-user increment at issue time (§21.5).
   */
  invoices: defineTable({
    projectId: v.id("projects"),
    invoiceNumber: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("viewed"),
      v.literal("paid"),
      v.literal("partially_paid"),
      v.literal("overdue"),
      v.literal("void"),
      v.literal("refunded"),
    ),
    currency: v.string(),
    subtotal: v.int64(),
    taxRate: v.optional(v.number()),
    taxAmount: v.optional(v.int64()),
    total: v.int64(),
    amountPaid: v.int64(),
    amountRefunded: v.int64(),
    // §21.4 — payment provider for the payment link (stripe/paystack), set
    // when a link is generated; the reconciliation job uses it to pick the
    // provider's list API.
    provider: v.optional(v.union(v.literal("stripe"), v.literal("paystack"))),
    // Payment-link reference for reconciliation lookups (provider's link id).
    paymentLinkRef: v.optional(v.string()),
    // NOTE (Phase 0): amountPaid/amountRefunded default 0 per §18 — applied by
    // the Phase 3 create mutation (0n), since this Convex version has no schema
    // defaults. status/currency/subtotal/total likewise always supplied there.
    issuedAt: v.optional(v.number()),
    dueAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    voidedAt: v.optional(v.number()),
    refundedAt: v.optional(v.number()),
    // §12 — set by the daily push cron so each overdue transition pings once
    // (re-pings if the due date is pushed out past the previous ping).
    overdueNotifiedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_invoice_number", ["invoiceNumber"]),

  /**
   * §21.5 atomic per-user invoice numbering — one row per user holding the last
   * issued sequence number. Concurrent creations serialize on this row inside
   * the create mutation (read + increment + write in one transaction), so two
   * tabs or a retried request can never collide on the same invoice number.
   */
  invoiceCounters: defineTable({
    userId: v.id("users"),
    year: v.number(),
    seq: v.number(),
  })
    .index("by_user_year", ["userId", "year"]),

  /**
   * Line items from repo_activity are suggestions — included defaults true but
   * stays editable; never auto-confirmed into a sent invoice (§9).
   */
  invoiceLineItems: defineTable({
    invoiceId: v.id("invoices"),
    description: v.string(),
    amount: v.int64(),
    source: v.union(v.literal("manual"), v.literal("github_activity")),
    sourceActivityId: v.optional(v.id("repoActivity")),
    included: v.boolean(),
    // NOTE (Phase 0): included defaults true per §9 — applied by the Phase 3
    // line-item creation mutation.
  }).index("by_invoice", ["invoiceId"]),

  /**
   * One table for email + WhatsApp — same role on the timeline. contactId is
   * nullable for the general-inbox case (§10).
   */
  messages: defineTable({
    contactId: v.optional(v.id("contacts")),
    // §10 cross-tenant fix (audit 2026-08-15): owner of the message. Matched
    // messages take their contact's userId; unmatched general-inbox rows are
    // attributed to the user whose address/number received them, so the inbox
    // query can scope by owner instead of returning every tenant's rows.
    userId: v.optional(v.id("users")),
    channel: v.union(v.literal("email"), v.literal("whatsapp")),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    fromAddress: v.string(),
    body: v.string(),
    occurredAt: v.number(),
    // ADDITIVE (Phase 4, flagged): §20.14 triage verdict (rule-based or LLM),
    // used by the Phase 5 inbox to badge/sort. Optional so Phase 1-3 rows fit.
    classification: v.optional(v.union(v.literal("spam"), v.literal("important"), v.literal("ambiguous"))),
  }).index("by_contact", ["contactId"]).index("by_user", ["userId"]),

  /** Proposals/contracts/generated docs (§15). provider_ref holds the Doc ID or envelope id. */
  documents: defineTable({
    contactId: v.id("contacts"),
    projectId: v.optional(v.id("projects")),
    type: v.union(v.literal("proposal"), v.literal("contract"), v.literal("invoice_pdf"), v.literal("other")),
    provider: v.union(v.literal("google_docs"), v.literal("documenso"), v.literal("pdf")),
    providerRef: v.string(),
    status: v.union(v.literal("draft"), v.literal("sent"), v.literal("viewed"), v.literal("signed")),
    createdAt: v.number(),
  }).index("by_contact", ["contactId"]),

  /** Rich-text notes, attachable to a contact or a specific project. §20.5 search index on body. */
  notes: defineTable({
    contactId: v.id("contacts"),
    projectId: v.optional(v.id("projects")),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_contact", ["contactId"])
    .index("by_project", ["projectId"])
    .searchIndex("search_body", { searchField: "body" }),

  /** Synced from Google Calendar (§3/6); matched to a contact like messages. */
  calendarEvents: defineTable({
    contactId: v.optional(v.id("contacts")),
    googleEventId: v.string(),
    title: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    meetLink: v.optional(v.string()),
  })
    .index("by_contact", ["contactId"])
    .index("by_google_event", ["googleEventId"]),

  /** The §3 nudge feature — the single highest-leverage feature for a solo operator. */
  followUpReminders: defineTable({
    contactId: v.id("contacts"),
    dueAt: v.number(),
    reason: v.string(),
    status: v.union(v.literal("pending"), v.literal("done"), v.literal("dismissed")),
  })
    .index("by_contact", ["contactId"])
    .index("by_status", ["status"]),

  /**
   * The unified per-contact feed (§14). WRITE-PATH ENFORCEMENT (locked): every
   * mutation touching messages/notes/invoices/calendar_events/repo_activity must
   * call the shared writeTimelineEvent() helper in the same transaction — one
   * shared function, never duplicated inline. Enforced by code convention (§18).
   */
  timelineEvents: defineTable({
    contactId: v.id("contacts"),
    projectId: v.optional(v.id("projects")),
    type: v.union(
      v.literal("email"),
      v.literal("whatsapp"),
      v.literal("note"),
      v.literal("call"),
      v.literal("invoice"),
      v.literal("repo_activity"),
      v.literal("document"),
    ),
    sourceTable: v.string(),
    sourceId: v.string(),
    occurredAt: v.number(),
  }).index("by_contact", ["contactId"]),

  /** Per-contact Gmail filter/forwarding tracking (§17). filter_group supports multi-filter chains. */
  gmailFilterSetup: defineTable({
    contactEmail: v.string(),
    // §17 defaults (false/false/1) are applied by the Phase 4 setup mutation —
    // this Convex version has no schema defaults.
    addedToFilter: v.boolean(),
    forwardingConfirmed: v.boolean(),
    filterGroup: v.number(),
    // ADDITIVE (Phase 4): Google's confirmation code, surfaced once in the UI
    // so the freelancer can paste it into Gmail to complete §17 confirmation.
    lastConfirmationCode: v.optional(v.string()),
  }).index("by_contact_email", ["contactEmail"]),

  /** "No schema lock-in" custom fields (§20.4). */
  customFieldDefinitions: defineTable({
    userId: v.id("users"),
    entityType: v.union(v.literal("contact"), v.literal("project")),
    label: v.string(),
    fieldType: v.union(v.literal("text"), v.literal("number"), v.literal("date"), v.literal("select")),
    // ADDITIVE (Phase fix): select-type fields need a fixed option set — the
    // freelancer defines them at field-creation time, the value editor renders
    // a real dropdown. Optional → older text fields stay valid.
    options: v.optional(v.array(v.string())),
    createdAt: v.number(),
  }).index("by_user_entity", ["userId", "entityType"]),

  customFieldValues: defineTable({
    definitionId: v.id("customFieldDefinitions"),
    entityType: v.union(v.literal("contact"), v.literal("project")),
    entityId: v.string(),
    fieldValue: v.string(),
  })
    .index("by_definition", ["definitionId"])
    .index("by_entity", ["entityId"]),

  /**
   * §20.2 backfill queue — merged PRs/closed-issue backfills are queued with a
   * concurrency cap of 2 (not fired simultaneously) so a large import doesn't
   * starve webhook processing on the shared 5,000 req/hr ceiling. Pumped by a
   * scheduled action (backfillQueue.ts). Additive, not a deviation — the PRD
   * mandates the queue; this table is the mechanism.
   */
  backfillJobs: defineTable({
    projectRepoId: v.id("projectRepos"),
    githubRepoId: v.number(),
    fullName: v.string(),
    since: v.number(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("done"), v.literal("failed")),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_project_repo", ["projectRepoId"]),

  /**
   * Webhook idempotency (§20.11, §21.4) — uniqueness on (provider, external_id)
   * checked only AFTER signature verification. Authenticity and idempotency are
   * two separate checks, both required.
   */
  processedWebhookEvents: defineTable({
    // mailgun/postmark added in Phase 4 — inbound email forwarding (§17); the
    // same idempotency discipline as every other webhook receiver.
    provider: v.union(
      v.literal("github"),
      v.literal("whatsapp"),
      v.literal("stripe"),
      v.literal("paystack"),
      v.literal("mailgun"),
      v.literal("postmark")
    ),
    externalId: v.string(),
    processedAt: v.number(),
  })
    // NOTE (flagged at Phase 0 gate): this Convex version has no schema-level
    // unique constraints. The (provider, external_id) idempotency check is a
    // lookup-before-insert inside the shared webhook-processing write path,
    // exactly as §20.11/§21.4 describe it (check AFTER signature verification).
    .index("by_provider_external", ["provider", "externalId"]),

  /**
   * Destructive/financial actions only (§21.8). On account deletion this table is
   * NOT hard-deleted (§18 retention exception) — stated explicitly in the privacy
   * policy (§20.10).
   */
  auditLog: defineTable({
    // Optional (Phase 4, flagged): §17 spoofing-guard rejections are logged
    // BEFORE routing, so they have no attributable user. Authenticated actions
    // always set it. Additive relaxation — never removes data.
    userId: v.optional(v.id("users")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    metadata: v.any(),
    occurredAt: v.number(),
  }).index("by_user", ["userId"]),

  /**
   * §20.7 client portal magic links. Additive (not in §18 — the mechanism the
   * PRD mandates). Tokens are 15-min, SINGLE-USE: usedAt set on first
   * successful redemption, so a leaked link in an old email is dead immediately.
   * Stored hashed (SHA-256), never plaintext.
   */
  portalTokens: defineTable({
    contactId: v.id("contacts"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_hash", ["tokenHash"]),

  /**
   * §12 web push — per-user VAPID subscriptions. Additive (the mechanism for
   * the §12 event types: new message, deadline, invoice overdue/paid, nudge).
   */
  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  /** Abuse prevention on public endpoints (§21.10) — attempts per key in a rolling window. */
  rateLimits: defineTable({
    key: v.string(),
    actionType: v.string(),
    windowStart: v.number(),
    attemptCount: v.number(),
  }).index("by_key_action_window", ["key", "actionType", "windowStart"]),

  /**
   * §23.3 undo — one row per reversible destructive contact action (delete or
   * merge), holding the serialized pre-action subtree snapshot so Undo can
   * restore it. Rows are consumed by the undo mutation, and expired past the
   * 24h window (the UI offers Undo only via the toast, which dismisses in ~5s,
   * so the row is a belt-and-suspenders fallback, not the primary path).
   * Schema additive; snapshot is a JSON string because it crosses many tables.
   */
  contactUndo: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("delete"), v.literal("merge")),
    /** Contact name for the UI toast label. */
    label: v.string(),
    snapshot: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});

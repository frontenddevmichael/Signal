/**
 * §17 inbound write path. recordInbound is the ONLY writer of inbound email
 * messages — it inserts into `messages` and calls the shared writeTimelineEvent
 * helper in the same transaction (write-path rule, locked in Phase 1).
 *
 * The idempotency mutation follows the same (provider, external_id) discipline
 * as GitHub/Stripe — checked only AFTER signature verification.
 */
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { writeTimelineEvent } from "./timeline";
import { classifyMessage, LLM_TRIAGE_DAILY_CAP, llmTriageConfigured, triageWindowStart } from "./triage";

export const markProcessed = internalMutation({
  args: {
    provider: v.union(v.literal("mailgun"), v.literal("postmark")),
    externalId: v.string(),
    checkOnly: v.boolean(),
  },
  handler: async (ctx, { provider, externalId, checkOnly }) => {
    const existing = await ctx.db
      .query("processedWebhookEvents")
      .withIndex("by_provider_external", (q) =>
        q.eq("provider", provider).eq("externalId", externalId)
      )
      .first();
    if (existing) return { processed: true };
    if (!checkOnly) {
      await ctx.db.insert("processedWebhookEvents", {
        provider,
        externalId,
        processedAt: Date.now(),
      });
    }
    return { processed: false };
  },
});

/**
 * §17 forwarding confirmation. Google's confirmation email arrived at the
 * contact's inbound address; store the code + flip forwardingConfirmed so the
 * UI can show "pending confirmation — code: XXXXXX" (§23.2) until the
 * freelancer pastes it into Gmail.
 */
export const markForwardingConfirmed = internalMutation({
  args: { contactId: v.string(), code: v.optional(v.string()) },
  handler: async (ctx, { contactId, code }) => {
    let contact: any;
    try {
      contact = await ctx.db.get(contactId as GenericId<"contacts">);
    } catch {
      return; // guessed/garbage forwarding address → benign ack, nothing to confirm
    }
    if (!contact) return;
    const emails = await ctx.db
      .query("contactEmails")
      .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
      .collect();
    const addresses = new Set(emails.map((e) => e.email.toLowerCase()));
    const rows = await ctx.db.query("gmailFilterSetup").collect();
    for (const row of rows.filter((r) => addresses.has(r.contactEmail.toLowerCase()))) {
      await ctx.db.patch(row._id, {
        forwardingConfirmed: true,
        ...(code ? { lastConfirmationCode: code } : {}),
      });
    }
  },
});

/** §17 spoofing guard — rejected messages are logged (audit trail), never written. */
export const logRejected = internalMutation({
  args: { reason: v.string(), from: v.string(), subject: v.string() },
  handler: async (ctx, { reason, from, subject }) => {
    // No userId — the rejection happens before routing (that's the point).
    await ctx.db.insert("auditLog", {
      action: "inbound_email.rejected_spoofing_guard",
      entityType: "message",
      entityId: "",
      metadata: { reason, from, subject },
      occurredAt: Date.now(),
    });
  },
});

/** The one write path for inbound email (§17). Returns the created message. */
export async function recordInboundLogic(
  ctx: MutationCtx,
  args: {
    contactId: string;
    from: string;
    subject: string;
    body: string;
    externalId: string;
    provider: "mailgun" | "postmark";
  },
) {
    let contact: any;
    try {
      contact = await ctx.db.get(args.contactId as GenericId<"contacts">);
    } catch {
      // Guessed forwarding address with a non-ID — ack benignly, nothing to write.
      return { written: false, reason: "invalid_contact_id" };
    }
    if (!contact) {
      // Unknown contact id (deleted between routing and write) — drop with ack.
      return { written: false, reason: "contact_not_found" };
    }
    const now = Date.now();

    // §6/§20.14 — classify before write. Rule-based always; the LLM is only
    // consulted for the ambiguous remainder when the flag is on, the provider
    // is configured, and today's cap has room (cap consumed in THIS transaction).
    const user = (await ctx.db.get(contact.userId as GenericId<"users">)) as
      | { _id: string; aiTriageEnabled?: boolean }
      | null;
    let classification: "spam" | "important" | "ambiguous" | undefined;
    let canUseLlm = false;
    if (user) {
      const windowStart = triageWindowStart(now);
      const capRow = await ctx.db
        .query("rateLimits")
        .withIndex("by_key_action_window", (q) =>
          q.eq("key", `user:${user._id}`).eq("actionType", "llm_triage").eq("windowStart", windowStart)
        )
        .first();
      canUseLlm =
        user.aiTriageEnabled !== false &&
        llmTriageConfigured() &&
        (capRow?.attemptCount ?? 0) < LLM_TRIAGE_DAILY_CAP;
    }
    const { verdict, usedLlm } = await classifyMessage({
      from: args.from,
      subject: args.subject,
      body: args.body,
      aiTriageEnabled: user?.aiTriageEnabled !== false,
      canUseLlm,
    });
    classification = verdict;
    if (usedLlm && user) {
      // The LLM actually ran — consume one slot of today's cap (§20.14).
      const windowStart = triageWindowStart(now);
      const capRow = await ctx.db
        .query("rateLimits")
        .withIndex("by_key_action_window", (q) =>
          q.eq("key", `user:${user._id}`).eq("actionType", "llm_triage").eq("windowStart", windowStart)
        )
        .first();
      if (capRow) await ctx.db.patch(capRow._id, { attemptCount: capRow.attemptCount + 1 });
      else
        await ctx.db.insert("rateLimits", {
          key: `user:${user._id}`,
          actionType: "llm_triage",
          windowStart,
          attemptCount: 1,
        });
    }

    const messageId = await ctx.db.insert("messages", {
      contactId: contact._id,
      userId: contact.userId as GenericId<"users">,
      channel: "email",
      direction: "inbound",
      fromAddress: args.from,
      body: args.body,
      occurredAt: now,
      ...(classification ? { classification } : {}),
    });
    await writeTimelineEvent(ctx, {
      contactId: contact._id,
      type: "email",
      sourceTable: "messages",
      sourceId: messageId,
      occurredAt: now,
    });
    // §12 "Client reached out" — fire AFTER the transaction commits. Webhooks
    // have no session, so this is the userId-targeted internal action; spam is
    // never pinged.
    if (
      classification !== "spam" &&
      contact.userId &&
      typeof (ctx as any).scheduler?.runAfter === "function"
    ) {
      await (ctx as any).scheduler.runAfter(0, internal.push.notifyUser, {
        userId: contact.userId,
        title: "New email from client",
        body: `${contact.name}: ${args.subject || args.body.slice(0, 80)}`,
      });
    }
    await ctx.db.insert("processedWebhookEvents", {
      provider: args.provider,
      externalId: args.externalId,
      processedAt: now,
    });
    return { written: true, messageId, classification };
}

export const recordInbound = internalMutation({
  args: {
    contactId: v.string(),
    from: v.string(),
    subject: v.string(),
    body: v.string(),
    externalId: v.string(),
    provider: v.union(v.literal("mailgun"), v.literal("postmark")),
  },
  handler: async (ctx, args) => {
    return await recordInboundLogic(ctx, args);
  },
});

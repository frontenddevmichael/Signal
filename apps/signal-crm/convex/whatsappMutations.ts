/**
 * §10 WhatsApp write path — the ONLY writer of WhatsApp messages. Matches the
 * inbound number against contact_phones (phonesMatch); matched → contact's
 * timeline, unmatched → general inbox (contactId null, §10). Reuses the §20.14
 * triage gating exactly like email. Signature verification happens in the
 * webhook handler BEFORE anything here runs.
 */
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { writeTimelineEvent } from "./timeline";
import { phonesMatch } from "./whatsappLogic";
import { classifyMessage, LLM_TRIAGE_DAILY_CAP, llmTriageConfigured } from "./triage";

/** §10 general inbox — unmatched inbound messages (no contact linked yet). */
export const inbox = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("messages").collect();
    return rows
      .filter((r) => r.contactId === undefined && r.direction === "inbound")
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .map((r) => ({
        _id: r._id,
        channel: r.channel,
        fromAddress: r.fromAddress,
        body: r.body,
        occurredAt: r.occurredAt,
        classification: r.classification ?? null,
      }));
  },
});

/**
 * §10/§21.12 — integration card status: whether the Meta credentials exist.
 * Mirrors the GitHub/Gmail `status` queries so the settings card renders the
 * same honest "waiting for credentials" shape the other integrations use.
 */
export const status = query({
  args: {},
  handler: async () => {
    const configured = Boolean(
      process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN,
    );
    return {
      configured,
      connected: false,
      note: configured
        ? "Credentials set — the /whatsapp/webhook endpoint is live."
        : "Needs the Meta App credentials (app secret + verify token).",
    };
  },
});

export const markProcessed = mutation({
  args: { externalId: v.string(), checkOnly: v.boolean() },
  handler: async (ctx, { externalId, checkOnly }) => {
    const existing = await ctx.db
      .query("processedWebhookEvents")
      .withIndex("by_provider_external", (q) =>
        q.eq("provider", "whatsapp").eq("externalId", externalId)
      )
      .first();
    if (existing) return { processed: true };
    if (!checkOnly) {
      await ctx.db.insert("processedWebhookEvents", {
        provider: "whatsapp",
        externalId,
        processedAt: Date.now(),
      });
    }
    return { processed: false };
  },
});

export async function recordWhatsAppMessageLogic(
  ctx: MutationCtx,
  args: {
    from: string;
    body: string;
    occurredAt: number;
    externalId: string;
  },
) {
  // Match by phone number against contact_phones (§10 — same pattern as email).
  const phones = await ctx.db.query("contactPhones").collect();
  const hit = phones.find((p) => phonesMatch(p.phoneNumber, args.from));
  const contact = hit ? await ctx.db.get(hit.contactId) : null;
  const user = contact ? await ctx.db.get(contact.userId) : null;

  const now = Date.now();
  // §20.14 triage — rule-based first, LLM gated (same as inbound email).
  const windowStart = now - 24 * 60 * 60 * 1000;
  const capRow = user
    ? await ctx.db
        .query("rateLimits")
        .withIndex("by_key_action_window", (q) =>
          q.eq("key", `user:${user._id}`).eq("actionType", "llm_triage").eq("windowStart", windowStart)
        )
        .first()
    : null;
  const canUseLlm =
    Boolean(user) &&
    user!.aiTriageEnabled !== false &&
    llmTriageConfigured() &&
    (capRow?.attemptCount ?? 0) < LLM_TRIAGE_DAILY_CAP;
  const { verdict, usedLlm } = await classifyMessage({
    from: args.from,
    subject: "",
    body: args.body,
    aiTriageEnabled: user?.aiTriageEnabled !== false,
    canUseLlm,
  });
  if (usedLlm && user) {
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key_action_window", (q) =>
        q.eq("key", `user:${user._id}`).eq("actionType", "llm_triage").eq("windowStart", windowStart)
      )
      .first();
    if (row) await ctx.db.patch(row._id, { attemptCount: row.attemptCount + 1 });
    else
      await ctx.db.insert("rateLimits", {
        key: `user:${user._id}`,
        actionType: "llm_triage",
        windowStart,
        attemptCount: 1,
      });
  }

  const messageId = await ctx.db.insert("messages", {
    contactId: contact?._id, // null → general inbox (§10)
    channel: "whatsapp",
    direction: "inbound",
    fromAddress: args.from,
    body: args.body,
    occurredAt: args.occurredAt,
    classification: verdict,
  });
  if (contact) {
    await writeTimelineEvent(ctx, {
      contactId: contact._id,
      type: "whatsapp",
      sourceTable: "messages",
      sourceId: messageId,
      occurredAt: args.occurredAt,
    });
    // §12 "Client X reached out" — fire AFTER the transaction commits.
    if (contact.userId && typeof (ctx as any).scheduler?.runAfter === "function") {
      await (ctx as any).scheduler.runAfter(0, internal.push.notifyUser, {
        userId: contact.userId,
        title: "New WhatsApp message",
        body: `${contact.name}: ${args.body.slice(0, 80)}`,
      });
    }
  }
  await ctx.db.insert("processedWebhookEvents", {
    provider: "whatsapp",
    externalId: args.externalId,
    processedAt: now,
  });
  return {
    written: true,
    messageId,
    matched: Boolean(contact),
    classification: verdict,
  };
}

export const recordMessage = mutation({
  args: {
    from: v.string(),
    body: v.string(),
    occurredAt: v.number(),
    externalId: v.string(),
  },
  handler: async (ctx, args) => {
    return await recordWhatsAppMessageLogic(ctx, args);
  },
});

/**
 * §17 gmail_filter_setup — per-contact rows tracking whether the freelancer has
 * (a) added the filter text and (b) completed Google's forwarding confirmation.
 * This module is the single source of truth for those rows.
 *
 * The UI shows the filter text + forwarding address as one copy-button block
 * (§23.7 — forgiving input, nothing to retype), and shows "pending
 * confirmation" (§23.2) until the inbound handler flips forwardingConfirmed.
 */
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { buildFilterBlocks, forwardingAddress } from "./gmailLogic";

/** Domain the inbound provider receives mail on, e.g. inbound.signalapp.com. */
export function inboundDomain(): string {
  return process.env.INBOUND_DOMAIN ?? "inbound.signalapp.com";
}

async function userIdOrThrow(ctx: QueryCtx | MutationCtx): Promise<GenericId<"users">> {
  const userId = await getAuthUserId(ctx as any);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

async function ownedContact(ctx: QueryCtx | MutationCtx, userId: GenericId<"users">, contactId: GenericId<"contacts">) {
  const contact = await ctx.db.get(contactId);
  if (!contact || contact.userId !== userId) return null;
  return contact;
}

export const setupForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ownedContact(ctx, userId, contactId);
    if (!contact) return { rows: [], blocks: [], forwardingAddress: null };
    const emails = await ctx.db
      .query("contactEmails")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    const rows = await ctx.db.query("gmailFilterSetup").collect();
    const addresses = new Set(emails.map((e) => e.email.toLowerCase()));
    const mine = rows.filter((r) => addresses.has(r.contactEmail.toLowerCase()));
    const emailList = emails.map((e) => e.email);
    return {
      rows: mine,
      blocks: buildFilterBlocks(emailList),
      forwardingAddress: emailList.length > 0 ? forwardingAddress(contactId, inboundDomain()) : null,
    };
  },
});

/** Create setup rows (defaults false/false/1 per §17) for a contact's emails. */
export const ensureSetup = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    if (!(await ownedContact(ctx, userId, contactId))) throw new Error("Not found");
    const emails = await ctx.db
      .query("contactEmails")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    const rows = await ctx.db.query("gmailFilterSetup").collect();
    const existing = new Set(rows.map((r) => r.contactEmail.toLowerCase()));
    let created = 0;
    for (const e of emails) {
      if (existing.has(e.email.toLowerCase())) continue;
      await ctx.db.insert("gmailFilterSetup", {
        contactEmail: e.email,
        addedToFilter: false,
        forwardingConfirmed: false,
        filterGroup: 1,
      });
      created++;
    }
    return { created };
  },
});

/** Freelancer clicked "I've added this filter" — optimistic flag, §23.2. */
export const markAddedToFilter = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    if (!(await ownedContact(ctx, userId, contactId))) throw new Error("Not found");
    const emails = await ctx.db
      .query("contactEmails")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    const rows = await ctx.db.query("gmailFilterSetup").collect();
    const addresses = new Set(emails.map((e) => e.email.toLowerCase()));
    for (const row of rows.filter((r) => addresses.has(r.contactEmail.toLowerCase()))) {
      await ctx.db.patch(row._id, { addedToFilter: true });
    }
  },
});


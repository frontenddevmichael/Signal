/**
 * §17 reply box — replying from the client's page sends via gmail.send (the
 * freelancer's own identity), then records the OUTBOUND message + timeline
 * event in one transaction (same write path as inbound, direction flipped).
 */
import { action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { encodeRawMessage, sendGmailMessage } from "./gmailClient";
import { composeRawMessage } from "./gmailSend";
import { writeTimelineEvent } from "./timeline";

/** §17 audit fix — the owner of a contact (identity of the freelancer). */
export const ownerForContact = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const contact = await ctx.db.get(contactId);
    if (!contact) return null;
    return ctx.db.get(contact.userId);
  },
});

/** §17 audit fix — the contact's registered email addresses. */
export const contactEmails = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const rows = await ctx.db
      .query("contactEmails")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    return rows.map((r) => ({ email: r.email }));
  },
});

export const sendReply = action({
  args: {
    contactId: v.id("contacts"),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    inReplyTo: v.optional(v.string()),
    references: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ sent: boolean; messageId: string; recorded: { messageId: string } }> => {
    // §17 audit fix: only the contact's owner may reply, and only to the
    // contact's OWN addresses — a signed-in caller can no longer forge a
    // "you replied" timeline entry onto a victim's contact.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) throw new Error("Not signed in");
    const user = await ctx.runQuery(internal.gmailReply.ownerForContact, { contactId: args.contactId });
    if (!user || user.email !== identity.email) throw new Error("Not found");

    const emails = await ctx.runQuery(internal.gmailReply.contactEmails, { contactId: args.contactId });
    const allowed = emails.map((e) => e.email.toLowerCase());
    if (allowed.length === 0 || !allowed.includes(args.to.trim().toLowerCase())) {
      throw new Error("Not a recognized address for this client");
    }

    const accessToken = await ctx.runAction(api.gmailClient.gmailAccessToken, {});
    const raw = composeRawMessage({
      to: args.to,
      from: "me",
      subject: args.subject,
      text: args.body,
      ...(args.inReplyTo ? { inReplyTo: args.inReplyTo } : {}),
      ...(args.references ? { references: args.references } : {}),
    });
    const messageId = await sendGmailMessage(accessToken, encodeRawMessage(raw));
    const recorded = await ctx.runMutation(internal.gmailReply.recordOutbound, {
      contactId: args.contactId,
      to: args.to,
      body: args.body,
      occurredAt: Date.now(),
    });
    return { sent: true, messageId, recorded };
  },
});

/** Record the outbound message + timeline event (§17 write path). */
export const recordOutbound = internalMutation({
  args: {
    contactId: v.id("contacts"),
    to: v.string(),
    body: v.string(),
    occurredAt: v.number(),
  },
  handler: async (ctx, args): Promise<{ messageId: string }> => {
    const contact = await ctx.db.get(args.contactId);
    const messageId = await ctx.db.insert("messages", {
      contactId: args.contactId as GenericId<"contacts">,
      userId: contact?.userId,
      channel: "email",
      direction: "outbound",
      fromAddress: args.to,
      body: args.body,
      occurredAt: args.occurredAt,
    });
    await writeTimelineEvent(ctx, {
      contactId: args.contactId,
      type: "email",
      sourceTable: "messages",
      sourceId: messageId,
      occurredAt: args.occurredAt,
    });
    return { messageId };
  },
});

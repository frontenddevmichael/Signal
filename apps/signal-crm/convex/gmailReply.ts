/**
 * §17 reply box — replying from the client's page sends via gmail.send (the
 * freelancer's own identity), then records the OUTBOUND message + timeline
 * event in one transaction (same write path as inbound, direction flipped).
 */
import { action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { encodeRawMessage, sendGmailMessage } from "./gmailClient";
import { composeRawMessage } from "./gmailSend";
import { writeTimelineEvent } from "./timeline";

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
    const messageId = await ctx.db.insert("messages", {
      contactId: args.contactId as GenericId<"contacts">,
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

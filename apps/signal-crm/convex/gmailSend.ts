/**
 * §17 sending — gmail.send so the freelancer sends client mail from their own
 * Gmail identity. The refresh token is decrypted HERE inside the action
 * (gmailClient.gmailAccessToken) — the §20.9 boundary: decrypt only in
 * server-side actions, never in a query or the browser.
 */
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { encodeRawMessage, sendGmailMessage } from "./gmailClient";

/** Compose a minimal RFC 2822 message (text body). */
export function composeRawMessage(args: {
  to: string;
  from: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const headers = [
    `To: ${args.to}`,
    `From: ${args.from}`,
    `Subject: ${args.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
  ];
  if (args.inReplyTo) headers.push(`In-Reply-To: ${args.inReplyTo}`);
  if (args.references) headers.push(`References: ${args.references}`);
  const bytes = new TextEncoder().encode(args.text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const body = btoa(bin);
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export const sendEmailViaGmail = action({
  args: {
    to: v.string(),
    from: v.string(),
    subject: v.string(),
    text: v.string(),
    inReplyTo: v.optional(v.string()),
    references: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const accessToken = await ctx.runAction(api.gmailClient.gmailAccessToken, {});
    const raw = composeRawMessage(args);
    const encoded = encodeRawMessage(raw);
    const messageId = await sendGmailMessage(accessToken, encoded);
    return { sent: true, messageId, via: "gmail" };
  },
});

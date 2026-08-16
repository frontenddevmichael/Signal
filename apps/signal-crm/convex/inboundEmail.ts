/**
 * §17 inbound email — receives forwarded client mail from Mailgun or Postmark
 * (provider detected from the request), verifies the provider's signature
 * BEFORE anything else, dedupes via processed_webhook_events, detects Google's
 * forwarding-confirmation mail, applies the SPF/DKIM spoofing guard to the
 * ORIGINAL message, and only then writes messages + timeline via the shared
 * writeTimelineEvent() helper.
 *
 * Signature handling:
 *   Mailgun  — HMAC-SHA256(apiKey, timestamp + token) == signature; fields
 *              arrive as form-data (signature, timestamp, token) with the
 *              parsed message + headers in the same multipart body.
 *   Postmark — x-postmark-signature header; HMAC-SHA256(webhookSecret, rawBody).
 *
 * The pure decision logic (extractForwardingConfirmation, evaluateSpoofingRisk)
 * lives in gmailLogic.ts and is Vitest-covered; this module does the plumbing.
 */
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  evaluateSpoofingRisk,
  extractForwardingConfirmation,
} from "./gmailLogic";

type MutationRunner = {
  runMutation: (ref: any, args: any) => Promise<any>;
};

function providerConfigured(): "mailgun" | "postmark" | null {
  if (process.env.MAILGUN_API_KEY) return "mailgun";
  if (process.env.POSTMARK_WEBHOOK_SECRET) return "postmark";
  return null;
}

/** HMAC-SHA256 hex helper (Web Crypto — works in the default runtime). */
async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface ParsedInbound {
  externalId: string;
  provider: "mailgun" | "postmark";
  to: string;
  from: string;
  subject: string;
  body: string;
  /** Original-message auth headers as parsed by the provider. */
  spf?: string | null;
  dkim?: string | null;
  dmarc?: string | null;
}

/** Header lookup helper for arrays of {name, value} (Postmark) or {Name, Value} (Mailgun). */
function findHeader(headers: any[], name: string): string | undefined {
  const hit = headers?.find(
    (h) => (h.name ?? h.Name ?? "").toLowerCase() === name.toLowerCase()
  );
  return hit ? (hit.value ?? hit.Value) : undefined;
}

function authValuesFromHeaders(headers: any[]): {
  spf?: string | null;
  dkim?: string | null;
  dmarc?: string | null;
} {
  const authResults = findHeader(headers, "Authentication-Results") ?? "";
  const receivedSpf = findHeader(headers, "Received-SPF");
  const dkimSig = findHeader(headers, "DKIM-Signature");
  return {
    spf: receivedSpf ?? (authResults.includes("spf=pass") ? "pass" : authResults.includes("spf=fail") ? "fail" : "none"),
    dkim: dkimSig
      ? authResults.includes("dkim=pass")
        ? "pass"
        : authResults.includes("dkim=fail")
          ? "fail"
          : "neutral"
      : null,
    dmarc: authResults.includes("dmarc=pass") ? "pass" : authResults.includes("dmarc=fail") ? "fail" : "none",
  };
}

/** Extract a normalized message from a Mailgun (form) payload. */
async function parseMailgun(request: Request): Promise<ParsedInbound | null> {
  const form = await request.formData();
  const token = (form.get("token") as string) ?? "";
  const timestamp = (form.get("timestamp") as string) ?? "";
  const signature = (form.get("signature") as string) ?? "";
  const key = process.env.MAILGUN_API_KEY!;
  const expected = await hmacHex(key, timestamp + token);
  if (!timingSafeEqualHex(expected, signature)) return null;

  // Mailgun's scheme signs ONLY timestamp+token — not the body — so the token
  // must be fresh to defeat replay of a captured webhook. Reject anything older
  // than 15 minutes (Mailgun's own recommendation).
  const sentAt = parseInt(timestamp, 10);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > 900) return null;

  const headers = JSON.parse((form.get("message-headers") as string) ?? "[]");
  const to = (form.get("recipient") as string) ?? "";
  const from = (form.get("From") as string) ?? "";
  const subject = (form.get("Subject") as string) ?? "";
  const body = (form.get("stripped-text") as string) ?? (form.get("body-plain") as string) ?? "";
  return {
    externalId: token,
    provider: "mailgun",
    to,
    from,
    subject,
    body,
    ...authValuesFromHeaders(headers),
  };
}

/** Extract a normalized message from a Postmark (JSON) payload. */
async function parsePostmark(request: Request): Promise<ParsedInbound | null> {
  const raw = await request.text();
  const sig = request.headers.get("x-postmark-signature") ?? "";
  const expected = await hmacHex(process.env.POSTMARK_WEBHOOK_SECRET!, raw);
  if (!timingSafeEqualHex(expected, sig)) return null;

  const json = JSON.parse(raw) as any;
  return {
    externalId: json.MessageID ?? json.MessageId ?? String(Date.now()),
    provider: "postmark",
    to: json.To ?? json.Recipient ?? "",
    from: json.From ?? "",
    subject: json.Subject ?? "",
    body: json.TextBody ?? json.StrippedTextReply ?? "",
    ...authValuesFromHeaders(json.Headers ?? []),
  };
}

export async function handleInboundEmail(ctx: MutationRunner, request: Request): Promise<Response> {
  const provider = providerConfigured();
  if (!provider) return new Response("Inbound email not configured", { status: 500 });

  let parsed: ParsedInbound | null = null;
  try {
    parsed = provider === "mailgun" ? await parseMailgun(request) : await parsePostmark(request);
  } catch {
    return new Response("Malformed payload", { status: 400 });
  }
  // parseMailgun/parsePostmark return null on signature mismatch.
  if (!parsed) return new Response("Invalid signature", { status: 401 });

  // Idempotency — same (provider, external_id) discipline as every webhook.
  const dedupe = await ctx.runMutation(internal.inboundMutations.markProcessed, {
    provider: parsed.provider,
    externalId: parsed.externalId,
    checkOnly: true,
  });
  if (dedupe.processed) return new Response("OK", { status: 200 });

  // §17 forwarding confirmation — Google emails the inbound address when the
  // freelancer adds it in Gmail. The code is stored on the matching contact's
  // gmail_filter_setup rows so the UI can surface it (pending state, §23.2).
  const matchTo = parsed.to.match(/^client-([a-zA-Z0-9]+)@/);
  const confirmation = extractForwardingConfirmation({
    subject: parsed.subject,
    from: parsed.from,
    body: parsed.body,
  });
  if (confirmation.confirmed) {
    if (matchTo) {
      await ctx.runMutation(internal.inboundMutations.markForwardingConfirmed, {
        contactId: matchTo[1],
        code: confirmation.code,
      });
    }
    await ctx.runMutation(internal.inboundMutations.markProcessed, {
      provider: parsed.provider,
      externalId: parsed.externalId,
      checkOnly: false,
    });
    return new Response("OK", { status: 200 });
  }

  // §17 spoofing guard — reject (and log) before writing anything.
  const guard = evaluateSpoofingRisk({
    spf: parsed.spf,
    dkim: parsed.dkim,
    dmarc: parsed.dmarc,
  });
  if (!guard.spoofingSafe) {
    await ctx.runMutation(internal.inboundMutations.logRejected, {
      reason: guard.reason,
      from: parsed.from,
      subject: parsed.subject,
    });
    return new Response("Rejected: unauthenticated message", { status: 200 });
  }

  // Route by the per-contact forwarding address: client-{contactId}@domain.
  const match = matchTo;
  if (!match) {
    // Forwarded from a different address (e.g. first setup test) — ack, don't drop silently.
    await ctx.runMutation(internal.inboundMutations.markProcessed, {
      provider: parsed.provider,
      externalId: parsed.externalId,
      checkOnly: false,
    });
    return new Response("OK", { status: 200 });
  }
  const contactId = match[1];

  const write = await ctx.runMutation(internal.inboundMutations.recordInbound, {
    contactId,
    from: parsed.from,
    subject: parsed.subject,
    body: parsed.body,
    externalId: parsed.externalId,
    provider: parsed.provider,
  });

  return new Response(JSON.stringify(write), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const inboundEmailWebhook = httpAction(async (ctx, request) => {
  return await handleInboundEmail(ctx, request);
});

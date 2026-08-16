/**
 * §10/§21.12 WhatsApp PURE logic — no Convex imports, Vitest-ready.
 * Covers the parts that must be right before any write: Meta's webhook
 * signature verification and the phone-number normalization used to match
 * inbound messages to contact_phones rows.
 */

/**
 * Verify Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app
 * secret, hex, prefixed "sha256="). Reject BEFORE processing — same rule as
 * GitHub (§20.11). Web Crypto so it runs in the default runtime + tests.
 */
export async function verifyMetaSignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expected = signatureHeader.slice("sha256=".length);
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * E.164 normalization for matching. WhatsApp sends +1..., but contacts may be
 * stored as "555-1234" or "15551234". Strip everything non-digit; drop a
 * leading country code (1 for US/CA, 234 for NG) when the rest matches an
 * existing contact — callers pass both raw forms.
 */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits;
}

/** Two numbers are the same contact when either's digit string matches. */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Same digits with a different country-code prefix.
  const shortA = na.length > 10 ? na.slice(-10) : na;
  const shortB = nb.length > 10 ? nb.slice(-10) : nb;
  return shortA === shortB && shortA.length >= 10;
}

export interface WhatsAppMessage {
  id: string;
  from: string;
  text: string;
  timestamp: string;
}

/**
 * Extract a message from a Meta Cloud API webhook payload.
 * Shape: entry[0].changes[0].value.messages[0] {id, from, text.body, timestamp}.
 */
export function extractWhatsAppMessage(payload: any): WhatsAppMessage | null {
  const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message || !message.id || !message.from) return null;
  // Ignore status updates (delivery/read receipts have no text) — not messages.
  if (message.type !== "text" && !message.text?.body) return null;
  return {
    id: String(message.id),
    from: String(message.from),
    text: String(message.text?.body ?? ""),
    timestamp: String(message.timestamp ?? Date.now()),
  };
}

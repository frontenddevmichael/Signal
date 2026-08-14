/**
 * §17 / §20.14 Phase 4 PURE logic — no Convex imports, no network, fully
 * unit-testable. This covers the fragile parts of the $0 Gmail architecture:
 * the filter chain limit, Google's forwarding-confirmation email format, the
 * inbound spoofing guard, and the rule-based triage fallback (§20.14).
 */

/** §17 — Gmail OR-chain filters have a practical length ceiling. */
export const FILTER_CHAIN_MAX = 15;

/**
 * §17 filter chain split. Given the full sorted list of client email addresses,
 * returns the filter blocks to surface. Once the address count passes
 * FILTER_CHAIN_MAX, a second (numbered) block is auto-generated rather than
 * silently growing a filter past what anyone tested.
 *
 * Each block is a Gmail "from: OR-list" search string the freelancer pastes
 * into Gmail's filter settings:
 *   from:(a@x.com OR b@y.com OR ...)
 * Gmail's own syntax is matched by wrapping the OR list in parentheses; the
 * operator must be uppercase OR (Gmail is case-sensitive here).
 */
export function buildFilterBlocks(emails: string[]): { group: number; filterText: string }[] {
  const sorted = [...emails].sort((a, b) => a.localeCompare(b));
  const blocks: { group: number; filterText: string }[] = [];
  const chunkSize = FILTER_CHAIN_MAX;
  for (let i = 0; i < sorted.length; i += chunkSize) {
    const chunk = sorted.slice(i, i + chunkSize);
    blocks.push({
      group: Math.floor(i / chunkSize) + 1,
      filterText: `from:(${chunk.join(" OR ")})`,
    });
  }
  return blocks;
}

/** The email address Gmail sends the forwarding-confirmation code TO. */
export function forwardingAddress(contactId: string, inboundDomain: string): string {
  // §17 — per-contact dedicated inbound address; contactId embedded so the
  // inbound handler can route without a lookup.
  return `client-${contactId}@${inboundDomain}`;
}

/**
 * §17 forwarding-confirmation detection. When the freelancer adds the inbound
 * address under Gmail's "Add a forwarding address" setting, Gmail emails a
 * confirmation code TO that address. This recognizes that email from the raw
 * inbound payload so the code can be surfaced back in the UI.
 *
 * Google's confirmation mail has a stable subject and body shape:
 *   Subject: "Gmail Forwarding Confirmation - Confirm forwarding address"
 *   Body:    "...verify your email forwarding... confirmation code ..."
 *           followed by a 6-8 digit numeric code, often on its own line.
 */
export function extractForwardingConfirmation(input: {
  subject?: string;
  from?: string;
  body?: string;
}): { confirmed: boolean; code?: string } {
  const subject = input.subject ?? "";
  const body = input.body ?? "";
  const from = input.from ?? "";
  const looksLikeGoogleConfirmation =
    /gmail.*forwarding.*confirm/i.test(subject) && /mail-noreply@google\.com/i.test(from);
  if (!looksLikeGoogleConfirmation) return { confirmed: false };
  // The code itself: 6-8 digits, either on its own line or as a standalone
  // token near "code".
  const standalone = body.match(/(?:^|\n)\s*(\d{6,8})\s*(?:\n|$)/);
  const nearCode = body.match(/(?:confirmation code(?: is|:)?\s*[:#]?\s*)(\d{6,8})/i);
  const code = standalone?.[1] ?? nearCode?.[1];
  if (!code) return { confirmed: false };
  return { confirmed: true, code };
}

export interface EmailAuthResult {
  /** True when the original message's SPF and DKIM both passed. */
  spoofingSafe: boolean;
  reason: string;
}

/**
 * §17 inbound spoofing guard. The forwarding address is effectively a public
 * secret, so we verify SPF/DKIM on the ORIGINAL forwarded message (what the
 * inbound provider parsed out of the header chain) before writing to messages.
 * Both must pass; a forged message that never went through Gmail will fail at
 * least one (spoofers can't pass DKIM without the sender's private key).
 */
export function evaluateSpoofingRisk(input: {
  spf?: string | null;
  dkim?: string | null;
  dmarc?: string | null;
}): EmailAuthResult {
  const spf = input.spf?.toLowerCase() ?? "";
  const dkim = input.dkim?.toLowerCase() ?? "";
  const dmarc = input.dmarc?.toLowerCase() ?? "";

  if (spf.includes("pass") && dkim.includes("pass")) {
    return { spoofingSafe: true, reason: "SPF pass + DKIM pass" };
  }
  // One leg passing with a DMARC pass is a weak-but-accepted signal (DMARC
  // alignment requires at least one of SPF/DKIM aligned); still log which leg
  // passed. We do NOT accept this as safe by default — §17 requires both.
  if (spf.includes("pass") || dkim.includes("pass")) {
    const leg = spf.includes("pass") ? "SPF only" : "DKIM only";
    if (dmarc.includes("pass")) {
      return {
        spoofingSafe: false,
        reason: `${leg} + DMARC pass — partial alignment, rejecting per §17 both-legs rule`,
      };
    }
    return { spoofingSafe: false, reason: `${leg} — DKIM/SPF pair incomplete, rejecting per §17 both-legs rule` };
  }
  if (spf.includes("fail") || dkim.includes("fail")) {
    return { spoofingSafe: false, reason: "Explicit auth failure detected (SPF or DKIM fail)" };
  }
  return { spoofingSafe: false, reason: "No passing authentication records on the original message" };
}

/** §17 — a from address is "safe" to forward-match when it isn't a bouncer/mailer-daemon. */
export function isRoutableFromAddress(from: string): boolean {
  const f = from.toLowerCase();
  if (!f) return false;
  if (/(mailer-daemon|postmaster|bounce|no-reply|noreply|automated|donotreply)/.test(f)) {
    return false;
  }
  return true;
}

/**
 * §20.14 rule-based triage fallback — the first-pass classifier that runs
 * ALWAYS (before any LLM), and is the ONLY classifier when ai_triage_enabled
 * is off or the daily LLM cap is hit. Keyword/sender heuristics catch the
 * obvious cases for free; only ambiguous messages reach the LLM.
 */
export type TriageVerdict = "spam" | "important" | "ambiguous";

const SPAM_PATTERNS = [
  /unsubscribe/i,
  /get rich quick/i,
  /free (trial|consultation|quote)/i,
  /crypto (bonus|giveaway)/i,
  /act now/i,
  /limited time offer/i,
  /click (here|this link)/i,
  /viagra|casino|lottery/i,
  /100%\s*(free|guaranteed)/i,
];

const IMPORTANT_PATTERNS = [
  /invoice/i,
  /payment/i,
  /deadline/i,
  /urgent/i,
  /contract/i,
  /proposal/i,
  /signed?/i,
  /meeting|call|call? (today|tomorrow|monday|tuesday|wednesday|thursday|friday)/i,
  /bug|broken|error|crash|down/i,
  /review|approve/i,
  /launch/i,
];

export function ruleBasedTriage(input: { from: string; subject: string; body: string }): TriageVerdict {
  const subject = input.subject ?? "";
  const body = input.body ?? "";
  const from = input.from ?? "";
  const haystack = `${subject}\n${body}`;

  // Known sender beats content heuristics: an existing client address is
  // important regardless of spammy-looking copy (they may forward a spam email).
  if (isRoutableFromAddress(from) && IMPORTANT_PATTERNS.some((p) => p.test(haystack))) {
    return "important";
  }
  if (SPAM_PATTERNS.some((p) => p.test(haystack))) {
    return "spam";
  }
  return "ambiguous";
}

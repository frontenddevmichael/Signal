/**
 * §9a/§20.11/§21.4 GitHub webhook PURE logic — no Convex imports, no node
 * built-ins (Web Crypto only), so mutations, actions, and Vitest can all
 * import it. The HTTP action in githubWebhook.ts calls these; the tests in
 * tests/githubLogic.test.ts cover them directly.
 *
 * Two checks, both required, in this order (§20.11):
 * 1. AUTHENTICITY — X-Hub-Signature-256 must match an HMAC-SHA256 of the raw
 *    body with the App's webhook secret. Reject (no write) if it doesn't.
 * 2. IDEMPOTENCY — X-GitHub-Delivery checked against processed_webhook_events
 *    (provider: github, external_id: delivery_id) BEFORE any processing.
 */

/**
 * GitHub signs the RAW request body with HMAC-SHA256, keyed on the webhook
 * secret, prefixed "sha256=". Constant-time compare prevents timing
 * side-channels. Returns false (never throws) so the caller can drop it.
 */
export async function verifyGithubSignature(
  secret: string,
  rawBody: string | BufferSource,
  xHubSignature256: string | null | undefined,
): Promise<boolean> {
  if (!xHubSignature256) return false;
  const providedHex = xHubSignature256.replace(/^sha256=/, "");
  const expectedHex = await hmacSha256Hex(secret, rawBody);
  return constantTimeEqualHex(expectedHex, providedHex);
}

async function hmacSha256Hex(secret: string, data: string | BufferSource): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, typeof data === "string" ? enc.encode(data) : data);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time hex comparison (no early exit on mismatch). */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * §9 — the flipped billable default. `activeLinkCount` is the number of ACTIVE
 * project_repos links on the repo at write time:
 *   exactly one → true  (the overwhelming majority case, no friction)
 *   more than one → false (the ambiguous multi-client case is opt-IN)
 * This is a deliberate risk-reduction decision — never flatten it back to a
 * constant default (see §9 for the double-invoice reasoning).
 */
export function billableDefaultForLinks(activeLinkCount: number): boolean {
  return activeLinkCount === 1;
}

/**
 * Idempotency check: given the previously-seen (provider, external_id) pairs,
 * is this delivery already processed? The DB lookup happens in the action;
 * this pure predicate keeps the decision testable.
 */
export function isDeliveryAlreadyProcessed(
  seenExternalIds: readonly string[],
  deliveryId: string,
): boolean {
  return seenExternalIds.includes(deliveryId);
}

export type GithubActivityType = "pr_merged" | "issue_closed" | "deploy";

export interface GithubActivity {
  type: GithubActivityType;
  title: string;
  url: string;
  occurredAt: number;
}

/**
 * Map a GitHub webhook payload to a repo_activity row. Returns null when the
 * event isn't activity worth recording (e.g. a push, or a PR that wasn't
 * merged). Only merged PRs, closed issues, and successful deploys count —
 * matching the §18 repo_activity type enum exactly.
 */
export function extractActivity(payload: Record<string, any>): GithubActivity | null {
  const repoFullName: string = payload?.repository?.full_name ?? "";
  const occurredAt = Date.parse(payload?.repository?.pushed_at ?? "") || Date.now();

  if (payload?.pull_request) {
    const pr = payload.pull_request;
    if (payload.action !== "closed" || !pr.merged) return null;
    return {
      type: "pr_merged",
      title: pr.title ?? `PR #${pr.number ?? ""} merged`,
      url: pr.html_url ?? `https://github.com/${repoFullName}/pull/${pr.number ?? ""}`,
      occurredAt: Date.parse(pr.merged_at ?? "") || occurredAt,
    };
  }

  if (payload?.issue && !payload?.pull_request) {
    const issue = payload.issue;
    if (payload.action !== "closed") return null;
    return {
      type: "issue_closed",
      title: issue.title ?? `Issue #${issue.number ?? ""} closed`,
      url: issue.html_url ?? `https://github.com/${repoFullName}/issues/${issue.number ?? ""}`,
      occurredAt: Date.parse(issue.closed_at ?? "") || occurredAt,
    };
  }

  if (payload?.deployment_status) {
    const ds = payload.deployment_status;
    if (ds.state !== "success" && ds.state !== "ready") return null;
    const deployment = payload.deployment ?? {};
    return {
      type: "deploy",
      title: `${deployment.environment ?? "production"} deploy succeeded`,
      url: ds.target_url ?? payload?.repository?.html_url ?? `https://github.com/${repoFullName}`,
      occurredAt: Date.parse(ds.created_at ?? "") || occurredAt,
    };
  }

  return null;
}

/** Repo owner/name split from full_name ("owner/repo" → { owner, name }). */
export function splitFullName(fullName: string): { owner: string; name: string } {
  const [owner = "", name = ""] = fullName.split("/");
  return { owner, name };
}

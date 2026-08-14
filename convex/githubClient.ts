/**
 * GitHub App API client — server-side only (Convex actions). Signs an App JWT
 * with the private key (GITHUB_PRIVATE_KEY env), exchanges it for a per-
 * installation access token, and calls the REST API. Never exposed to the
 * client; the app only holds read permissions (§9a).
 *
 * Credentials come from Convex env vars (set once the user provides them):
 *   GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET,
 *   GITHUB_APP_SLUG (for the install URL).
 */
"use node";

import { createPrivateKey, sign } from "node:crypto";

const API = "https://api.github.com";

export function githubConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY,
  );
}

/** https://github.com/apps/{slug}/installations/new — the connect entry point. */
export function installUrl(): string {
  return `https://github.com/apps/${process.env.GITHUB_APP_SLUG ?? "signal-crm"}/installations/new`;
}

/** https://github.com/settings/installations/{id} — "Add more repos" (widen access). */
export function installationSettingsUrl(installationId: number): string {
  return `https://github.com/settings/installations/${installationId}`;
}

function base64url(data: Buffer): string {
  return data.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Short-lived (10 min max) App JWT: iss = App ID, signed RS256 with the App's
 * private key. Exchanged for an installation token; never stored.
 */
export function createAppJwt(nowMs = Date.now()): string {
  const appId = process.env.GITHUB_APP_ID!;
  const iat = Math.floor(nowMs / 1000) - 60;
  const exp = iat + 9 * 60;
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(Buffer.from(JSON.stringify({ iat, exp, iss: appId })));
  const data = `${header}.${payload}`;
  const key = createPrivateKey(process.env.GITHUB_PRIVATE_KEY!);
  const sig = sign("RSA-SHA256", Buffer.from(data), key);
  return `${data}.${base64url(sig)}`;
}

async function ghFetch(path: string, token: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Signal-CRM",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const jwt = createAppJwt();
  const body = await ghFetch(`/app/installations/${installationId}/access_tokens`, jwt, {
    method: "POST",
  });
  return body.token as string;
}

export interface GithubRepo {
  id: number;
  full_name: string;
  html_url: string;
}

/** Repos the installation can see (All or Select — whatever was granted). */
export async function listInstallationRepos(installationId: number): Promise<GithubRepo[]> {
  const token = await getInstallationToken(installationId);
  const repos: GithubRepo[] = [];
  let path: string | null = "/installation/repositories?per_page=100";
  while (path) {
    const res: Response = await fetch(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Signal-CRM",
      },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const page: { repositories?: { id: number; full_name: string; html_url: string }[] } = await res.json();
    for (const r of page.repositories ?? []) {
      repos.push({ id: r.id, full_name: r.full_name, html_url: r.html_url });
    }
    const link = res.headers.get("link");
    const m = link?.match(/<([^>]+)>;\s*rel="next"/);
    path = m ? m[1].replace(API, "") : null;
  }
  return repos;
}

interface BackfillItem {
  type: "pr_merged" | "issue_closed";
  title: string;
  url: string;
  closed_at: string;
}

/**
 * §20.2 — one-time backfill: merged PRs + closed issues from `since` (project
 * created_at or 90-day cap, whichever is shorter). Pull requests merged via
 * the "merged" filter; issues closed via state=closed.
 */
export async function backfillRepoActivity(
  installationId: number,
  fullName: string,
  since: number,
): Promise<BackfillItem[]> {
  const token = await getInstallationToken(installationId);
  const sinceIso = new Date(since).toISOString();
  const items: BackfillItem[] = [];

  const prs = await ghFetch(
    `/repos/${fullName}/pulls?state=closed&sort=updated&direction=desc&per_page=50&merged_at=>=${encodeURIComponent(sinceIso)}`,
    token,
  );
  for (const pr of prs ?? []) {
    if (!pr.merged_at) continue;
    if (Date.parse(pr.merged_at) < since) continue;
    items.push({
      type: "pr_merged",
      title: pr.title,
      url: pr.html_url,
      closed_at: pr.merged_at,
    });
  }

  const issues = await ghFetch(
    `/repos/${fullName}/issues?state=closed&since=${encodeURIComponent(sinceIso)}&per_page=50&sort=updated&direction=desc`,
    token,
  );
  for (const issue of issues ?? []) {
    // GitHub returns PRs in the issues endpoint too — skip any with pull_request.
    if (issue.pull_request) continue;
    if (Date.parse(issue.closed_at) < since) continue;
    items.push({
      type: "issue_closed",
      title: issue.title,
      url: issue.html_url,
      closed_at: issue.closed_at,
    });
  }

  // newest first, capped for the initial pull.
  return items.sort((a, b) => Date.parse(b.closed_at) - Date.parse(a.closed_at)).slice(0, 100);
}

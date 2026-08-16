"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { githubConfigured, listInstallationRepos, backfillRepoActivity } from "./githubClient";

/**
 * §9a step 4 — the import picker. Calls the installation's repo list and
 * enriches each with the "already linked to [Client]" inline flag (§9a decided:
 * show, don't hide). Actions can't touch db directly — reads go through
 * internal queries.
 */
export const availableRepos = action({
  handler: async (ctx): Promise<{ repos: any[]; error: string | null }> => {
    const user = await ctx.runQuery(internal.github.getConnection);
    if (!user.installationId) return { repos: [], error: "Not connected" };
    if (!githubConfigured()) return { repos: [], error: "Not configured" };

    const repos = await listInstallationRepos(user.installationId);

    const rows = await Promise.all(
      repos.map(async (repo) => {
        const info = await ctx.runQuery(internal.github.repoLinkInfo, {
          githubRepoId: repo.id,
        });
        return { ...repo, ...info };
      }),
    );
    return { repos: rows, error: null };
  },
});

/**
 * §20.2 one-time backfill — merged PRs + closed issues from project.created_at
 * (or 90 days, whichever is shorter), written straight to repo_activity with
 * billable:true (same as live events) + timeline entries. Action fetches from
 * GitHub; DB writes delegate to the internal mutation (actions can't write).
 */
export const backfill = action({
  args: {
    projectRepoId: v.id("projectRepos"),
    githubRepoId: v.number(),
    fullName: v.string(),
    since: v.number(),
  },
  handler: async (ctx, args): Promise<{ backfilled: number }> => {
    const conn = await ctx.runQuery(internal.github.getConnection);
    if (!conn.installationId || !githubConfigured()) return { backfilled: 0 };

    const items = await backfillRepoActivity(conn.installationId, args.fullName, args.since);
    return await ctx.runMutation(internal.github.recordBackfill, {
      projectRepoId: args.projectRepoId,
      items: items.map((i) => ({ ...i, occurredAt: Date.parse(i.closed_at) })),
    });
  },
});

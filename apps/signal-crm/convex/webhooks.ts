import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { billableDefaultForLinks } from "./githubLogic";
import { writeTimelineEvent } from "./timeline";
import type { GenericId } from "convex/values";

/**
 * Shared webhook write path — the ONLY mutations the GitHub httpAction calls
 * (via runMutation). Idempotency on (provider, external_id) is enforced here,
 * AFTER the action's signature check, and the processed marker is written in
 * the same transaction as any data it guards (§20.11).
 */

/**
 * §20.11 idempotency marker. checkOnly returns whether the delivery is known
 * without writing (used by the action's pre-check); otherwise marks it
 * processed — called with checkOnly:false only after a decision to process.
 */
export const githubMarkProcessed = mutation({
  args: {
    provider: v.literal("github"),
    externalId: v.string(),
    checkOnly: v.boolean(),
  },
  handler: async (ctx, { provider, externalId, checkOnly }) => {
    const existing = await ctx.db
      .query("processedWebhookEvents")
      .withIndex("by_provider_external", (q) => q.eq("provider", provider).eq("externalId", externalId))
      .first();
    if (checkOnly) return { processed: Boolean(existing) };
    if (!existing) {
      await ctx.db.insert("processedWebhookEvents", {
        provider,
        externalId,
        processedAt: Date.now(),
      });
    }
    return { processed: true };
  },
});

/**
 * §20.3 full uninstall/suspend: clear the freelancer's github_installation_id,
 * mark every repo of that installation disconnected. Nothing is deleted —
 * historical repo_activity and invoice line items stay intact.
 */
export const githubInstallationRemoved = mutation({
  args: { installationId: v.optional(v.number()) },
  handler: async (ctx, { installationId }) => {
    if (installationId === undefined) return { disconnected: 0 };
    const users = await ctx.db.query("users").collect();
    let touchedUsers = 0;
    for (const user of users) {
      if (user.githubInstallationId === installationId) {
        await ctx.db.patch(user._id, { githubInstallationId: undefined });
        touchedUsers++;
        const repos = await ctx.db
          .query("repos")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();
        for (const repo of repos) {
          if (repo.connectionStatus === "connected") {
            await ctx.db.patch(repo._id, { connectionStatus: "disconnected" });
          }
        }
      }
    }
    return { disconnected: touchedUsers };
  },
});

/** §20.3 partial downgrade: just the removed repo goes disconnected. */
export const githubRepoDisconnected = mutation({
  args: { githubRepoId: v.number() },
  handler: async (ctx, { githubRepoId }) => {
    const repo = await ctx.db
      .query("repos")
      .withIndex("by_github_repo_id", (q) => q.eq("githubRepoId", githubRepoId))
      .first();
    if (repo && repo.connectionStatus === "connected") {
      await ctx.db.patch(repo._id, { connectionStatus: "disconnected" });
    }
    return { repoId: repo?._id ?? null };
  },
});

interface ActivityArgs {
  githubRepoId: number;
  activity: { type: "pr_merged" | "issue_closed" | "deploy"; title: string; url: string; occurredAt: number };
  deliveryId: string;
}

type DbLike = { db: any };

/**
 * §9/§9a — the heart of the webhook path (plain helper so Vitest can drive it
 * with a stubbed db; the mutation below is a thin wrapper). A GitHub event is
 * written once per ACTIVE project_repos link (a monorepo shared by two clients
 * produces two repo_activity rows, both timelines stay accurate), with the §9
 * conditional billable default, and a timeline event per affected contact
 * through the shared writeTimelineEvent() helper — never a second write path.
 */
export async function recordGithubActivity(ctx: DbLike, args: ActivityArgs) {
  const { githubRepoId, activity, deliveryId } = args;
  const repo = await ctx.db
    .query("repos")
    .withIndex("by_github_repo_id", (q: any) => q.eq("githubRepoId", githubRepoId))
    .first();
  if (!repo || repo.connectionStatus !== "connected") return { linked: 0 };

  const links = await ctx.db
    .query("projectRepos")
    .withIndex("by_repo", (q: any) => q.eq("repoId", repo._id))
    .collect();

  // §9 conditional default: count ACTIVE project links on this repo.
  let activeLinks = 0;
  for (const link of links) {
    const project = await ctx.db.get(link.projectId);
    if (project?.status === "active") activeLinks++;
  }
  const billableDefault = billableDefaultForLinks(activeLinks);

  let written = 0;
  for (const link of links) {
    const project = await ctx.db.get(link.projectId);
    if (!project || project.status !== "active") continue;
    const activityId = await ctx.db.insert("repoActivity", {
      projectRepoId: link._id,
      type: activity.type,
      title: activity.title,
      url: activity.url,
      occurredAt: activity.occurredAt,
      billable: billableDefault,
    });
    written++;
    const contact = await ctx.db.get(project.contactId);
    if (contact) {
      await writeTimelineEvent(ctx as any, {
        contactId: contact._id as GenericId<"contacts">,
        projectId: project._id,
        type: "repo_activity",
        sourceTable: "repoActivity",
        sourceId: activityId,
        occurredAt: activity.occurredAt,
      });
    }
  }

  // Idempotency marker in the SAME transaction as the writes — a crash
  // before this leaves it unmarked, so GitHub's retry re-runs it safely.
  await ctx.db.insert("processedWebhookEvents", {
    provider: "github",
    externalId: deliveryId,
    processedAt: Date.now(),
  });

  return { linked: written };
}

export const githubRecordActivity = mutation({
  args: {
    githubRepoId: v.number(),
    activity: v.object({
      type: v.union(v.literal("pr_merged"), v.literal("issue_closed"), v.literal("deploy")),
      title: v.string(),
      url: v.string(),
      occurredAt: v.number(),
    }),
    deliveryId: v.string(),
  },
  handler: async (ctx, args) => recordGithubActivity(ctx, args),
});

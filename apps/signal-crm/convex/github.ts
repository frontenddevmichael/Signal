import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { billableDefaultForLinks } from "./githubLogic";
import { writeAuditLog } from "./audit";
import { writeTimelineEvent } from "./timeline";

/** Env-only helpers (kept here, not in the node-runtime client, so mutations can use them). */
function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY);
}
function installUrl(): string {
  return `https://github.com/apps/${process.env.GITHUB_APP_SLUG ?? "signal-crm"}/installations/new`;
}
function installationSettingsUrl(installationId: number): string {
  return `https://github.com/settings/installations/${installationId}`;
}

async function userIdOrThrow(ctx: QueryCtx | MutationCtx): Promise<GenericId<"users">> {
  const userId = await getAuthUserId(ctx as any);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

async function projectBelongsToUser(
  ctx: QueryCtx | MutationCtx,
  userId: GenericId<"users">,
  projectId: GenericId<"projects">,
) {
  const project = await ctx.db.get(projectId);
  if (!project) return null;
  const contact = await ctx.db.get(project.contactId);
  if (!contact || contact.userId !== userId) return null;
  return { project, contact };
}

/**
 * §22.7 integration-state — what the settings "Connect GitHub" card shows.
 * configured = the App credentials exist server-side; installationId = whether
 * the freelancer has connected; returns the install URL for the button.
 */
export const status = query({
  handler: async (ctx) => {
    const userId = await userIdOrThrow(ctx);
    const user = await ctx.db.get(userId);
    return {
      configured: githubConfigured(),
      installationId: user?.githubInstallationId ?? null,
      installUrl: installUrl(),
      configureUrl: user?.githubInstallationId
        ? installationSettingsUrl(user.githubInstallationId)
        : null,
    };
  },
});

/** §9a step 3 — GitHub redirects back with ?installation_id=…; store it. */
export const storeInstallation = mutation({
  args: { installationId: v.number() },
  handler: async (ctx, { installationId }) => {
    const userId = await userIdOrThrow(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Not found");
    const changed = user.githubInstallationId !== installationId;
    await ctx.db.patch(userId, { githubInstallationId: installationId });
    if (changed) {
      await writeAuditLog(ctx, {
        userId,
        action: "github.connect",
        entityType: "user",
        entityId: userId,
        metadata: { installationId },
      });
    }
    return { installationId };
  },
});

/** Manual disconnect (settings) — mirrors §20.3's webhook path. */
export const disconnect = mutation({
  handler: async (ctx) => {
    const userId = await userIdOrThrow(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Not found");
    if (user.githubInstallationId !== undefined) {
      await ctx.db.patch(userId, { githubInstallationId: undefined });
      const repos = await ctx.db
        .query("repos")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const repo of repos) {
        if (repo.connectionStatus === "connected") {
          await ctx.db.patch(repo._id, { connectionStatus: "disconnected" });
        }
      }
      await writeAuditLog(ctx, {
        userId,
        action: "github.disconnect",
        entityType: "user",
        entityId: userId,
      });
    }
  },
});

export const getConnection = internalQuery({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx as any);
    if (userId === null) return { installationId: null as number | null };
    const user = await ctx.db.get(userId);
    return { installationId: user?.githubInstallationId ?? null };
  },
});

/**
 * §9a audit fix — is this project_repo link owned by the authenticated user?
 * Used by the backfill action so a caller can't inject fabricated billable
 * activity onto another user's project.
 */
export const ownsProjectRepo = internalQuery({
  args: { projectRepoId: v.id("projectRepos") },
  handler: async (ctx, { projectRepoId }) => {
    const userId = await getAuthUserId(ctx as any);
    if (userId === null) return false;
    const link = await ctx.db.get(projectRepoId);
    if (!link) return false;
    const project = await ctx.db.get(link.projectId);
    if (!project) return false;
    const contact = await ctx.db.get(project.contactId);
    return contact?.userId === userId;
  },
});

export const repoLinkInfo = internalQuery({
  args: { githubRepoId: v.number() },
  handler: async (ctx, { githubRepoId }) => {
    const existing = await ctx.db
      .query("repos")
      .withIndex("by_github_repo_id", (q) => q.eq("githubRepoId", githubRepoId))
      .first();
    if (!existing) return { connected: true, alreadyLinked: [] as { contactName: string; projectId: string }[] };
    const links = await ctx.db
      .query("projectRepos")
      .withIndex("by_repo", (q) => q.eq("repoId", existing._id))
      .collect();
    const linked: { contactName: string; projectId: string }[] = [];
    for (const link of links) {
      const project = await ctx.db.get(link.projectId);
      if (!project) continue;
      const contact = await ctx.db.get(project.contactId);
      if (contact) {
        linked.push({ contactName: contact.name, projectId: project._id });
      }
    }
    return {
      connected: existing.connectionStatus === "connected",
      alreadyLinked: linked,
    };
  },
});

/**
 * §9a step 5 — import a repo onto a project. Matches on github_repo_id (not
 * full_name — repos can be renamed, §9a), writes repos if new, always writes
 * the project_repos link, and queues the §20.2 backfill (cap 2).
 */
export const importRepo = mutation({
  args: {
    projectId: v.id("projects"),
    githubRepoId: v.number(),
    fullName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await userIdOrThrow(ctx);
    const owned = await projectBelongsToUser(ctx, userId, args.projectId);
    if (!owned) throw new Error("Not found");

    let repo = await ctx.db
      .query("repos")
      .withIndex("by_github_repo_id", (q) => q.eq("githubRepoId", args.githubRepoId))
      .first();

    if (!repo) {
      const repoId = await ctx.db.insert("repos", {
        userId,
        githubRepoId: args.githubRepoId,
        fullName: args.fullName,
        connectionStatus: "connected",
        connectedAt: Date.now(),
      });
      repo = (await ctx.db.get(repoId))!;
    } else {
      // §20.3 — reconnecting a previously-disconnected repo flips it back.
      if (repo.connectionStatus === "disconnected") {
        await ctx.db.patch(repo._id, { connectionStatus: "connected", connectedAt: Date.now() });
      }
      if (repo.fullName !== args.fullName) {
        await ctx.db.patch(repo._id, { fullName: args.fullName });
      }
    }

    // idempotent link (re-importing the same repo onto the same project no-ops).
    const existingLink = await ctx.db
      .query("projectRepos")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const existing = existingLink.find((l) => l.repoId === repo._id);
    let linkId: GenericId<"projectRepos">;
    if (existing) {
      linkId = existing._id;
    } else {
      linkId = await ctx.db.insert("projectRepos", {
        projectId: args.projectId,
        repoId: repo._id,
      });
      await writeAuditLog(ctx, {
        userId,
        action: "github.import_repo",
        entityType: "project",
        entityId: args.projectId,
        metadata: { githubRepoId: args.githubRepoId, fullName: args.fullName },
      });
    }

    // §20.2 backfill — queue it (cap 2, pumped by scheduled action). Skip if
    // already queued/running/done for this link.
    const prior = await ctx.db
      .query("backfillJobs")
      .withIndex("by_project_repo", (q) => q.eq("projectRepoId", linkId))
      .collect();
    if (!prior.some((j) => j.status !== "failed")) {
      await ctx.db.insert("backfillJobs", {
        projectRepoId: linkId,
        githubRepoId: args.githubRepoId,
        fullName: args.fullName,
        since: Math.min(owned.project.createdAt, Date.now() - 90 * 86400000),
        status: "pending",
        createdAt: Date.now(),
      });
    }

    return { repoId: repo._id, alreadyLinked: Boolean(existing) };
  },
});

export const removeRepoLink = mutation({
  args: { projectRepoId: v.id("projectRepos") },
  handler: async (ctx, { projectRepoId }) => {
    const userId = await userIdOrThrow(ctx);
    const link = await ctx.db.get(projectRepoId);
    if (!link) return;
    const project = await ctx.db.get(link.projectId);
    if (!project) return;
    const contact = await ctx.db.get(project.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Not found");
    await writeAuditLog(ctx, {
      userId,
      action: "github.unlink_repo",
      entityType: "project",
      entityId: project._id,
      metadata: { projectRepoId },
    });
    await ctx.db.delete(projectRepoId);
  },
});

export const recordBackfill = internalMutation({
  args: {
    projectRepoId: v.id("projectRepos"),
    items: v.array(
      v.object({
        type: v.union(v.literal("pr_merged"), v.literal("issue_closed")),
        title: v.string(),
        url: v.string(),
        occurredAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, { projectRepoId, items }) => {
    const link = await ctx.db.get(projectRepoId);
    if (!link) return { backfilled: 0 };
    const project = await ctx.db.get(link.projectId);
    if (!project) return { backfilled: 0 };
    const contact = await ctx.db.get(project.contactId);
    if (!contact) return { backfilled: 0 };
    const seen = await ctx.db
      .query("repoActivity")
      .withIndex("by_project_repo", (q) => q.eq("projectRepoId", projectRepoId))
      .collect();
    const seenUrls = new Set(seen.map((s) => s.url));
    let written = 0;
    for (const item of items) {
      if (seenUrls.has(item.url)) continue; // idempotent backfill
      const activityId = await ctx.db.insert("repoActivity", {
        projectRepoId,
        type: item.type,
        title: item.title,
        url: item.url,
        occurredAt: item.occurredAt,
        billable: true,
      });
      await writeTimelineEvent(ctx as any, {
        contactId: contact._id,
        projectId: project._id,
        type: "repo_activity",
        sourceTable: "repoActivity",
        sourceId: activityId,
        occurredAt: item.occurredAt,
      });
      written++;
    }
    return { backfilled: written };
  },
});

/**
 * §14 "Linked repos & activity" — merged PRs / closed issues / deploys for a
 * contact, newest first, each with its repo name and billable flag.
 */
export const activityForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await userIdOrThrow(ctx);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.userId !== userId) return [];
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    const rows: any[] = [];
    for (const project of projects) {
      const links = await ctx.db
        .query("projectRepos")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      for (const link of links) {
        const repo = await ctx.db.get(link.repoId);
        const activities = await ctx.db
          .query("repoActivity")
          .withIndex("by_project_repo", (q) => q.eq("projectRepoId", link._id))
          .order("desc")
          .take(50);
        for (const a of activities) {
          rows.push({
            activity: a,
            projectId: project._id,
            projectName: project.name,
            repoName: repo?.fullName ?? "unknown repo",
            repoStatus: repo?.connectionStatus ?? "disconnected",
          });
        }
      }
    }
    return rows.sort((a, b) => b.activity.occurredAt - a.activity.occurredAt);
  },
});

/**
 * §9 invoice-time prep — Phase 3 will call this to render the "also linked to
 * [other client]" flag on suggested line items. Given a repo_activity row,
 * how many ACTIVE project links does its repo have?
 */
export const activeLinkCountForActivity = query({
  args: { activityId: v.id("repoActivity") },
  handler: async (ctx, { activityId }) => {
    const activity = await ctx.db.get(activityId);
    if (!activity) return { count: 0, billable: false };
    const link = await ctx.db.get(activity.projectRepoId);
    if (!link) return { count: 0, billable: false };
    const repo = await ctx.db.get(link.repoId);
    if (!repo) return { count: 0, billable: false };
    const links = await ctx.db
      .query("projectRepos")
      .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
      .collect();
    let active = 0;
    for (const l of links) {
      const project = await ctx.db.get(l.projectId);
      if (project?.status === "active") active++;
    }
    return { count: active, billable: billableDefaultForLinks(active) };
  },
});

/** Repos linked to a specific project (for the project's repo list UI). */
export const reposForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await userIdOrThrow(ctx);
    const owned = await projectBelongsToUser(ctx, userId, projectId);
    if (!owned) return [];
    const links = await ctx.db
      .query("projectRepos")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const rows = [];
    for (const link of links) {
      const repo = await ctx.db.get(link.repoId);
      if (repo) rows.push({ repo, projectRepoId: link._id });
    }
    return rows;
  },
});

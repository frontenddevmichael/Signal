import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { cronJobs } from "convex/server";

/**
 * §20.2 backfill queue — imports never fire backfills simultaneously. Each
 * import enqueues a job (status: pending); a scheduled pump (every 60s) picks
 * up to 2 pending jobs, runs them against the GitHub API, and marks them
 * done/failed. The cap protects the installation's shared 5,000 req/hr limit
 * from a burst of imports starving live webhook processing (§9a).
 */

export const pump = internalAction({
  args: {},
  handler: async (ctx): Promise<{ processed: number }> => {
    // Up to 2 pending jobs, oldest first.
    const jobs = await ctx.runQuery(internal.backfillQueue.listPending, { limit: 2 });
    for (const job of jobs) {
      await ctx.runMutation(internal.backfillQueue.markRunning, { jobId: job._id });
      try {
        await ctx.runAction(api.githubActions.backfill, {
          projectRepoId: job.projectRepoId,
          githubRepoId: job.githubRepoId,
          fullName: job.fullName,
          since: job.since,
        });
        await ctx.runMutation(internal.backfillQueue.finish, { jobId: job._id, failed: false, error: undefined });
      } catch (e) {
        await ctx.runMutation(internal.backfillQueue.finish, {
          jobId: job._id,
          failed: true,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { processed: jobs.length };
  },
});

export const listPending = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("backfillJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(limit);
  },
});

export const markRunning = internalMutation({
  args: { jobId: v.id("backfillJobs") },
  handler: async (ctx, { jobId }) => {
    await ctx.db.patch(jobId, { status: "running", startedAt: Date.now() });
  },
});

export const finish = internalMutation({
  args: { jobId: v.id("backfillJobs"), failed: v.boolean(), error: v.optional(v.string()) },
  handler: async (ctx, { jobId, failed, error }) => {
    await ctx.db.patch(jobId, {
      status: failed ? "failed" : "done",
      error: error ?? undefined,
    });
  },
});

const crons = cronJobs();
crons.interval("backfill-pump", { seconds: 60 }, internal.backfillQueue.pump);
export default crons;

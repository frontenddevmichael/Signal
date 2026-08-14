import { describe, expect, it } from "vitest";
import { recordGithubActivity } from "../convex/webhooks";

/**
 * §9/§9a STOP-CONDITION tests — the conditional billable default and the
 * write-path rule, proven against the REAL mutation with an in-memory db stub.
 */

interface Row {
  _id: string;
  [k: string]: any;
}

/** Minimal in-memory Convex db for the mutation's handler. */
function makeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Map<string, Row>> = {};
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = new Map(rows.map((r) => [r._id, { ...r }]));
  }
  let n = 0;
  const db = {
    async get(id: string) {
      for (const t of Object.values(tables)) if (t.has(id)) return t.get(id);
      return null;
    },
    async insert(table: string, doc: any) {
      const id = `id-${table}-${++n}`;
      if (!tables[table]) tables[table] = new Map();
      tables[table].set(id, { _id: id, ...doc });
      return id;
    },
    async patch(id: string, patch: Record<string, any>) {
      for (const t of Object.values(tables)) {
        const row = t.get(id);
        if (row) {
          t.set(id, { ...row, ...patch });
          return;
        }
      }
    },
    async delete(id: string) {
      for (const t of Object.values(tables)) t.delete(id);
    },
    query(table: string) {
      const list = [...(tables[table]?.values() ?? [])];
      return {
        withIndex: (_name: string, _fn?: any) => ({
          filter: (_f: any) => ({ collect: async () => list, first: async () => list[0] ?? null }),
          collect: async () => list,
          first: async () => list[0] ?? null,
          order: () => ({ take: async (n: number) => list.slice(0, n) }),
          take: async (n: number) => list.slice(0, n),
        }),
        filter: (_f: any) => ({ collect: async () => list }),
        collect: async () => list,
        first: async () => list[0] ?? null,
        order: () => ({ take: async (n: number) => list.slice(0, n) }),
        take: async (n: number) => list.slice(0, n),
      };
    },
  };
  return { db, tables };
}

function buildCtx(seed: Record<string, Row[]>) {
  const { db, tables } = makeDb(seed);
  return { ctx: { db } as any, tables };
}

const repo = { _id: "repo-1", githubRepoId: 101, connectionStatus: "connected", userId: "u1", fullName: "acme/app" };
const projectA = { _id: "proj-a", contactId: "c-a", status: "active", name: "Acme" };
const projectB = { _id: "proj-b", contactId: "c-b", status: "active", name: "Beta" };
const contactA = { _id: "c-a", userId: "u1", name: "Alice" };
const contactB = { _id: "c-b", userId: "u1", name: "Bob" };
const linkA = { _id: "link-a", projectId: "proj-a", repoId: "repo-1" };
const linkB = { _id: "link-b", projectId: "proj-b", repoId: "repo-1" };

const ACTIVITY = { type: "pr_merged" as const, title: "Ship it", url: "https://github.com/acme/app/pull/9", occurredAt: Date.now() };

describe("githubRecordActivity (§9 — one row per project link, conditional billable)", () => {
  it("single active link → ONE repo_activity row, billable: true, one timeline event, idempotency marker", async () => {
    const { ctx, tables } = buildCtx({ repos: [repo], projects: [projectA], contacts: [contactA], projectRepos: [linkA], processedWebhookEvents: [] });
    const res = await recordGithubActivity(ctx, { githubRepoId: 101, activity: ACTIVITY, deliveryId: "d-1" });

    expect(res.linked).toBe(1);
    const activityRows = [...tables.repoActivity!.values()];
    expect(activityRows).toHaveLength(1);
    expect(activityRows[0].billable).toBe(true); // exactly one active link → billable
    expect(activityRows[0].projectRepoId).toBe("link-a");

    const timeline = [...tables.timelineEvents!.values()];
    expect(timeline).toHaveLength(1);
    expect(timeline[0].contactId).toBe("c-a");
    expect(timeline[0].type).toBe("repo_activity");
    expect(timeline[0].sourceTable).toBe("repoActivity");

    const processed = [...tables.processedWebhookEvents!.values()];
    expect(processed).toHaveLength(1);
    expect(processed[0]).toMatchObject({ provider: "github", externalId: "d-1" });
  });

  it("TWO active links (monorepo) → TWO repo_activity rows, BOTH billable: false, timeline events for both contacts", async () => {
    const { ctx, tables } = buildCtx({
      repos: [repo], projects: [projectA, projectB], contacts: [contactA, contactB],
      projectRepos: [linkA, linkB], processedWebhookEvents: [],
    });
    const res = await recordGithubActivity(ctx, { githubRepoId: 101, activity: ACTIVITY, deliveryId: "d-2" });

    expect(res.linked).toBe(2);
    const activityRows = [...tables.repoActivity!.values()];
    expect(activityRows).toHaveLength(2);
    // §9 flipped default: multi-link → every row opt-IN (billable false).
    expect(activityRows.every((a) => a.billable === false)).toBe(true);

    const timeline = [...tables.timelineEvents!.values()];
    expect(timeline.map((t) => t.contactId).sort()).toEqual(["c-a", "c-b"]);
  });

  it("an inactive second link does NOT count toward the multi-link default", async () => {
    const closed = { ...projectB, status: "closed" };
    const { ctx, tables } = buildCtx({
      repos: [repo], projects: [projectA, closed], contacts: [contactA, contactB],
      projectRepos: [linkA, linkB], processedWebhookEvents: [],
    });
    await recordGithubActivity(ctx, { githubRepoId: 101, activity: ACTIVITY, deliveryId: "d-3" });
    // Only the active project's link gets a row — and it's billable (single active link).
    const activityRows = [...tables.repoActivity!.values()];
    expect(activityRows).toHaveLength(1);
    expect(activityRows[0].billable).toBe(true);
  });

  it("unknown or disconnected repo → nothing written", async () => {
    const disconnected = { ...repo, connectionStatus: "disconnected" };
    const { ctx, tables } = buildCtx({ repos: [disconnected], projects: [projectA], contacts: [contactA], projectRepos: [linkA], processedWebhookEvents: [] });
    const res = await recordGithubActivity(ctx, { githubRepoId: 101, activity: ACTIVITY, deliveryId: "d-4" });
    expect(res.linked).toBe(0);
    expect(tables.repoActivity?.size ?? 0).toBe(0);
  });
});

/**
 * §9a/§20.3/§20.11 GitHub webhook HTTP action, mounted at /github/webhook.
 *
 * Processing order (locked, §20.11): AUTHENTICITY first — reject any request
 * whose X-Hub-Signature-256 doesn't match the App webhook secret, writing
 * nothing. Then IDEMPOTENCY — X-GitHub-Delivery must be new for
 * (provider: github). Then, and only then, process.
 *
 * The core logic lives in the plain `handleGithubWebhook` helper so Vitest can
 * drive it directly with a stubbed mutation runner (see
 * tests/githubWebhook.test.ts) — Convex best practice: shared logic in helper
 * functions, not wrapped functions calling each other.
 */
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyGithubSignature, extractActivity } from "./githubLogic";

type MutationRunner = {
  runMutation: (ref: any, args: any) => Promise<any>;
};

export async function handleGithubWebhook(
  ctx: MutationRunner,
  request: Request,
): Promise<Response> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 500 });

  const rawBody = await request.text();
  const sig = request.headers.get("x-hub-signature-256");
  const deliveryId = request.headers.get("x-github-delivery") ?? "";
  const eventType = request.headers.get("x-github-event") ?? "";

  // 1. AUTHENTICITY — reject before touching the DB. Nothing is written.
  if (!(await verifyGithubSignature(secret, rawBody, sig))) {
    return new Response("Invalid signature", { status: 401 });
  }

  // 2. IDEMPOTENCY — already-processed deliveries get a benign ack.
  const already = await ctx.runMutation(internal.webhooks.githubMarkProcessed, {
    provider: "github",
    externalId: deliveryId,
    checkOnly: true,
  });
  if (already.processed) return new Response("OK", { status: 200 });

  const payload = JSON.parse(rawBody) as Record<string, any>;

  // 3a. Installation lifecycle — §20.3.
  if (eventType === "installation") {
    if (payload.action === "deleted" || payload.action === "suspend") {
      await ctx.runMutation(internal.webhooks.githubInstallationRemoved, {
        installationId: payload.installation?.id,
      });
      await ctx.runMutation(internal.webhooks.githubMarkProcessed, {
        provider: "github",
        externalId: deliveryId,
        checkOnly: false,
      });
    }
    return new Response("OK", { status: 200 });
  }

  if (eventType === "installation_repositories" && payload.action === "removed") {
    const repoIds: number[] = (payload.repositories_removed ?? []).map((r: any) => r.id);
    for (const repoId of repoIds) {
      await ctx.runMutation(internal.webhooks.githubRepoDisconnected, { githubRepoId: repoId });
    }
    await ctx.runMutation(internal.webhooks.githubMarkProcessed, {
      provider: "github",
      externalId: deliveryId,
      checkOnly: false,
    });
    return new Response("OK", { status: 200 });
  }

  // 3b. Activity events — only repos we know about (imported + connected).
  const githubRepoId = payload?.repository?.id;
  if (githubRepoId === undefined) return new Response("OK", { status: 200 });

  const activity = extractActivity(payload);
  if (!activity) {
    // Not recordable activity (e.g. a plain push) — ack and stop.
    await ctx.runMutation(internal.webhooks.githubMarkProcessed, {
      provider: "github",
      externalId: deliveryId,
      checkOnly: false,
    });
    return new Response("OK", { status: 200 });
  }

  const result = await ctx.runMutation(internal.webhooks.githubRecordActivity, {
    githubRepoId,
    activity,
    deliveryId,
  });
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const githubWebhook = httpAction(async (ctx, request) => {
  return await handleGithubWebhook(ctx, request);
});

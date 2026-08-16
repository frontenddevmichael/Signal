/**
 * §17/§20.9 Gmail OAuth connect flow.
 *
 * The callback is a GET httpAction at /gmail/oauth/callback. Google redirects
 * the browser here with ?code=...&state=...; the state (stored on the users row
 * when the authorize URL was minted) is verified against the signed-in user's
 * row — a CSRF guard. The code is exchanged SERVER-SIDE (the refresh token
 * never passes through the browser), encrypted with GMAIL_TOKEN_ENCRYPTION_KEY
 * (§20.9), and stored on users.googleRefreshTokenEncrypted.
 */
import { httpAction, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { encryptToken, encryptionKeyConfigured } from "./tokenCrypto";
import { googleOAuthConfigured, redirectUri } from "./gmailClient";
import { writeAuditLog } from "./audit";

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:5173";
}

export async function handleGmailCallback(ctx: {
  auth: { getUserIdentity: () => Promise<any> };
  runMutation: (ref: any, args: any) => Promise<any>;
}, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const fail = (msg: string) =>
    Response.redirect(`${appUrl()}/settings?gmail=error&msg=${encodeURIComponent(msg)}`, 302);

  if (error) return fail(`google_${error}`);
  if (!code || !state) return fail("missing_code");
  if (!googleOAuthConfigured()) return fail("not_configured");
  if (!encryptionKeyConfigured()) return fail("no_encryption_key");

  let identity: any;
  try {
    identity = await ctx.auth.getUserIdentity();
  } catch {
    // §20.9 boundary: the callback is server-side; without a signed-in session
    // we can't attribute the token to a user. Redirect rather than leak.
    return fail("not_signed_in");
  }
  if (!identity?.email) return fail("not_signed_in");

  // CSRF: the state must match the one we stored for THIS user.
  const user = await ctx.runMutation(api.gmailConnect.verifyState, {
    email: identity.email,
    state,
  });
  if (!user) return fail("state_mismatch");

  // Server-side code exchange — the refresh token never touches the browser.
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("gmail token exchange failed:", res.status, text.slice(0, 300));
    return fail("token_exchange");
  }
  const tokens = (await res.json()) as { refresh_token?: string; access_token?: string };
  if (!tokens.refresh_token) return fail("no_refresh_token");

  const encrypted = await encryptToken(tokens.refresh_token);

  await ctx.runMutation(api.gmailConnect.storeToken, {
    userId: user._id,
    encrypted,
    email: identity.email,
  });

  return Response.redirect(`${appUrl()}/settings?gmail=connected`, 302);
}

export const gmailOauthCallback = httpAction(async (ctx, request) => {
  return await handleGmailCallback(ctx as any, request);
});

/** CSRF check half of the callback: does this user hold this state? */
export const verifyState = mutation({
  args: { email: v.string(), state: v.string() },
  handler: async (ctx, { email, state }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (!user || user.gmailOauthState !== state) return null;
    return { _id: user._id, email: user.email };
  },
});

/** Store the encrypted token (already encrypted server-side in the callback). */
export const storeToken = mutation({
  args: { userId: v.id("users"), encrypted: v.string(), email: v.string() },
  handler: async (ctx, { userId, encrypted, email }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(userId, {
      googleRefreshTokenEncrypted: encrypted,
      gmailOauthState: undefined,
    });
    await writeAuditLog(ctx, {
      userId,
      action: "gmail.connected",
      entityType: "user",
      entityId: userId,
      metadata: { email },
    });
  },
});

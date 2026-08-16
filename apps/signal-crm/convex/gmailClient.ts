/**
 * §17/§20.9 Gmail client — OAuth 2.0 with the `gmail.send` scope ONLY (never
 * read access; that's what keeps this at the sensitive tier, no CASA).
 *
 * Env gates (all set via `npx convex env set`):
 *   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET — the Web client.
 *   GMAIL_TOKEN_ENCRYPTION_KEY — §20.9 symmetric key (see tokenCrypto.ts).
 *
 * Plain fetch + Web Crypto only — no node imports, so this runs in the default
 * action runtime. The refresh token is decrypted HERE (a server-side action),
 * never in a query or the browser — the §20.9 boundary.
 */
import { action, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { decryptToken } from "./tokenCrypto";
import { writeAuditLog } from "./audit";

const SCOPES = "https://www.googleapis.com/auth/gmail.send";

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function redirectUri(siteUrl?: string): string {
  // The callback is an httpAction mounted at /gmail/oauth/callback.
  return `${siteUrl ?? process.env.CONVEX_SITE_URL ?? "http://127.0.0.1:3211"}/gmail/oauth/callback`;
}

/** Pure URL builder — unit-testable. `state` guards the callback against CSRF. */
export function buildAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline", // guarantees a refresh_token on first consent
    prompt: "consent",
    state: args.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function tokenExchange(body: Record<string, string>): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token endpoint ${res.status}: ${text.slice(0, 300)}`);
  }
  return await res.json();
}

export const gmailStatus = query({
  args: {},
  handler: async (ctx): Promise<{ connected: boolean; configured: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { connected: false, configured: googleOAuthConfigured() };
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email ?? ""))
      .first();
    return {
      connected: Boolean(user?.googleRefreshTokenEncrypted),
      configured: googleOAuthConfigured(),
    };
  },
});

/** Step 1 of the connect flow: mint a CSRF state, store it, hand back the URL. */
export const gmailAuthorizeUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");
    if (!googleOAuthConfigured()) {
      throw new Error("Google OAuth is not configured yet (GOOGLE_OAUTH_CLIENT_ID/SECRET).");
    }
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email ?? ""))
      .first();
    if (!user) throw new Error("User not found");
    const state = crypto.randomUUID();
    await ctx.db.patch(user._id, { gmailOauthState: state });
    return {
      url: buildAuthorizeUrl({
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        redirectUri: redirectUri(),
        state,
      }),
    };
  },
});

/** Step 3: disconnect. Clears the token; audit-logged (§21.8). */
export const gmailDisconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email ?? ""))
      .first();
    if (!user) return;
    await ctx.db.patch(user._id, {
      googleRefreshTokenEncrypted: undefined,
      gmailOauthState: undefined,
    });
    await writeAuditLog(ctx, {
      userId: user._id,
      action: "gmail.disconnected",
      entityType: "user",
      entityId: user._id,
      metadata: {},
    });
  },
});

/** §20.9 boundary: decrypt + mint a short-lived access token, INSIDE an action. */
export const gmailAccessToken = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const data = await ctx.runQuery(internal.gmailClient.userForSending, {});
    if (!data) throw new Error("Not signed in or no token stored");
    const decrypted = await decryptToken(data.encrypted);
    const exchanged = await tokenExchange({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: decrypted,
      grant_type: "refresh_token",
    });
    return exchanged.access_token;
  },
});

export const userForSending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email ?? ""))
      .first();
    if (!user?.googleRefreshTokenEncrypted) return null;
    return { encrypted: user.googleRefreshTokenEncrypted, email: user.email };
  },
});

/** Base64url-encode a raw RFC 2822 message for gmail.send. */
export function encodeRawMessage(message: string): string {
  return btoa(unescape(encodeURIComponent(message))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmailMessage(accessToken: string, rawMessage: string): Promise<string> {
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "message/rfc822",
      },
      body: rawMessage,
    }
  );
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(`gmail.send failed: ${json.error?.message ?? res.status}`);
  }
  return json.id;
}

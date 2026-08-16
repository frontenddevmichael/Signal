import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * The current freelancer's users row. Returns null when signed out; used by the
 * shell for theme/timezone preference and the user menu. NEVER returns the raw
 * row — it carries secrets (googleRefreshTokenEncrypted, gmailOauthState CSRF
 * state) that must stay server-side. The connect status is exposed separately
 * via gmailClient.gmailStatus.
 */
export const myUser = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      name: user.name ?? null,
      email: user.email ?? null,
      timezone: user.timezone ?? null,
      themePreference: user.themePreference ?? "system",
      aiTriageEnabled: user.aiTriageEnabled ?? true,
      // Integration presence booleans — enough for the UI to render state, never
      // the secret payloads themselves.
      gmailConnected: Boolean(user.googleRefreshTokenEncrypted),
      githubConnected: user.githubInstallationId != null,
      whatsappConnected: Boolean(user.whatsappBusinessNumber),
    };
  },
});

/**
 * §22.8 dark-mode override, stored on the users row. `system` defers to
 * prefers-color-scheme; light/dark pin the theme.
 */
export const updateThemePreference = mutation({
  args: {
    themePreference: v.union(v.literal("system"), v.literal("light"), v.literal("dark")),
  },
  handler: async (ctx, { themePreference }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    await ctx.db.patch(userId, { themePreference });
  },
});

/**
 * §20.8 — the freelancer's stored IANA timezone, driving dashboard, calendar,
 * and invoice date rendering (lib/format.ts activeTimezone). Defaults to UTC
 * on first sign-in; this is the only place it changes.
 */
export const updateTimezone = mutation({
  args: {
    timezone: v.string(),
  },
  handler: async (ctx, { timezone }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    if (!timezone.trim() || timezone.length > 64) {
      throw new Error("timezone must be a non-empty IANA identifier");
    }
    await ctx.db.patch(userId, { timezone: timezone.trim() });
  },
});

/**
 * Tells the sign-in screen whether Google OAuth is configured server-side, so
 * the button is hidden instead of erroring when AUTH_GOOGLE_ID/SECRET are unset.
 */
export const authConfig = query({
  handler: async () => ({
    googleConfigured: Boolean(
      process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
    ),
  }),
});

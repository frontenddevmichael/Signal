import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * The current freelancer's users row. Returns null when signed out; used by the
 * shell for theme preference and later phases for integration state.
 */
export const myUser = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(userId);
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

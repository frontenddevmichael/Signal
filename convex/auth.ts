import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

/**
 * §20.1 authentication — password only for now (Google OAuth deferred by the
 * user; the provider slots back in below once AUTH_GOOGLE_ID/SECRET exist).
 * Google's gmail.send scope is Phase 4 and will prime the same consent screen.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password,
    // Google OAuth: add back when keys are ready:
    // ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? [Google] : []),
  ],
  callbacks: {
    /**
     * §18 users defaults on first sign-in: timezone UTC (§20.8), theme
     * system (§22.8), ai_triage_enabled on (§6). Only on create — never
     * overwrite a freelancer's choices on later sign-ins.
     */
    afterUserCreatedOrUpdated: async (ctx, { userId, existingUserId }) => {
      if (existingUserId !== null) return;
      await ctx.db.patch(userId, {
        timezone: "UTC",
        themePreference: "system",
        aiTriageEnabled: true,
        createdAt: Date.now(),
      });
    },
  },
});

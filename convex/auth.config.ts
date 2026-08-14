/**
 * Convex Auth credentials config (current format: one credential entry per app
 * identity). The provider NAMES (google/password) are declared in convex/auth.ts;
 * this file carries the auth domain the OAuth callback is served on.
 *
 * Providers in convex/auth.ts: Password always; Google only when
 * AUTH_GOOGLE_ID/SECRET exist (gated server-side).
 *
 * `domain` — production: the deployment's site domain; local: the `convex dev`
 * HTTP actions port (VITE_CONVEX_SITE_URL).
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL || "http://127.0.0.1:3211",
      applicationID: "convex",
    },
  ],
};

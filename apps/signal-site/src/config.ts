/* ============================================================
   config — the SINGLE place to set deploy-time values (spec §3.3).
   PUBLIC_APP_URL: the product's sign-up URL. Until the product
   has a public URL this stays empty and the CTA points at the
   live demo section instead — never a hardcoded fake.
   ============================================================ */

export const APP_URL: string = (import.meta.env.PUBLIC_APP_URL as string | undefined) ?? "";

export const hasAppUrl = APP_URL.length > 0;

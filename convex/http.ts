import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { githubWebhook } from "./githubWebhook";
import { paymentsWebhook } from "./paymentWebhook";
import { gmailOauthCallback } from "./gmailConnect";
import { inboundEmailWebhook } from "./inboundEmail";
import { whatsappWebhook } from "./whatsappWebhook";

/**
 * HTTP routes mounted on the deployment's actions URL:
 * - Convex Auth's OAuth callback / sign-in endpoints (auto-mounted).
 * - /github/webhook — the GitHub App webhook endpoint (§9a/§20.11).
 * - /payments/webhook — Stripe webhook; /payments/webhook/paystack — Paystack
 *   (same handler; the provider is detected by path, §21.4).
 *   Production URL: https://<deployment>.convex.site/payments/webhook
 */
const http = httpRouter();

auth.addHttpRoutes(http);
http.route({
  path: "/github/webhook",
  method: "POST",
  handler: githubWebhook,
});
http.route({
  path: "/payments/webhook",
  method: "POST",
  handler: paymentsWebhook,
});
http.route({
  path: "/payments/webhook/paystack",
  method: "POST",
  handler: paymentsWebhook,
});
http.route({
  path: "/gmail/oauth/callback",
  method: "GET",
  handler: gmailOauthCallback,
});
http.route({
  path: "/inbound/email",
  method: "POST",
  handler: inboundEmailWebhook,
});
http.route({
  path: "/whatsapp/webhook",
  method: "POST",
  handler: whatsappWebhook,
});
http.route({
  path: "/whatsapp/webhook",
  method: "GET",
  handler: whatsappWebhook,
});

export default http;

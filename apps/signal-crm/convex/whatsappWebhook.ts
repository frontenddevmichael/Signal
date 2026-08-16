/**
 * §10/§20.11 WhatsApp Cloud API webhook, mounted at /whatsapp/webhook.
 *
 * GET — the verify handshake Meta requires (hub.mode=subscribe, hub.verify_token
 * must match WHATSAPP_VERIFY_TOKEN, hub.challenge echoed back).
 * POST — messages. Processing order (locked, §20.11): AUTHENTICITY first
 * (X-Hub-Signature-256 vs app secret), then IDEMPOTENCY (message.id), then
 * match by phone → write. Unmatched numbers land in the general inbox with
 * contactId: null, per §10.
 */
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { verifyMetaSignature, extractWhatsAppMessage } from "./whatsappLogic";

type MutationRunner = {
  runMutation: (ref: any, args: any) => Promise<any>;
};

export async function handleWhatsAppWebhook(ctx: MutationRunner, request: Request): Promise<Response> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  // GET — Meta's verification handshake.
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("hub.mode") === "subscribe") {
      const token = url.searchParams.get("hub.verify_token");
      if (token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
      }
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (!appSecret) return new Response("WhatsApp not configured", { status: 500 });
  const rawBody = await request.text();
  const sig = request.headers.get("x-hub-signature-256");
  if (!(await verifyMetaSignature(appSecret, rawBody, sig))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as any;
  const message = extractWhatsAppMessage(payload);
  if (!message) {
    // Status updates / non-message changes — ack and stop.
    return new Response("OK", { status: 200 });
  }

  const dedupe = await ctx.runMutation(api.whatsappMutations.markProcessed, {
    externalId: message.id,
    checkOnly: true,
  });
  if (dedupe.processed) return new Response("OK", { status: 200 });

  const result = await ctx.runMutation(api.whatsappMutations.recordMessage, {
    from: message.from,
    body: message.text,
    occurredAt: Number(message.timestamp) * 1000,
    externalId: message.id,
  });
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const whatsappWebhook = httpAction(async (ctx, request) => {
  return await handleWhatsAppWebhook(ctx, request);
});

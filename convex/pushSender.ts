/**
 * §12 Web Push — node runtime (`"use node"`, like githubClient.ts) because
 * aes128gcm payload encryption and ECDSA JWT signing are far simpler with
 * node:crypto (hkdfSync + ECDH) than hand-rolling Web Crypto equivalents.
 * Env gates: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (a P-256 private key in
 * JWK or PKCS8 PEM), VAPID_SUBJECT.
 */
"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { createPrivateKey, hkdfSync, createECDH, createCipheriv, sign, randomBytes } from "node:crypto";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBuf(s: string): Buffer {
  const pad = s.length % 4 === 0 ? s : s + "=".repeat(4 - (s.length % 4));
  return Buffer.from(pad.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function vapidJwt(): string {
  const privateKey = process.env.VAPID_PRIVATE_KEY!;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@signalapp.com";
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: "https://fcm.googleapis.com", exp: now + 12 * 3600, sub: subject };
  const signingInput = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(payload)))}`;
  const key = privateKey.trim().startsWith("{")
    ? createPrivateKey({ key: JSON.parse(privateKey), format: "jwk" })
    : createPrivateKey(privateKey);
  const sig = sign(null, Buffer.from(signingInput), key as any);
  // Node's ECDSA sig is DER; JWT needs raw r||s (64 bytes).
  const r = sig.subarray(6, 6 + sig[3]);
  const s = sig.subarray(sig.length - sig[sig.length - 3] - 2, sig.length - 2);
  return `${signingInput}.${b64url(Buffer.concat([r, s]))}`;
}

/** RFC 8188 aes128gcm payload encryption (the web-push content encoding). */
function encryptPayload(p256dh: string, authSecret: string, plaintext: Buffer): Buffer {
  const clientPub = b64urlToBuf(p256dh);
  const auth = b64urlToBuf(authSecret);
  const salt = randomBytes(16);
  const server = createECDH("prime256v1");
  server.generateKeys();
  const shared = Buffer.from(server.computeSecret(clientPub));
  const keyInfo = Buffer.from("WebPush: info\0", "utf8");
  const prk = Buffer.from(hkdfSync("sha256", shared, auth, Buffer.from("Content-Encoding: auth\0", "utf8"), 32));
  const cek = Buffer.from(hkdfSync("sha256", prk, Buffer.concat([keyInfo, clientPub, server.getPublicKey()]), Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", prk, Buffer.concat([keyInfo, clientPub, server.getPublicKey()]), Buffer.from("Content-Encoding: nonce\0", "utf8"), 12));
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const pad = Buffer.from([0, 0]); // 16-bit pad length = 0
  const ct = Buffer.concat([cipher.update(Buffer.concat([pad, plaintext])), cipher.final(), cipher.getAuthTag()]);
  // aes128gcm record: salt (16) + rs (4) + idlen (1) + keyid (0) + ciphertext
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([0]), server.getPublicKey(), ct]);
}

export const send = action({
  args: {
    subscriptions: v.array(
      v.object({ endpoint: v.string(), p256dh: v.string(), auth: v.string() })
    ),
    title: v.string(),
    body: v.string(),
  },
  handler: async (_ctx, { subscriptions, title, body }): Promise<{ sent: number }> => {
    const publicKey = process.env.VAPID_PUBLIC_KEY!;
    const token = vapidJwt();
    const payload = encryptPayload(subscriptions[0].p256dh, subscriptions[0].auth, Buffer.from(JSON.stringify({ title, body })));
    const authHeader = `vapid t=${token}, k=${publicKey}`;
    let sent = 0;
    for (const sub of subscriptions) {
      try {
        const res = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/octet-stream",
            TTL: "3600",
            "Content-Encoding": "aes128gcm",
          },
          body: payload as any,
        });
        if (res.ok) sent++;
      } catch {
        // Dead endpoint — skip; pruning subscriptions is future work.
      }
    }
    return { sent };
  },
});

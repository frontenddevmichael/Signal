/**
 * §20.9 token security at rest — application-layer encryption for the Gmail
 * refresh token. Pure functions, Web Crypto only (no node imports so this is
 * importable in tests AND in non-node Convex files for type purposes).
 *
 * BOUNDARY (enforced by import discipline, reviewed at the Phase 4 gate):
 *  - ENCRYPT: called in the OAuth connect action before writing to users.
 *  - DECRYPT: called ONLY inside `"use node"` actions (gmailClient.ts) right
 *    before an API call. Never in a query, never in a mutation, never in the
 *    browser. The key lives in Convex env (GMAIL_TOKEN_ENCRYPTION_KEY), never
 *    in the database or the client bundle.
 */

export function encryptionKeyConfigured(): boolean {
  return Boolean(process.env.GMAIL_TOKEN_ENCRYPTION_KEY);
}

export function getEncryptionKey(): string {
  const key = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is not configured.");
  return key;
}

/**
 * AES-256-GCM encrypt. Returns "v1.<iv b64>.<ciphertext+tag b64>".
 * The key material is hex/base64 text; we derive a 32-byte key via SHA-256 so
 * any reasonable secret length works.
 */
export async function encryptToken(plaintext: string, keyMaterial?: string): Promise<string> {
  const material = keyMaterial ?? getEncryptionKey();
  const key = await deriveKey(material);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(ciphertext);
  return `v1.${b64(iv)}.${b64(combined)}`;
}

/** Inverse of encryptToken. Throws on tamper or wrong key (GCM auth tag). */
export async function decryptToken(payload: string, keyMaterial?: string): Promise<string> {
  const material = keyMaterial ?? getEncryptionKey();
  const key = await deriveKey(material);
  const [version, ivB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !dataB64) {
    throw new Error("Unrecognized encrypted token format.");
  }
  const iv = fromB64(ivB64);
  const data = fromB64(dataB64);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

async function deriveKey(material: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  // digest is ArrayBuffer (not SharedArrayBuffer) — narrow the type so it
  // satisfies Web Crypto's BufferSource (TS libdom strictness on Uint8Array).
  const raw = new Uint8Array(digest as ArrayBuffer);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function b64(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  // Web Crypto's BufferSource requires ArrayBuffer-backed views; fresh
  // Uint8Array over a fresh ArrayBuffer qualifies.
  return new Uint8Array(out.buffer as ArrayBuffer);
}

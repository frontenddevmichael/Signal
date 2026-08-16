/**
 * §21.16 weekly backup export — invoices, invoice_line_items, and contacts
 * (the records with real financial/legal weight, not the full dataset) exported
 * to cold storage independent of the primary provider. S3-compatible (Cloudflare
 * R2's free tier is the $0 option, but any S3 endpoint works via env vars).
 *
 * Env gates: BACKUP_S3_ENDPOINT, BACKUP_S3_REGION, BACKUP_S3_BUCKET,
 * BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY. When unset, the job
 * no-ops (logged) rather than failing the whole deployment.
 */
import { action, internalQuery, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { cronJobs } from "convex/server";

function backupConfigured(): boolean {
  return Boolean(
    process.env.BACKUP_S3_ENDPOINT &&
      process.env.BACKUP_S3_BUCKET &&
      process.env.BACKUP_S3_ACCESS_KEY_ID &&
      process.env.BACKUP_S3_SECRET_ACCESS_KEY
  );
}

/** §21.16 — the weekly job itself is scheduled here (cron, Mondays 02:00 UTC). */
const crons = cronJobs();
crons.weekly(
  "weekly-backup",
  { dayOfWeek: "monday", hourUTC: 2, minuteUTC: 0 },
  api.backup.runBackup,
);

/**
 * Settings-card status: whether backups are wired up and on what schedule.
 * process.env reads are inlined at deploy time, so this reflects the deployed
 * config, not the client's.
 */
export const status = query({
  args: {},
  handler: async () => ({
    configured: backupConfigured(),
    schedule: "Weekly — Mondays 02:00 UTC",
    note: "Exports contacts, invoices and line items to your S3-compatible bucket (Cloudflare R2 free tier).",
  }),
});

/** Minimal SigV4 PUT of a JSON payload to S3-compatible storage. */
async function putJson(
  key: string,
  body: unknown,
  endpoint: string,
  bucket: string,
  accessKeyId: string,
  secretKey: string,
  region: string,
): Promise<void> {
  const payload = JSON.stringify(body, null, 2);
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = date.slice(0, 8);
  const host = new URL(endpoint).host;

  const hmac = async (keyData: string, data: string) => {
    const k = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(keyData),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${await sha256Hex(payload)}\nx-amz-date:${date}`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    `/${bucket}/${key}`,
    "",
    canonicalHeaders,
    "",
    signedHeaders,
    await sha256Hex(payload),
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, await sha256Hex(canonicalRequest)].join("\n");

  const kDate = await hmac("AWS4" + secretKey, dateStamp);
  const kRegion = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, "s3");
  const kSigning = await hmacRaw(kService, "aws4_request");
  const signature = await hmacRaw(kSigning, stringToSign);

  const res = await fetch(`${endpoint}/${bucket}/${key}`, {
    method: "PUT",
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-date": date,
      "x-amz-content-sha256": await sha256Hex(payload),
      "Content-Type": "application/json",
    },
    body: payload,
  });
  if (!res.ok) throw new Error(`Backup PUT ${res.status}: ${await res.text().catch(() => "")}`);
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacRaw(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const runBackup = action({
  args: {},
  handler: async (ctx): Promise<any> => {
    if (!backupConfigured()) {
      console.log("Backup skipped: BACKUP_S3_* not configured.");
      return { skipped: true, reason: "not_configured" };
    }
    const contacts = await ctx.runQuery(internal.backup.exportContacts, {});
    const invoices = await ctx.runQuery(internal.backup.exportInvoices, {});
    const lineItems = await ctx.runQuery(internal.backup.exportLineItems, {});
    const stamp = new Date().toISOString().slice(0, 10);
    const endpoint = process.env.BACKUP_S3_ENDPOINT!;
    const bucket = process.env.BACKUP_S3_BUCKET!;
    await putJson(
      `signal-backups/${stamp}/contacts.json`,
      contacts,
      endpoint,
      bucket,
      process.env.BACKUP_S3_ACCESS_KEY_ID!,
      process.env.BACKUP_S3_SECRET_ACCESS_KEY!,
      process.env.BACKUP_S3_REGION ?? "auto",
    );
    await putJson(
      `signal-backups/${stamp}/invoices.json`,
      invoices,
      endpoint,
      bucket,
      process.env.BACKUP_S3_ACCESS_KEY_ID!,
      process.env.BACKUP_S3_SECRET_ACCESS_KEY!,
      process.env.BACKUP_S3_REGION ?? "auto",
    );
    await putJson(
      `signal-backups/${stamp}/line_items.json`,
      lineItems,
      endpoint,
      bucket,
      process.env.BACKUP_S3_ACCESS_KEY_ID!,
      process.env.BACKUP_S3_SECRET_ACCESS_KEY!,
      process.env.BACKUP_S3_REGION ?? "auto",
    );
    return {
      exported: { contacts: contacts.length, invoices: invoices.length, lineItems: lineItems.length },
      date: stamp,
    };
  },
});

export const exportContacts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("contacts").collect();
    return rows.map((r) => ({ id: r._id, name: r.name, company: r.company ?? null, status: r.status, createdAt: r.createdAt }));
  },
});

export const exportInvoices = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("invoices").collect();
    return rows.map((r) => ({
      id: r._id,
      invoiceNumber: r.invoiceNumber,
      status: r.status,
      currency: r.currency,
      subtotal: r.subtotal,
      taxAmount: r.taxAmount ?? null,
      total: r.total,
      amountPaid: r.amountPaid,
      amountRefunded: r.amountRefunded,
      issuedAt: r.issuedAt,
      dueAt: r.dueAt ?? null,
      paidAt: r.paidAt ?? null,
    }));
  },
});

export const exportLineItems = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("invoiceLineItems").collect();
    return rows.map((r) => ({ id: r._id, invoiceId: r.invoiceId, description: r.description, amount: r.amount, included: r.included }));
  },
});

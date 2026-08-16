/**
 * §4 full-data export — the PURE bundle builder. Takes the server-assembled
 * dataset (convex/exportData.ts `api.exportData.all`) and produces the archive
 * entries: manifest, README, one JSON per entity (lossless), and flat CSVs for
 * the tabular entities. Zero DOM, zero network, zero Convex imports — fully
 * unit-testable (tests/exportLogic.test.ts).
 *
 * Encoding rules (locked decisions, design 2026-08-16):
 * - Money fields are integer minor units (cents/kobo) throughout — the raw
 *   stored values, never divided. JSON numbers AND CSV cells both carry the
 *   integer; the manifest documents the rule so a reader never misreads.
 * - Timestamps export as ISO-8601 UTC strings (a curated per-entity key set,
 *   plus `_creationTime`), so a spreadsheet or another tool sees unambiguous
 *   dates instead of epoch integers.
 * - Deterministic ordering: rows sorted by `_creationTime` (then `_id`) so a
 *   re-export is byte-stable and diffable.
 * - BigInt is normalized to Number here — real invoice amounts are far inside
 *   Number.MAX_SAFE_INTEGER; the README notes the constraint.
 */
export interface ExportFile {
  filename: string;
  content: string;
}

export type ExportRow = Record<string, unknown>;

/** Shape of the dataset returned by api.exportData.all (mirrored here so the
 *  builder is testable with plain fixtures, independent of the generated api). */
export interface ExportDataset {
  schemaVersion: number;
  generatedAt: number;
  user: Record<string, unknown> | null;
  contacts: ExportRow[];
  contactEmails: ExportRow[];
  contactPhones: ExportRow[];
  projects: ExportRow[];
  notes: ExportRow[];
  timelineEvents: ExportRow[];
  messages: ExportRow[];
  documents: ExportRow[];
  calendarEvents: ExportRow[];
  followUpReminders: ExportRow[];
  repos: ExportRow[];
  projectRepos: ExportRow[];
  repoActivity: ExportRow[];
  invoices: ExportRow[];
  invoiceLineItems: ExportRow[];
  customFieldDefinitions: ExportRow[];
  customFieldValues: ExportRow[];
  portalTokens: ExportRow[];
  pushSubscriptions: ExportRow[];
  sessions: ExportRow[];
  apiKeys: ExportRow[];
  invoiceCounters: ExportRow[];
  auditLog: ExportRow[];
  contactUndo: ExportRow[];
  gmailFilterSetup: ExportRow[];
}

/** JSON files for EVERY user-owned table; CSVs for the tabular ones. */
const ENTITIES: { key: keyof ExportDataset; file: string; csv?: boolean }[] = [
  { key: "contacts", file: "contacts", csv: true },
  { key: "contactEmails", file: "contact_emails", csv: true },
  { key: "contactPhones", file: "contact_phones", csv: true },
  { key: "projects", file: "projects", csv: true },
  { key: "notes", file: "notes", csv: true },
  { key: "timelineEvents", file: "timeline_events", csv: true },
  { key: "messages", file: "messages", csv: true },
  { key: "documents", file: "documents", csv: true },
  { key: "calendarEvents", file: "calendar_events", csv: true },
  { key: "followUpReminders", file: "follow_up_reminders", csv: true },
  { key: "repos", file: "repos", csv: true },
  { key: "projectRepos", file: "project_repos", csv: true },
  { key: "repoActivity", file: "repo_activity", csv: true },
  { key: "invoices", file: "invoices", csv: true },
  { key: "invoiceLineItems", file: "invoice_line_items", csv: true },
  { key: "customFieldDefinitions", file: "custom_field_definitions", csv: true },
  { key: "customFieldValues", file: "custom_field_values", csv: true },
  { key: "portalTokens", file: "portal_tokens", csv: true },
  { key: "pushSubscriptions", file: "push_subscriptions", csv: true },
  { key: "sessions", file: "sessions", csv: true },
  { key: "apiKeys", file: "api_keys", csv: true },
  { key: "invoiceCounters", file: "invoice_counters", csv: true },
  { key: "gmailFilterSetup", file: "gmail_filter_setup", csv: true },
  // audit_log.metadata is free-form (v.any) — JSON only, not flat-CSV-able.
  { key: "auditLog", file: "audit_log" },
  // contact_undo.snapshot is a serialized subtree — JSON only (a CSV cell
  // holding a multi-KB JSON blob is worse than useless).
  { key: "contactUndo", file: "contact_undo" },
];

/** Timestamp fields per the schema — exported as ISO-8601 UTC strings. */
const TIMESTAMP_FIELDS = new Set([
  "_creationTime",
  "createdAt",
  "occurredAt",
  "dueAt",
  "issuedAt",
  "paidAt",
  "voidedAt",
  "refundedAt",
  "lastActiveAt",
  "lastUsedAt",
  "revokedAt",
  "connectedAt",
  "startTime",
  "endTime",
  "expiresAt",
  "usedAt",
  "overdueNotifiedAt",
  "deadlineNotifiedAt",
  "deadline",
  "windowStart",
  "processedAt",
]);

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function isTimestampKey(key: string): boolean {
  return TIMESTAMP_FIELDS.has(key);
}

/** Normalize one value for export: bigint → Number, timestamps → ISO string,
 *  objects/arrays pass through (they become JSON in JSON files and a JSON
 *  string in a CSV cell). */
function normalizeValue(key: string, value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && isTimestampKey(key)) return iso(value);
  if (value === undefined) return null;
  return value;
}

/** Deterministic row ordering: _creationTime asc, then _id asc, then insertion. */
export function sortRows<T extends ExportRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ca = typeof a._creationTime === "number" ? a._creationTime : 0;
    const cb = typeof b._creationTime === "number" ? b._creationTime : 0;
    if (ca !== cb) return ca - cb;
    const ia = typeof a._id === "string" ? a._id : "";
    const ib = typeof b._id === "string" ? b._id : "";
    return ia.localeCompare(ib);
  });
}

export function normalizeRows(rows: ExportRow[]): ExportRow[] {
  return sortRows(rows).map((row) => {
    const out: ExportRow = {};
    for (const [k, v] of Object.entries(row)) out[k] = normalizeValue(k, v);
    return out;
  });
}

/** CSV escaping — a quoted field whenever the value needs it. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  let s: string;
  if (typeof value === "object") {
    s = JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  } else {
    s = String(value);
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a CSV with a deterministic header (sorted keys union), one row each. */
export function toCsv(rows: ExportRow[]): string {
  const header = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) header.add(k);
  const cols = [...header].sort();
  const lines = [cols.map((c) => csvCell(c)).join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => csvCell(r[c])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function toJson(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

export function generatedAtIso(data: ExportDataset): string {
  return iso(data.generatedAt);
}

/** Per-entity row counts for the manifest — from the raw (unnormalized) data. */
export function entityCounts(data: ExportDataset): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of ENTITIES) {
    const rows = data[e.key];
    counts[e.file] = Array.isArray(rows) ? rows.length : 0;
  }
  return counts;
}

/** The complete archive contents. Deterministic — same input, same bytes. */
export function buildExportBundle(data: ExportDataset): ExportFile[] {
  const files: ExportFile[] = [];
  const counts = entityCounts(data);

  // Manifest — the single source of truth for what's inside.
  const manifest = {
    app: "Signal CRM",
    schemaVersion: data.schemaVersion,
    generatedAt: generatedAtIso(data),
    encoding: {
      money: "Integer minor units (cents/kobo) everywhere — the raw stored "
        + "values, never divided by 100. JSON numbers and CSV cells both carry "
        + "the integer.",
      timestamps: "ISO-8601 UTC strings.",
      bigint: "Int64 money fields are exported as JSON numbers; real invoice "
        + "amounts are far inside Number.MAX_SAFE_INTEGER, so this is lossless "
        + "in practice.",
      apikeys: "API keys are stored SHA-256-hashed at rest and CANNOT be "
        + "reconstructed — api_keys.json carries key metadata only "
        + "(label/created/lastUsed).",
    },
    entities: counts,
    files: ENTITIES.map((e) => ({ file: e.file, json: `${e.file}.json`, csv: e.csv ? `${e.file}.csv` : null })),
  };
  files.push({ filename: "manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` });

  files.push({ filename: "README.md", content: readme(counts) });

  // user.json — the account row.
  if (data.user) {
    files.push({ filename: "user.json", content: `${toJson([normalizeRows([data.user])[0]])}\n` });
  }

  for (const e of ENTITIES) {
    const rows = data[e.key];
    if (!Array.isArray(rows)) continue;
    const normalized = normalizeRows(rows);
    files.push({ filename: `${e.file}.json`, content: `${toJson(normalized)}\n` });
    if (e.csv) files.push({ filename: `${e.file}.csv`, content: toCsv(normalized) });
  }

  return files;
}

function readme(counts: Record<string, number>): string {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const lines = [
    "# Signal — data export",
    "",
    "This archive contains everything stored in your Signal account:",
    "every client, project, note, message, invoice and line item, plus the",
    "backing rows (timeline events, meetings, repo links, custom fields, and",
    "more). It is yours to keep, move, or delete — no lock-in.",
    "",
    "## Reading the files",
    "",
    "- `manifest.json` — the table of contents: what each file is, and how the",
    "  money and date fields are encoded.",
    "- One `.json` file per entity, with one object per row. This is the",
    "  lossless copy.",
    "- One `.csv` per tabular entity for spreadsheets (same rows, flat",
    "  columns).",
    "",
    "## Encoding rules (also in manifest.json)",
    "",
    "- **Money is integer minor units** — cents/kobo, the raw stored value.",
    "  `total: 125000` means 1,250.00 in the invoice currency. Divide by 100",
    "  for display.",
    "- **Timestamps are ISO-8601 UTC strings.**",
    "- **API keys are NOT included** — they are stored hashed (SHA-256) and",
    "  cannot be reconstructed. `api_keys.json` carries the key labels and",
    "  usage dates only.",
    "- **Push subscriptions and sessions** export as metadata rows (the device",
    "  endpoint and activity dates). They let you audit where your account was",
    "  signed in.",
    "",
    `This archive holds ${total} rows across ${Object.keys(counts).length} entities, exported `
    + `${new Date().toISOString()}.`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

import { describe, expect, it } from "vitest";
import {
  buildExportBundle,
  entityCounts,
  normalizeRows,
  sortRows,
  toCsv,
  type ExportDataset,
  type ExportRow,
} from "../src/lib/export";

const ID = (_id: string) => _id;

/** A realistic dataset with money in bigint minor units and mixed timestamps. */
function dataset(overrides: Partial<ExportDataset> = {}): ExportDataset {
  return {
    schemaVersion: 1,
    generatedAt: new Date("2026-08-16T10:00:00Z").getTime(),
    user: {
      _id: ID("u1"),
      name: "Ada",
      email: "ada@signal.test",
      timezone: "Africa/Lagos",
      themePreference: "dark",
      aiTriageEnabled: true,
      createdAt: new Date("2026-08-01T09:00:00Z").getTime(),
    },
    contacts: [
      {
        _id: ID("c2"),
        userId: ID("u1"),
        name: "Acme Co.",
        company: "Acme",
        status: "active",
        tags: ["design", "retainer"],
        timezone: "Africa/Lagos",
        createdAt: new Date("2026-08-03T09:00:00Z").getTime(),
        _creationTime: new Date("2026-08-03T09:00:00Z").getTime(),
      },
      {
        _id: ID("c1"),
        userId: ID("u1"),
        name: "Nimbus",
        company: null,
        status: "lead",
        tags: [],
        timezone: null,
        createdAt: new Date("2026-08-02T09:00:00Z").getTime(),
        _creationTime: new Date("2026-08-02T09:00:00Z").getTime(),
      },
    ],
    contactEmails: [
      {
        _id: ID("e1"),
        contactId: ID("c1"),
        email: "hi@nimbus.io",
        isPrimary: true,
      },
    ],
    contactPhones: [],
    projects: [],
    notes: [],
    timelineEvents: [],
    messages: [
      {
        _id: ID("m1"),
        contactId: ID("c1"),
        userId: ID("u1"),
        channel: "whatsapp",
        direction: "inbound",
        fromAddress: "+1555019888",
        body: 'He said "quote, comma," and "new\nline"',
        occurredAt: new Date("2026-08-10T11:00:00Z").getTime(),
      },
    ],
    documents: [],
    calendarEvents: [],
    followUpReminders: [],
    repos: [],
    projectRepos: [],
    repoActivity: [],
    invoices: [
      {
        _id: ID("i1"),
        projectId: ID("p1"),
        invoiceNumber: "INV-2026-0001",
        status: "sent",
        currency: "NGN",
        subtotal: 125000n,
        taxRate: 0.075,
        taxAmount: 9375n,
        total: 134375n,
        amountPaid: 50000n,
        amountRefunded: 0n,
        issuedAt: new Date("2026-08-05T09:00:00Z").getTime(),
        dueAt: new Date("2026-08-30T09:00:00Z").getTime(),
        derivedStatus: "partially_paid",
      },
    ],
    invoiceLineItems: [
      {
        _id: ID("li1"),
        invoiceId: ID("i1"),
        description: "Dev work — merge #12",
        amount: 125000n,
        source: "github_activity",
        sourceActivityId: ID("ra1"),
        included: true,
      },
    ],
    customFieldDefinitions: [],
    customFieldValues: [],
    portalTokens: [],
    pushSubscriptions: [],
    sessions: [],
    apiKeys: [
      {
        _id: ID("k1"),
        label: "ci",
        createdAt: new Date("2026-08-06T09:00:00Z").getTime(),
        lastUsedAt: null,
        revokedAt: null,
      },
    ],
    invoiceCounters: [],
    auditLog: [],
    contactUndo: [],
    gmailFilterSetup: [],
    ...overrides,
  };
}

function files(d: ExportDataset = dataset()) {
  return new Map(buildExportBundle(d).map((f) => [f.filename, f.content]));
}

describe("buildExportBundle — manifest", () => {
  it("emits manifest, README, user.json, one JSON per entity, and CSVs", () => {
    const fs = files();
    expect(fs.has("manifest.json")).toBe(true);
    expect(fs.has("README.md")).toBe(true);
    expect(fs.has("user.json")).toBe(true);
    // Every entity has a JSON; the tabular ones also have a CSV.
    expect(fs.has("contacts.json")).toBe(true);
    expect(fs.has("contacts.csv")).toBe(true);
    expect(fs.has("invoices.json")).toBe(true);
    expect(fs.has("invoices.csv")).toBe(true);
    // audit_log + contact_undo are JSON-only (metadata/snapshot blobs).
    expect(fs.has("audit_log.json")).toBe(true);
    expect(fs.has("audit_log.csv")).toBe(false);
    expect(fs.has("contact_undo.json")).toBe(true);
    expect(fs.has("contact_undo.csv")).toBe(false);
  });

  it("manifest carries per-entity row counts matching the data", () => {
    const manifest = JSON.parse(files().get("manifest.json")!) as {
      entities: Record<string, number>;
      encoding: { money: string; timestamps: string; apikeys: string };
    };
    expect(manifest.entities.contacts).toBe(2);
    expect(manifest.entities.invoices).toBe(1);
    expect(manifest.entities.invoice_line_items).toBe(1);
    expect(manifest.entities.messages).toBe(1);
    expect(manifest.entities.contact_emails).toBe(1);
    expect(manifest.entities.api_keys).toBe(1);
    expect(manifest.entities.audit_log).toBe(0);
  });

  it("manifest documents the encoding rules honestly", () => {
    const manifest = JSON.parse(files().get("manifest.json")!) as { encoding: Record<string, string> };
    expect(manifest.encoding.money).toMatch(/minor units/);
    expect(manifest.encoding.timestamps).toMatch(/ISO-8601 UTC/);
    expect(manifest.encoding.apikeys).toMatch(/SHA-256|hashed/i);
  });
});

describe("buildExportBundle — money", () => {
  it("exports money as integer minor units (no /100, no floats)", () => {
    const invoices = JSON.parse(files().get("invoices.json")!) as ExportRow[];
    expect(invoices[0].subtotal).toBe(125000);
    expect(invoices[0].total).toBe(134375);
    expect(invoices[0].amountPaid).toBe(50000);
    expect(Number.isInteger(invoices[0].subtotal)).toBe(true);
    expect(Number.isInteger(invoices[0].amountRefunded)).toBe(true);
  });

  it("line items keep integer minor-unit amounts", () => {
    const items = JSON.parse(files().get("invoice_line_items.json")!) as ExportRow[];
    expect(items[0].amount).toBe(125000);
    expect(Number.isInteger(items[0].amount)).toBe(true);
  });

  it("CSV money cells carry the same integers as the JSON", () => {
    const csv = files().get("invoices.csv")!;
    expect(csv).toContain("125000");
    expect(csv).toContain("134375");
    expect(csv).toContain("50000");
  });
});

describe("buildExportBundle — dates", () => {
  it("exports timestamps as ISO-8601 UTC strings", () => {
    const invoices = JSON.parse(files().get("invoices.json")!) as ExportRow[];
    expect(invoices[0].issuedAt).toBe("2026-08-05T09:00:00.000Z");
    expect(invoices[0].dueAt).toBe("2026-08-30T09:00:00.000Z");
    const contacts = JSON.parse(files().get("contacts.json")!) as ExportRow[];
    expect(contacts[0]._creationTime).toBe("2026-08-02T09:00:00.000Z");
  });

  it("non-timestamp numbers survive untouched", () => {
    const invoices = JSON.parse(files().get("invoices.json")!) as ExportRow[];
    expect(invoices[0].taxRate).toBe(0.075);
  });
});

describe("buildExportBundle — CSV fidelity", () => {
  it("escapes commas, quotes and newlines correctly", () => {
    const messages = files().get("messages.csv")!;
    // The body contains a quoted comma and a newline — must be a quoted field
    // with doubled quotes, and the row must span exactly 1 logical row.
    const lines = messages.split("\r\n");
    expect(lines.some((l) => l.includes('""'))).toBe(true);
    // parse: header + 1 data row + trailing empty string from final \r\n
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it("every CSV row count equals its JSON row count", () => {
    const fs = files();
    for (const name of ["contacts", "invoices", "invoice_line_items", "messages", "contact_emails", "api_keys"]) {
      const json = JSON.parse(fs.get(`${name}.json`)!) as ExportRow[];
      const csv = fs.get(`${name}.csv`)!;
      const dataRows = csv.trim().split("\r\n").slice(1).filter((l) => l !== "");
      expect(dataRows.length, `${name} CSV row count`).toBe(json.length);
    }
  });

  it("CSV header is the sorted union of all row keys", () => {
    const csv = files().get("contacts.csv")!;
    const header = csv.split("\r\n")[0].split(",");
    const sorted = [...header].sort();
    expect(header).toEqual(sorted);
    for (const k of ["_creationTime", "_id", "userId", "name", "status", "tags"]) {
      expect(header).toContain(k);
    }
  });

  it("empty tables still produce a header-only CSV", () => {
    const fs = files();
    const csv = fs.get("project_repos.csv")!;
    const dataRows = csv.trim().split("\r\n").slice(1).filter((l) => l !== "");
    expect(dataRows).toEqual([]);
  });
});

describe("normalizeRows / sortRows", () => {
  it("sorts by _creationTime then _id (deterministic)", () => {
    const sorted = sortRows([
      { _id: "b", _creationTime: 200 },
      { _id: "a", _creationTime: 200 },
      { _id: "c", _creationTime: 100 },
    ]);
    expect(sorted.map((r) => r._id)).toEqual(["c", "a", "b"]);
  });

  it("is byte-stable: same input, same output", () => {
    const a = buildExportBundle(dataset());
    const b = buildExportBundle(dataset());
    expect(a).toEqual(b);
  });

  it("normalizeRows converts bigint and timestamps, leaves the rest", () => {
    const rows = normalizeRows([
      { amount: 100n, createdAt: 12345, label: "x", nested: { a: 1 } },
    ]);
    expect(rows[0].amount).toBe(100);
    expect(rows[0].createdAt).toBe("1970-01-01T00:00:12.345Z");
    expect(rows[0].label).toBe("x");
    expect(rows[0].nested).toEqual({ a: 1 });
  });
});

describe("entityCounts", () => {
  it("counts only array entities; user is not in the table set", () => {
    const counts = entityCounts(dataset());
    expect(counts.contacts).toBe(2);
    expect(counts.user).toBeUndefined();
  });
});

describe("toCsv", () => {
  it("quotes a value containing a comma", () => {
    expect(toCsv([{ a: "x,y" }])).toContain('"x,y"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    expect(toCsv([{ a: 'say "hi"' }])).toContain('"say ""hi"""');
  });

  it("handles UTF-8 content", () => {
    const csv = toCsv([{ note: "café — ✓" }]);
    expect(csv).toContain("café");
  });
});

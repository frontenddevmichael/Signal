import { describe, expect, it } from "vitest";
import {
  deserializeSnapshot,
  planDeleteRestore,
  planMergeUndo,
  serializeSnapshot,
  stripForInsert,
} from "../convex/undoLogic";
import type { DeleteSnapshot, MergeSnapshot } from "../convex/undoLogic";

const OLD_CONTACT = "contact-old";
const OLD_PROJECT = "project-old";
const OLD_INVOICE = "invoice-old";

function deleteSnapshot(): DeleteSnapshot {
  return {
    kind: "delete",
    contact: { _id: OLD_CONTACT, userId: "u1", name: "Acme", tags: [] },
    emails: [{ _id: "email-old", contactId: OLD_CONTACT, email: "a@b.com", isPrimary: true }],
    phones: [],
    messages: [],
    documents: [
      { _id: "doc-old", contactId: OLD_CONTACT, projectId: OLD_PROJECT, type: "proposal", provider: "pdf", providerRef: "r", status: "draft", createdAt: 1 },
    ],
    calendarEvents: [],
    followUpReminders: [],
    timelineEvents: [],
    contactNotes: [{ _id: "note-contact", contactId: OLD_CONTACT, body: "hi", createdAt: 1 }],
    contactCfv: [{ _id: "cfv-contact", entityId: OLD_CONTACT, entityType: "contact", value: "x" }],
    projects: [
      {
        data: { _id: OLD_PROJECT, contactId: OLD_CONTACT, name: "Website", status: "active", createdAt: 1 },
        notes: [{ _id: "note-proj", contactId: OLD_CONTACT, projectId: OLD_PROJECT, body: "work", createdAt: 2 }],
        cfv: [{ _id: "cfv-proj", entityId: OLD_PROJECT, entityType: "project", value: "y" }],
        links: [{ _id: "link-old", projectId: OLD_PROJECT, repoId: "repo-stays" }],
        invoices: [
          {
            data: { _id: OLD_INVOICE, projectId: OLD_PROJECT, invoiceNumber: "INV-1", status: "draft", currency: "USD", subtotal: 125000n, total: 125000n, amountPaid: 0n, amountRefunded: 0n },
            lineItems: [{ _id: "li-old", invoiceId: OLD_INVOICE, description: "build", amount: 125000n, source: "manual", included: true }],
          },
        ],
      },
    ],
  };
}

describe("serializeSnapshot (§23.3 — bigint-safe round trip)", () => {
  it("round-trips int64 money fields losslessly", () => {
    const snap = deleteSnapshot();
    const raw = serializeSnapshot(snap);
    expect(raw).toContain("$bigint");
    const back = deserializeSnapshot<DeleteSnapshot>(raw);
    expect(back.projects[0].invoices[0].data.total).toBe(125000n);
    expect(back.projects[0].invoices[0].lineItems[0].amount).toBe(125000n);
  });
});

describe("stripForInsert", () => {
  it("drops Convex-internal fields but keeps data", () => {
    const out = stripForInsert({ _id: "x", _creationTime: 5, name: "Acme" });
    expect(out).toEqual({ name: "Acme" });
    expect("_id" in out).toBe(false);
  });
});

describe("planDeleteRestore (§23.3 — ordered, FK-remapped inserts)", () => {
  it("inserts parents before children, remapping every FK", () => {
    const ids = {
      contactId: "contact-new",
      projectIds: new Map([[OLD_PROJECT, "project-new"]]),
      invoiceIds: new Map([[OLD_INVOICE, "invoice-new"]]),
    };
    const ops = planDeleteRestore(deleteSnapshot(), ids);

    // Parents precede their children. (Contact-level notes may come before
    // projects — they are children of the contact, which is inserted first.)
    const tables = ops.map((o) => o.table);
    expect(tables[0]).toBe("contacts");
    const projIdx = tables.indexOf("projects");
    expect(projIdx).toBeGreaterThan(tables.indexOf("notes"));
    expect(projIdx).toBeLessThan(tables.indexOf("projectRepos"));
    expect(projIdx).toBeLessThan(tables.indexOf("invoices"));
    expect(tables.indexOf("invoices")).toBeLessThan(tables.indexOf("invoiceLineItems"));

    // The contact row is inserted with the fresh id and no Convex internals.
    const contactOp = ops[0];
    expect(contactOp.data._id).toBeUndefined();
    expect(contactOp.data._creationTime).toBeUndefined();

    // Emails remap contactId.
    const email = ops.find((o) => o.table === "contactEmails")!;
    expect(email.data.contactId).toBe("contact-new");

    // Project-level document remaps BOTH contactId and projectId.
    const doc = ops.find((o) => o.table === "documents")!;
    expect(doc.data.contactId).toBe("contact-new");
    expect(doc.data.projectId).toBe("project-new");

    // Project-level note keeps contactId + remaps projectId.
    const projNote = ops.find((o) => o.table === "notes" && o.data.body === "work")!;
    expect(projNote.data.contactId).toBe("contact-new");
    expect(projNote.data.projectId).toBe("project-new");

    // Custom field values get entityId pointed at their restored parent.
    const cfvContact = ops.find((o) => o.table === "customFieldValues" && o.data.value === "x")!;
    expect(cfvContact.data.entityId).toBe("contact-new");
    const cfvProj = ops.find((o) => o.table === "customFieldValues" && o.data.value === "y")!;
    expect(cfvProj.data.entityId).toBe("project-new");

    // projectRepos remaps projectId but leaves the user-level repoId untouched.
    const link = ops.find((o) => o.table === "projectRepos")!;
    expect(link.data.projectId).toBe("project-new");
    expect(link.data.repoId).toBe("repo-stays");

    // Invoice + line items remap through the invoice map.
    const inv = ops.find((o) => o.table === "invoices")!;
    expect(inv.data.projectId).toBe("project-new");
    expect(inv.data.total).toBe(125000n);
    const li = ops.find((o) => o.table === "invoiceLineItems")!;
    expect(li.data.invoiceId).toBe("invoice-new");

    // Everything is inserted exactly once.
    const all = ops.map((o) =>
      `${o.table}:${JSON.stringify(o.data, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("planMergeUndo (§23.3 — restore survivor fields + re-point)", () => {
  const mergeSnap: MergeSnapshot = {
    kind: "merge",
    survivorId: "survivor",
    survivorFields: { name: "Old Name", company: undefined, timezone: "UTC", tags: ["a"] },
    absorbedContact: { userId: "u1", name: "Absorbed", tags: [], createdAt: 1 },
    repoint: [
      { table: "projects", field: "contactId", ids: ["proj-1", "proj-2"] },
      { table: "contactEmails", field: "contactId", ids: ["email-1"] },
      { table: "customFieldValues", field: "entityId", entityType: "contact", ids: ["cfv-1"] },
    ],
  };

  it("restores the survivor's pre-merge fields first", () => {
    const ops = planMergeUndo(mergeSnap, "absorbed-new");
    expect(ops[0]).toEqual({
      table: "contacts",
      id: "survivor",
      data: { name: "Old Name", company: undefined, timezone: "UTC", tags: ["a"] },
    });
  });

  it("re-points every absorbed row to the restored contact", () => {
    const ops = planMergeUndo(mergeSnap, "absorbed-new");
    const patches = ops.slice(1);
    expect(patches).toEqual([
      { table: "projects", id: "proj-1", data: { contactId: "absorbed-new" }, field: "contactId" },
      { table: "projects", id: "proj-2", data: { contactId: "absorbed-new" }, field: "contactId" },
      { table: "contactEmails", id: "email-1", data: { contactId: "absorbed-new" }, field: "contactId" },
      { table: "customFieldValues", id: "cfv-1", data: { entityId: "absorbed-new" }, field: "entityId" },
    ]);
  });

  it("is empty when nothing was absorbed", () => {
    const ops = planMergeUndo({ ...mergeSnap, repoint: [] }, "absorbed-new");
    expect(ops).toHaveLength(1); // survivor fields only
  });
});

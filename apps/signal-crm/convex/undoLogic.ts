/**
 * §23.3 undo — PURE logic for reversible destructive contact actions, no Convex
 * imports, so Vitest can test it directly. Both contact delete and contact
 * merge become undoable by snapshotting the affected subtree BEFORE the
 * destructive write, then replaying the snapshot (delete) or re-pointing the
 * surviving rows (merge) when the user hits Undo.
 *
 * Design (flagged at implementation):
 * - Delete undo re-inserts every row the cascade removed, with FK fields
 *   remapped to the fresh ids (Convex ids are generated on insert, so the
 *   restore plan carries the old→new mapping). Repos are user-level and are
 *   NOT deleted by the cascade, so their rows are never snapshot.
 * - Merge undo restores the absorbed contact's row and re-points every FK row
 *   the merge moved back to it, plus restores the survivor's pre-merge
 *   name/company/timezone/tags (the only fields merge patches).
 * - Money fields are int64 (bigint server-side), which JSON.stringify cannot
 *   serialize — the serializer below round-trips them losslessly.
 */
export type UndoKind = "delete" | "merge";

export interface RowData {
  [key: string]: unknown;
}

export interface DeleteProjectSnapshot {
  data: RowData;
  notes: RowData[];
  /** project-type custom field values (entityId === project id). */
  cfv: RowData[];
  /** projectRepos link rows — repoId stays valid, repos are not deleted. */
  links: RowData[];
  invoices: { data: RowData; lineItems: RowData[] }[];
}

export interface DeleteSnapshot {
  kind: "delete";
  contact: RowData;
  emails: RowData[];
  phones: RowData[];
  messages: RowData[];
  documents: RowData[];
  calendarEvents: RowData[];
  followUpReminders: RowData[];
  timelineEvents: RowData[];
  /** contact-level notes (no projectId). */
  contactNotes: RowData[];
  /** contact-type custom field values (entityId === contact id). */
  contactCfv: RowData[];
  projects: DeleteProjectSnapshot[];
}

export interface MergeRepoint {
  table: string;
  field: string;
  /** For customFieldValues: only re-point rows whose entityType matches. */
  entityType?: string;
  ids: string[];
}

export interface MergeSnapshot {
  kind: "merge";
  survivorId: string;
  /** Survivor's pre-merge name/company/timezone/tags — restored on undo. */
  survivorFields: RowData;
  /** Full row of the absorbed contact (was deleted by the merge). */
  absorbedContact: RowData;
  /** Every FK row the merge re-pointed to the survivor, by table. */
  repoint: MergeRepoint[];
}

export type ContactSnapshot = DeleteSnapshot | MergeSnapshot;

export interface InsertOp {
  table: string;
  data: RowData;
}

export interface PatchOp {
  table: string;
  id: string;
  data: RowData;
  /** The FK field this patch moves — the mutation's guard compares it. */
  field?: string;
}

/** bigint-safe JSON round-trip (int64 money fields) — lossless. */
export function serializeSnapshot(s: ContactSnapshot): string {
  return JSON.stringify(s, (_key, value) =>
    typeof value === "bigint" ? { $bigint: value.toString() } : value,
  );
}

export function deserializeSnapshot<T = ContactSnapshot>(raw: string): T {
  return JSON.parse(raw, (_key, value) => {
    if (
      value !== null &&
      typeof value === "object" &&
      typeof (value as { $bigint?: string }).$bigint === "string"
    ) {
      return BigInt((value as { $bigint: string }).$bigint);
    }
    return value;
  }) as T;
}

/**
 * Strip Convex-internal fields for a fresh insert. The SNAPSHOT keeps _id (it
 * is the old→new mapping key); only the re-inserted copy drops it.
 */
export function stripForInsert(row: RowData): RowData {
  const { _id: _omitId, _creationTime: _omitCt, ...rest } = row;
  return rest;
}

/**
 * §23.3 delete undo — the ordered list of inserts that restores a deleted
 * contact subtree, FK-safe (parents before children, projects before their
 * invoices). `ids` maps old ids → the fresh ids returned by the inserts.
 */
export function planDeleteRestore(
  snap: DeleteSnapshot,
  ids: { contactId: string; projectIds: Map<string, string>; invoiceIds: Map<string, string> },
): InsertOp[] {
  const ops: InsertOp[] = [];
  const remap = (data: RowData): RowData => {
    const out: RowData = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "_id" || k === "_creationTime") continue;
      if (k === "contactId") out[k] = ids.contactId;
      else if (k === "projectId" && typeof v === "string" && ids.projectIds.has(v)) {
        out[k] = ids.projectIds.get(v);
      } else if (k === "invoiceId" && typeof v === "string" && ids.invoiceIds.has(v)) {
        out[k] = ids.invoiceIds.get(v);
      } else out[k] = v;
    }
    return out;
  };

  ops.push({ table: "contacts", data: remap(snap.contact) });

  const contactRows: { table: string; rows: RowData[] }[] = [
    { table: "contactEmails", rows: snap.emails },
    { table: "contactPhones", rows: snap.phones },
    { table: "messages", rows: snap.messages },
    { table: "documents", rows: snap.documents },
    { table: "calendarEvents", rows: snap.calendarEvents },
    { table: "followUpReminders", rows: snap.followUpReminders },
    { table: "timelineEvents", rows: snap.timelineEvents },
    { table: "notes", rows: snap.contactNotes },
  ];
  for (const { table, rows } of contactRows) {
    for (const row of rows) ops.push({ table, data: remap(row) });
  }
  // contact-type custom field values: entityId points at the contact.
  for (const row of snap.contactCfv) {
    ops.push({ table: "customFieldValues", data: { ...remap(row), entityId: ids.contactId } });
  }

  for (const p of snap.projects) {
    const projectId = ids.projectIds.get(p.data._id as string);
    if (!projectId) continue;
    ops.push({ table: "projects", data: remap(p.data) });
    for (const row of p.notes) ops.push({ table: "notes", data: remap(row) });
    for (const row of p.cfv) {
      ops.push({ table: "customFieldValues", data: { ...remap(row), entityId: projectId } });
    }
    for (const row of p.links) ops.push({ table: "projectRepos", data: remap(row) });
    for (const inv of p.invoices) {
      const invoiceId = ids.invoiceIds.get(inv.data._id as string);
      if (!invoiceId) continue;
      ops.push({ table: "invoices", data: remap(inv.data) });
      for (const li of inv.lineItems) ops.push({ table: "invoiceLineItems", data: remap(li) });
    }
  }
  return ops;
}

/**
 * §23.3 merge undo — the desired patches: restore the survivor's pre-merge
 * fields, then re-point every row the merge moved. The mutation guards each
 * patch (row still exists, FK still points at the survivor) before applying.
 */
export function planMergeUndo(snap: MergeSnapshot, restoredContactId: string): PatchOp[] {
  const ops: PatchOp[] = [
    { table: "contacts", id: snap.survivorId, data: snap.survivorFields },
  ];
  for (const r of snap.repoint) {
    for (const id of r.ids) {
      ops.push({ table: r.table, id, data: { [r.field]: restoredContactId }, field: r.field });
    }
  }
  return ops;
}

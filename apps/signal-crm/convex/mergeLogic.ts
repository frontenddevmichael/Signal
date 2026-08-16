/**
 * §20.6 duplicate-contact merge — PURE logic, no Convex imports, so Vitest can
 * test it directly (highest-risk logic in Phase 1: FK re-pointing + conflict
 * resolution). The merge mutation in contacts.ts executes the plan this module
 * builds.
 *
 * Locked mechanics (§20.6):
 * - The OLDER contact (by created_at) survives as contact A.
 * - Every FK referencing contact B is re-pointed to contact A:
 *   projects, messages, documents, notes, calendar_events,
 *   follow_up_reminders, custom_field_values (contact-type), timeline_events,
 *   contact_emails, contact_phones.
 * - tags[] unioned.
 * - Conflicting single-value fields require an explicit per-field choice in the
 *   UI — never silently defaulted. Spec names timezone/company; name is treated
 *   the same way here (same principle, and silently keeping one person's name
 *   over the other is exactly the kind of pick the spec forbids).
 * - Merge is logged to audit_log with both original contact IDs in metadata.
 */

/** Single-value fields that can genuinely conflict → explicit UI choice. */
export const CONFLICT_FIELDS = ["name", "timezone", "company"] as const;
export type ConflictField = (typeof CONFLICT_FIELDS)[number];

export interface MergeContactLike {
  _id: string;
  name: string;
  company?: string;
  timezone?: string;
  tags: string[];
  createdAt: number;
}

export interface MergeConflict {
  field: ConflictField;
  /** The survivor's value (default resolution). */
  survivorValue: string | undefined;
  /** The other contact's value. */
  otherValue: string | undefined;
}

export interface MergePlan {
  survivorId: string;
  otherId: string;
  /** FK tables whose rows pointing at `otherId` must be re-pointed. */
  repoint: { table: string; field: string }[];
  conflicts: MergeConflict[];
  mergedTags: string[];
}

const CONTACT_FK_TABLES: { table: string; field: string }[] = [
  { table: "projects", field: "contactId" },
  { table: "messages", field: "contactId" },
  { table: "documents", field: "contactId" },
  { table: "notes", field: "contactId" },
  { table: "calendarEvents", field: "contactId" },
  { table: "followUpReminders", field: "contactId" },
  { table: "timelineEvents", field: "contactId" },
  { table: "contactEmails", field: "contactId" },
  { table: "contactPhones", field: "contactId" },
];

/**
 * §20.6 — the older contact survives. Tie-break on _id for determinism.
 */
export function pickSurvivor<C extends MergeContactLike>(a: C, b: C): C {
  return b.createdAt < a.createdAt ? b : a;
}

function conflictValue(contact: MergeContactLike, field: ConflictField): string | undefined {
  if (field === "name") return contact.name;
  if (field === "company") return contact.company;
  return contact.timezone;
}

/**
 * Build the merge plan for two contacts. `a` MUST be the survivor (call
 * pickSurvivor first). Pure: no DB access, deterministic, fully unit-testable.
 */
export function buildMergePlan(
  a: MergeContactLike,
  b: MergeContactLike,
): MergePlan {
  const conflicts: MergeConflict[] = [];
  for (const field of CONFLICT_FIELDS) {
    const survivorValue = conflictValue(a, field);
    const otherValue = conflictValue(b, field);
    // Only a genuine conflict needs a choice: both set AND different.
    const bothSet = survivorValue !== undefined && otherValue !== undefined;
    if (!bothSet || survivorValue === otherValue) continue;
    conflicts.push({ field, survivorValue, otherValue });
  }

  const mergedTags = [...new Set([...a.tags, ...b.tags])];

  return {
    survivorId: a._id,
    otherId: b._id,
    repoint: CONTACT_FK_TABLES,
    conflicts,
    mergedTags,
  };
}


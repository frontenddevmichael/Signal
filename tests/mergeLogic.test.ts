import { describe, expect, it } from "vitest";
import { buildMergePlan, pickSurvivor } from "../convex/mergeLogic";
import type { MergeContactLike } from "../convex/mergeLogic";

function contact(partial: Partial<MergeContactLike> & { _id: string; name: string; createdAt: number }): MergeContactLike {
  return { company: undefined, timezone: undefined, tags: [], ...partial };
}

describe("pickSurvivor (§20.6 — older contact survives)", () => {
  it("keeps the older contact when creation times differ", () => {
    const old = contact({ _id: "a", name: "Old", createdAt: 1000 });
    const newer = contact({ _id: "b", name: "New", createdAt: 2000 });
    expect(pickSurvivor(old, newer)._id).toBe("a");
    expect(pickSurvivor(newer, old)._id).toBe("a");
  });

  it("is deterministic on equal timestamps (first arg wins)", () => {
    const a = contact({ _id: "a", name: "A", createdAt: 1000 });
    const b = contact({ _id: "b", name: "B", createdAt: 1000 });
    expect(pickSurvivor(a, b)._id).toBe("a");
  });
});

describe("buildMergePlan", () => {
  const older = contact({
    _id: "a",
    name: "Ada Lovelace",
    company: "Analytical Engines",
    timezone: "Europe/London",
    tags: ["design", "priority"],
    createdAt: 1000,
  });
  const newer = contact({
    _id: "b",
    name: "Ada Lovelace",
    company: "Babbage & Co",
    timezone: "Europe/London",
    tags: ["priority", "sponsor"],
    createdAt: 2000,
  });

  it("flags genuine conflicts (same value set both sides is NOT a conflict)", () => {
    const plan = buildMergePlan(older, newer);
    const fields = plan.conflicts.map((c) => c.field);
    // name equal → not a conflict; timezone equal → not a conflict; company differs → conflict
    expect(fields).toEqual(["company"]);
    const company = plan.conflicts.find((c) => c.field === "company")!;
    expect(company.survivorValue).toBe("Analytical Engines");
    expect(company.otherValue).toBe("Babbage & Co");
  });

  it("unions tags without duplicates, survivor first", () => {
    const plan = buildMergePlan(older, newer);
    expect(plan.mergedTags).toEqual(["design", "priority", "sponsor"]);
  });

  it("reports every contact FK table for re-pointing", () => {
    const plan = buildMergePlan(older, newer);
    const tables = plan.repoint.map((r) => r.table).sort();
    expect(tables).toEqual([
      "calendarEvents",
      "contactEmails",
      "contactPhones",
      "documents",
      "followUpReminders",
      "messages",
      "notes",
      "projects",
      "timelineEvents",
    ]);
    expect(plan.repoint.every((r) => r.field === "contactId")).toBe(true);
  });

  it("is empty of conflicts when only one side has a value (safe default wins)", () => {
    const withCompany = contact({ _id: "a", name: "Ada", company: "Analytical Engines", createdAt: 1000 });
    const without = contact({ _id: "b", name: "Ada", createdAt: 2000 });
    const plan = buildMergePlan(withCompany, without);
    expect(plan.conflicts).toEqual([]);
  });
});

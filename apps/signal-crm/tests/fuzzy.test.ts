import { describe, expect, it } from "vitest";
import { bestFieldScore, fuzzyScore } from "../src/lib/fuzzy";

describe("fuzzyScore — basics", () => {
  it("returns 0 for an empty query (matches everything)", () => {
    expect(fuzzyScore("", "Acme Co")).toBe(0);
  });

  it("returns null when the query cannot match", () => {
    expect(fuzzyScore("xyz", "Acme Co")).toBeNull();
    expect(fuzzyScore("zzz", "NoSuchThing")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("ACME", "acme co")).not.toBeNull();
    expect(fuzzyScore("acme", "ACME CO")).not.toBeNull();
  });

  it("matches a full substring", () => {
    expect(fuzzyScore("acme", "Acme Co")).not.toBeNull();
  });
});

describe("fuzzyScore — ranking", () => {
  it("prefix beats a later occurrence", () => {
    const prefix = fuzzyScore("ac", "Acme Co");
    const late = fuzzyScore("ac", "Mega Acme Co");
    expect(prefix).not.toBeNull();
    expect(late).not.toBeNull();
    expect(prefix!).toBeGreaterThan(late!);
  });

  it("contiguous substring beats a lightly-gapped subsequence", () => {
    // Both match, but the contiguous one scores higher than the 1-gap match.
    const contiguous = fuzzyScore("acme", "Acme Co");
    const oneGap = fuzzyScore("amc", "Acme Co"); // skip the c
    expect(contiguous!).toBeGreaterThan(oneGap!);
  });

  it("rejects heavily-scattered matches (gaps dominate the score)", () => {
    // One gap is fine ("amc" → Acme), but scattering every char across
    // "Axxcxxmxxe" burns so much gap penalty it falls below the floor — a
    // typo'd "acne" must rank "Acme Corp" above a coincidence like
    // "Background Writer", so heavy scattering is treated as no match.
    expect(fuzzyScore("acme", "Axxcxxmxxe")).toBeNull();
    expect(fuzzyScore("acne", "Background Writer")).toBeNull();
  });

  it("word-boundary matches score above mid-word matches", () => {
    // The second c starts a word in the first (space boundary) but is buried
    // mid-word in the second — camelCase is deliberately absent so the only
    // bonus difference is the space boundary.
    const boundary = fuzzyScore("cc", "ac cc");
    const mid = fuzzyScore("cc", "accc");
    expect(boundary!).toBeGreaterThan(mid!);
  });

  it("exact chars beat a typo'd alternative", () => {
    const exact = fuzzyScore("google", "Google Cloud");
    const typo = fuzzyScore("googel", "Google Cloud"); // transposed e/l
    expect(exact!).toBeGreaterThan(typo!);
  });

  it("a short query is a worse match than the full query", () => {
    const partial = fuzzyScore("goo", "Google");
    const full = fuzzyScore("google", "Google");
    expect(full!).toBeGreaterThan(partial!);
  });
});

describe("fuzzyScore — typo tolerance", () => {
  it("tolerates one keyboard-adjacent substitution", () => {
    // acme vs acne — m↔n are adjacent on QWERTY, a classic single-char typo.
    expect(fuzzyScore("acne", "Acme Co")).not.toBeNull();
    expect(fuzzyScore("acme", "Acne Co")).not.toBeNull();
  });

  it("does NOT accept arbitrary substitutions", () => {
    // a→e is not keyboard-adjacent, so "cma" cannot match "Acme" by
    // substituting the a — only exact/subsequence/swap paths may match.
    expect(fuzzyScore("cma", "Acme Co")).toBeNull();
  });

  it("tolerates a transposition", () => {
    expect(fuzzyScore("googel", "Google")).not.toBeNull();
  });

  it("rejects a query that needs more typos than the budget", () => {
    // 4 substitutions needed, budget is 1 → no match.
    expect(fuzzyScore("wxzq", "Acme")).toBeNull();
  });
});

describe("fuzzyScore — partial/subsequence matching", () => {
  it("matches chars in order even when not adjacent", () => {
    expect(fuzzyScore("amc", "Acme Co")).not.toBeNull();
  });

  it("rejects chars out of order", () => {
    expect(fuzzyScore("oacm", "Acme Co")).toBeNull();
  });
});

describe("bestFieldScore", () => {
  it("returns the best score across fields", () => {
    const nameOnly = bestFieldScore("acme", ["Acme Co", "Acme Co"]);
    const companyMatch = bestFieldScore("zap", ["Acme Co", "Zapier Inc"]);
    expect(nameOnly).not.toBeNull();
    expect(companyMatch).not.toBeNull();
  });

  it("returns null when no field matches", () => {
    expect(bestFieldScore("qqq", ["Acme Co", "Zapier Inc"])).toBeNull();
  });

  it("skips empty fields", () => {
    expect(bestFieldScore("acme", [undefined, null, ""])).toBeNull();
    expect(bestFieldScore("acme", [undefined, "Acme Co", ""])).not.toBeNull();
  });

  it("empty query matches everything at 0", () => {
    expect(bestFieldScore("", ["anything"])).toBe(0);
  });
});

describe("fuzzyScore — realistic palette scenarios", () => {
  it("ranks the exact-name match above a name that merely contains the query", () => {
    const exact = fuzzyScore("sign", "Signal Labs");
    const partial = fuzzyScore("sign", "Design Systems Co");
    expect(exact!).toBeGreaterThan(partial!);
  });

  it("surfaces a client when the query matches its company field", () => {
    // "zap" doesn't appear in the name, but matches the company — the row
    // must surface via bestFieldScore (the palette calls this per row).
    expect(bestFieldScore("zap", ["Acme Co", "Zapier Inc"])).not.toBeNull();
  });

  it("matches invoice-style numbers with separators", () => {
    expect(fuzzyScore("inv-26", "INV-2026-0001")).not.toBeNull();
    expect(fuzzyScore("inv26", "INV-2026-0001")).not.toBeNull(); // separator skip
  });
});

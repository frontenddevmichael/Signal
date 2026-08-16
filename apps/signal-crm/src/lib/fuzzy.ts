/**
 * Fuzzy search for the command palette (§2.4).
 *
 * Substring matching misses typos ("acme" vs "acne") and partial matches
 * ("amc" for "Acme Co" — chars in order, not contiguous). This module scores
 * every candidate with a deterministic subsequence DP:
 *
 *  - query chars must match in order (like fzf), gaps allowed with a penalty
 *  - up to TYPO_BUDGET single-char substitutions are permitted (typos)
 *  - exact chars score far above substitutions, so "google" always beats
 *    "googel" against the same text
 *  - bonuses: first char at index 0 (prefix), word-boundary starts, and
 *    contiguous runs — so "acme co" > "Mega Acme Co" > "Back 2 Acme"
 *  - result is a plain number: higher = better; null = no match
 *
 * Pure function, no imports — fully unit-testable (tests/fuzzy.test.ts).
 */

// Scoring weights. fzf's insight: match bonuses must be small relative to
// gap penalties, or a long scattered match (many chars × high bonus) will
// outrank a tight typo match. Here a 4-char query earns at most ~160 from
// matches while every skipped char costs 30 — so "acne" matches "Acme Corp"
// (one tight substitution, ~150) over "Background Writer" (11 chars skipped,
// ~90).
const MATCH_BASE = 40; // exact char
const TYPO_BASE = 8; // substituted char
const PREFIX_BONUS = 25; // query start at text index 0
const WORD_START_BONUS = 15; // after space - _ / . ( or camelCase boundary
const CONTIGUOUS_BONUS = 10; // previous query char matched at j-1
const CASE_EXACT_BONUS = 2; // original-case equality
const GAP_PENALTY = 30; // skipping a text char — the dominant term
const MIN_SCORE = 25; // below this, treat as no match

const SEPARATORS = new Set([" ", "-", "_", "/", ".", "(", "["]);

/** Max substitutions permitted: ~1 per 4 query chars, never 0 for a short
 *  but non-empty query (a 3-char query should still tolerate one typo). */
function typoBudget(queryLength: number): number {
  if (queryLength <= 0) return 0;
  return Math.max(1, Math.floor(queryLength / 4));
}

/** QWERTY keyboard adjacency — substitution typos are almost always a
 *  miss of an adjacent key (m↔n for "acme"), so an arbitrary substitution is
 *  NOT accepted: "cma" must not match "Acme" via a→e. Neighbors are
 *  horizontal + one-step vertical/diagonal rows. */
const QWERTY: string[] = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const ADJACENT: Set<string> = new Set();
for (let row = 0; row < QWERTY.length; row++) {
  for (let col = 0; col < QWERTY[row].length; col++) {
    const c = QWERTY[row][col];
    // Horizontal neighbor in the same row.
    if (col > 0) ADJACENT.add(c + QWERTY[row][col - 1]);
    if (col < QWERTY[row].length - 1) ADJACENT.add(c + QWERTY[row][col + 1]);
    // Vertical/diagonal: same column (and ±1) in the row below.
    for (const below of [QWERTY[row + 1]?.[col], QWERTY[row + 1]?.[col + 1]]) {
      if (below) ADJACENT.add(c + below);
    }
  }
}

/** Are two single chars a keyboard-adjacent typo pair (either direction)? */
function isAdjacentTypo(a: string, b: string): boolean {
  if (a === b) return false;
  return ADJACENT.has(a + b) || ADJACENT.has(b + a);
}

/** Is the char at index j a word boundary? Start-of-string, after a
 *  separator, or a camelCase transition (lower→upper). */
function isWordStart(original: string, j: number): boolean {
  if (j === 0) return false; // index 0 is the prefix case, handled separately
  const prev = original[j - 1];
  if (SEPARATORS.has(prev)) return true;
  const cur = original[j];
  // camelCase: previous is lowercase/letter, current is uppercase
  return (
    prev !== prev.toUpperCase() &&
    cur !== cur.toLowerCase() &&
    prev.toLowerCase() !== prev.toUpperCase() &&
    cur.toLowerCase() !== cur.toUpperCase()
  );
}

/**
 * Score `query` against `text`. Returns a number (higher = better) or null
 * when the query cannot match within the typo budget.
 *
 * DP: dp[i][j][t] = best score matching query[0..i) against text[0..j) using
 * exactly t substitutions. Transitions: skip a text char (gap), match exactly,
 * or substitute (counts against the budget).
 */
export function fuzzyScore(query: string, text: string): number | null {
  if (query.length === 0) return 0;
  if (text.length === 0) return null;

  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const n = q.length;
  const m = t.length;
  const budget = typoBudget(n);
  const NEG = -Infinity;

  // dp[i][j] is an array of best scores per typo count (0..budget).
  const dp: number[][][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => Array(budget + 1).fill(NEG))
  );

  // Empty query prefix: score 0 with 0 typos at any text position.
  for (let j = 0; j <= m; j++) dp[0][j][0] = 0;

  const charBase = (i: number, j: number): number => {
    let s = 0;
    if (i === 1 && j === 1) s += PREFIX_BONUS;
    if (isWordStart(text, j - 1)) s += WORD_START_BONUS;
    if (i >= 2 && j >= 2 && query[i - 2] === text[j - 2]) s += CONTIGUOUS_BONUS;
    return s;
  };

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      for (let tUsed = 0; tUsed <= budget; tUsed++) {
        let best = NEG;
        // Skip text[j-1] (gap) — keep same query progress and typo count.
        const skip = dp[i][j - 1][tUsed];
        if (skip !== NEG) best = Math.max(best, skip - GAP_PENALTY);

        const exact = q[i - 1] === t[j - 1];
        if (exact) {
          const prev = dp[i - 1][j - 1][tUsed];
          if (prev !== NEG) {
            let score = prev + MATCH_BASE + charBase(i, j);
            if (query[i - 1] === text[j - 1]) score += CASE_EXACT_BONUS;
            best = Math.max(best, score);
          }
        } else if (tUsed > 0) {
          // Substitution — spend one typo, ONLY for keyboard-adjacent pairs
          // ("acne"→"Acme" via m/n), never arbitrary chars ("cma" must not
          // match "Acme" via a→e).
          if (isAdjacentTypo(q[i - 1], t[j - 1])) {
            const prev = dp[i - 1][j - 1][tUsed - 1];
            if (prev !== NEG) {
              best = Math.max(best, prev + TYPO_BASE + charBase(i, j));
            }
          }
          // Adjacent swap (transposition): query[i-1]==text[j-2] and
          // query[i-2]==text[j-1] — "googel"→"Google". Consumes two query
          // chars and two text chars for one typo.
          if (i >= 2 && j >= 2 && q[i - 1] === t[j - 2] && q[i - 2] === t[j - 1]) {
            const prev = dp[i - 2][j - 2][tUsed - 1];
            if (prev !== NEG) {
              best = Math.max(best, prev + 2 * TYPO_BASE + charBase(i, j));
            }
          }
        }
        dp[i][j][tUsed] = best;
      }
    }
  }

  // Best across any typo count and any END position: text after the final
  // match is free (fzf semantics) — a short query like "acm" must not be
  // penalized for the rest of "Acme Corp" trailing after the m.
  let best = NEG;
  for (let tUsed = 0; tUsed <= budget; tUsed++) {
    for (let j = 0; j <= m; j++) {
      best = Math.max(best, dp[n][j][tUsed]);
    }
  }
  if (best === NEG || best < MIN_SCORE) return null;
  return best;
}

/**
 * Score a query against several candidate fields, returning the best score.
 * Used by the palette for rows that carry a label + subtitle (e.g. a client's
 * name and company): a match on either field should surface the row.
 */
export function bestFieldScore(
  query: string,
  fields: (string | undefined | null)[]
): number | null {
  let best: number | null = null;
  for (const f of fields) {
    if (!f) continue;
    const s = fuzzyScore(query, f);
    if (s !== null && (best === null || s > best)) best = s;
  }
  return best;
}

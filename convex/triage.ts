/**
 * §6/§20.14 message triage gating.
 *
 * Order (locked): rule-based classification ALWAYS runs first — it catches the
 * obvious cases for free. The LLM is consulted ONLY when the rule pass returns
 * "ambiguous" AND users.ai_triage_enabled is true AND the per-user daily cap
 * (rate_limits, action_type: llm_triage) is not exhausted. When the flag is off
 * or the cap is hit, triage degrades to rule-based-only — never fails, never
 * spends money (this is the abuse ceiling from §20.14).
 *
 * Provider: Groq or Gemini, both env-gated — the chosen primary is read from
 * LLM_TRIAGE_PROVIDER ("groq" | "gemini"); if unset, rule-based-only runs.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ruleBasedTriage, type TriageVerdict } from "./gmailLogic";

/** §20.14 daily cap — kept low enough to be free-tier safe on both providers. */
export const LLM_TRIAGE_DAILY_CAP = 200;

export function llmTriageConfigured(): boolean {
  const provider = process.env.LLM_TRIAGE_PROVIDER;
  if (provider === "groq") return Boolean(process.env.GROQ_API_KEY);
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  return false;
}

/**
 * Check-and-increment the daily cap atomically (rolling window per user).
 * Returns true when a slot was available; false when the cap is exhausted.
 */
export const tryConsumeTriageCap = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const now = Date.now();
    const windowStart = now - 24 * 60 * 60 * 1000;
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key_action_window", (q) =>
        q.eq("key", `user:${userId}`).eq("actionType", "llm_triage").eq("windowStart", windowStart)
      )
      .first();
    const count = existing?.attemptCount ?? 0;
    if (count >= LLM_TRIAGE_DAILY_CAP) return { allowed: false, remaining: 0 };
    if (existing) {
      await ctx.db.patch(existing._id, { attemptCount: count + 1 });
    } else {
      await ctx.db.insert("rateLimits", {
        key: `user:${userId}`,
        actionType: "llm_triage",
        windowStart,
        attemptCount: 1,
      });
    }
    return { allowed: true, remaining: LLM_TRIAGE_DAILY_CAP - count - 1 };
  },
});

export const triageEnabled = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { enabled: false, configured: llmTriageConfigured() };
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email ?? ""))
      .first();
    return {
      enabled: user?.aiTriageEnabled !== false,
      configured: llmTriageConfigured(),
    };
  },
});

/** §20.14 toggle in settings. */
export const setTriageEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email ?? ""))
      .first();
    if (!user) return;
    await ctx.db.patch(user._id, { aiTriageEnabled: enabled });
  },
});

/**
 * The gated classifier, called by the inbound message path.
 * Returns the verdict and whether the LLM was consulted (for the audit trail).
 */
export async function classifyMessage(args: {
  from: string;
  subject: string;
  body: string;
  aiTriageEnabled: boolean;
  canUseLlm: boolean;
}): Promise<{ verdict: TriageVerdict; usedLlm: boolean }> {
  // First pass — rule-based, always (§10: "simple rule-based filtering first").
  const ruleVerdict = ruleBasedTriage({ from: args.from, subject: args.subject, body: args.body });
  if (ruleVerdict !== "ambiguous") return { verdict: ruleVerdict, usedLlm: false };

  // Only the ambiguous remainder may reach the LLM, and only when the gate is open.
  if (!args.aiTriageEnabled || !args.canUseLlm || !llmTriageConfigured()) {
    return { verdict: "ambiguous", usedLlm: false };
  }

  const verdict = await llmClassify(args);
  return { verdict, usedLlm: true };
}

/** Single free-tier LLM call; throws are caught by the caller's fallback. */
async function llmClassify(args: {
  from: string;
  subject: string;
  body: string;
}): Promise<TriageVerdict> {
  const provider = process.env.LLM_TRIAGE_PROVIDER;
  const prompt = `You are a spam filter for a freelancer's CRM. A forwarded email arrived from "${args.from}" with subject "${args.subject}" and body:\n---\n${args.body.slice(0, 1500)}\n---\nClassify as exactly one of: spam, important, ambiguous. Reply with a single word.`;

  if (provider === "groq") {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 5,
      }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const json = await res.json();
    return normalizeVerdict(json?.choices?.[0]?.message?.content ?? "");
  }

  if (provider === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return normalizeVerdict(text);
  }

  return "ambiguous";
}

function normalizeVerdict(text: string): TriageVerdict {
  const t = text.trim().toLowerCase();
  if (t.startsWith("spam")) return "spam";
  if (t.startsWith("important")) return "important";
  return "ambiguous";
}

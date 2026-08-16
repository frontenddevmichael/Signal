/* ============================================================
   pulse.ts — Cloudflare Pages Function, the REAL-EVENTS seam
   (spec §3.5). With no source configured it returns the
   clearly-illustrative set; when PULSE_SOURCE_URL is set it
   proxies whatever the source serves and labels it "live".
   The component renders BOTH through the same PulseFeed shape,
   so going live is config-only — zero re-architecture.
   Never fabricates: an unset/erroring source always falls back
   to the illustrative set, and the marker comes from the same
   payload the events come from.
   ============================================================ */

import { ILLUSTRATIVE_FEED, type PulseEvent, type PulseFeed } from "../data/pulse";

interface Env {
  PULSE_SOURCE_URL?: string;
  PULSE_SOURCE_TOKEN?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequest(context: { env?: Env }): Promise<Response> {
  const url = context.env?.PULSE_SOURCE_URL;

  if (!url) {
    // No source configured — the illustrative set, labeled as such.
    return json(ILLUSTRATIVE_FEED);
  }

  try {
    // The function itself is cached by Cloudflare (default 30s for
    // Pages Functions on GET); the upstream call stays plain.
    const res = await fetch(url, {
      headers: context.env?.PULSE_SOURCE_TOKEN
        ? { Authorization: `Bearer ${context.env.PULSE_SOURCE_TOKEN}` }
        : {},
    });
    if (!res.ok) return json(ILLUSTRATIVE_FEED);

    const raw = (await res.json()) as unknown;
    const events = Array.isArray(raw)
      ? raw.filter(
          (e): e is PulseEvent =>
            typeof e === "object" &&
            e !== null &&
            typeof (e as PulseEvent).label === "string" &&
            typeof (e as PulseEvent).id === "string"
        )
      : null;

    // Real source served but malformed — degrade honestly, never fake.
    if (!events) return json(ILLUSTRATIVE_FEED);

    return json({ source: "live", events } satisfies PulseFeed);
  } catch {
    return json(ILLUSTRATIVE_FEED);
  }
}

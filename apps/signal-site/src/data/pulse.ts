/* ============================================================
   pulse data — the SHARED event shape + the illustrative seed
   set (spec §3.5). These are CLEARLY-LABELED illustrative
   events, never fabricated live data: the component renders
   them with a visible "illustrative" marker, and the same
   shape is what a real source (env-gated in
   src/functions/pulse.ts) serves when it exists. Same type,
   same component, zero re-architecture when the product goes
   live.
   ============================================================ */

export type PulseIcon = "invoice" | "branch" | "check" | "repo" | "mail" | "calendar" | "clock";

export interface PulseEvent {
  id: string;
  icon: PulseIcon;
  /** The event line, e.g. "Invoice INV-2026-0012 sent". */
  label: string;
  /** Supporting context, e.g. the client or amount. */
  detail?: string;
  /** Relative time, e.g. "12m", "2h". Part of the illustrative sample. */
  time: string;
}

export type PulseSource = "live" | "illustrative";

export interface PulseFeed {
  source: PulseSource;
  events: PulseEvent[];
}

/** The illustrative set — dense (spec §6.4), covering the three
 *  story kinds the brief names: invoice sent, follow-up
 *  completed, repo connected — plus the timeline family. */
export const ILLUSTRATIVE_EVENTS: PulseEvent[] = [
  { id: "p1", icon: "branch", label: "PR #142 merged", detail: "acme/design-system · billing export", time: "4m" },
  { id: "p2", icon: "invoice", label: "Invoice INV-2026-0012 sent", detail: "Nimbus · $840.00", time: "9m" },
  { id: "p3", icon: "check", label: "Follow-up completed", detail: "Meridian · payment terms", time: "22m" },
  { id: "p4", icon: "repo", label: "Repo connected", detail: "github.com/meridian/api", time: "1h" },
  { id: "p5", icon: "invoice", label: "Invoice INV-2026-0009 paid", detail: "Acme Co. · $1,250.00", time: "2h" },
  { id: "p6", icon: "calendar", label: "Meeting scheduled", detail: "Acme Co. · design review", time: "3h" },
  { id: "p7", icon: "branch", label: "PR #138 merged", detail: "nimbus/cloud · rate limiting", time: "5h" },
  { id: "p8", icon: "mail", label: "Email triaged to inbox", detail: "from client-9f2a@signal.app", time: "7h" },
  { id: "p9", icon: "invoice", label: "Invoice INV-2026-0007 sent", detail: "Meridian · $1,480.00", time: "yesterday" },
  { id: "p10", icon: "clock", label: "Follow-up due in 2 days", detail: "Nimbus · proposal follow-up", time: "yesterday" },
];

export const ILLUSTRATIVE_FEED: PulseFeed = {
  source: "illustrative",
  events: ILLUSTRATIVE_EVENTS,
};

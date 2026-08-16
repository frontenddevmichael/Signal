/* ============================================================
   motionGate — the performance/fallback gate (brief §2, §5).
   Built and tested FIRST, before any hero polish. Decides
   whether the page runs the full scroll-scrubbed experience or
   the simplified crossfade. The gate is a pure function of the
   environment + a manual override (Sound toggle in the topbar
   also carries a "reduce motion" escape hatch).
   ============================================================ */

export type MotionMode = "full" | "simple";

const OVERRIDE_KEY = "signal-site:motion";

function readOverride(): MotionMode | null {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (raw === "full" || raw === "simple") return raw;
  } catch {
    /* storage unavailable — fall through to detection */
  }
  return null;
}

/** Reduced-motion preference. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Low-power device heuristic: few cores OR a slow/data-saving link. */
export function isLowPower(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
    };
    deviceMemory?: number;
  };
  const cores = navigator.hardwareConcurrency ?? 8;
  if (cores > 0 && cores <= 4) return true;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return true;
  const conn = nav.connection;
  if (conn) {
    if (conn.saveData) return true;
    if (conn.effectiveType && /2g|slow-3g/.test(conn.effectiveType)) return true;
  }
  return false;
}

/** The gate itself — override > preference > capability. */
export function motionMode(): MotionMode {
  const override = readOverride();
  if (override) return override;
  if (prefersReducedMotion() || isLowPower()) return "simple";
  return "full";
}

/** Persist an explicit user choice (topbar menu). */
export function setMotionMode(mode: MotionMode): void {
  try {
    localStorage.setItem(OVERRIDE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Subscribe to media-query changes so the page can degrade live. */
export function watchReducedMotion(cb: (reduced: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handler = (e: MediaQueryListEvent) => cb(e.matches);
  mq.addEventListener?.("change", handler);
  return () => mq.removeEventListener?.("change", handler);
}

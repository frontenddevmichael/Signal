/* ============================================================
   sound — the ONE sound in the whole page (brief §4):
   a restrained "signal ping" at the exact moment the last hero
   element resolves. Off by default, opt-in, used exactly once.
   ============================================================ */

const KEY = "signal-site:sound";
let enabled = false;
let ctx: AudioContext | null = null;
let played = false;

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Toggle helper for the topbar. */
export function toggleSound(): boolean {
  setSoundEnabled(!enabled);
  return enabled;
}

export function initSound(): void {
  try {
    enabled = localStorage.getItem(KEY) === "1";
  } catch {
    enabled = false;
  }
}

/**
 * Play the ping. Safe to call every frame — it fires at most once.
 * Two short sine tones (E5 → A5), quick exponential decay, quiet.
 */
export function playSignalPing(): void {
  if (!enabled || played || typeof window === "undefined") return;
  played = true;
  try {
    ctx ??= new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    master.connect(ctx.destination);

    [659.25, 880].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const g = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = now + i * 0.14;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 1);
    });
  } catch {
    /* audio unavailable — the moment just passes silently */
  }
}

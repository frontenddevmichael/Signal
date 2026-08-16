import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";
import { SignalBar } from "signal-ui/SignalBar";
import { Icon, type IconName } from "signal-ui/Icons";
import { StatusChip } from "signal-ui/StatusChip";
import { motionMode } from "../lib/motionGate";
import { playSignalPing } from "../lib/sound";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* ============================================================
   Hero — "Entropy → Signal" (brief §3.1)
   ~17 real DOM pieces. Most resolve INTO the product window
   (they ARE product UI pieces, scattered then assembled); a few
   pieces of pure clutter tuck away as the assembly completes.
   Every effect is scrub-driven GSAP interpolation from seeded
   chaos values to identity — fully reversible on scroll-up.
   Reduced-motion/low-power runs the same settle as a one-shot
   timeline (the gate's crossfade path), no scrollTrigger.
   ============================================================ */

/** Deterministic PRNG so SSR chaos === client chaos (no first-paint jump). */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ChaosTransform {
  x: number;
  y: number;
  rot: number;
  scale: number;
}

/** Edge-biased chaos for a resolving piece (its slot's quadrant). */
export function chaosFor(kind: string, qx: number, qy: number): ChaosTransform {
  const r = mulberry32(hash(kind));
  const x = qx * (60 + r() * 200);
  const y = qy * (40 + r() * 140);
  const rot = (r() - 0.5) * 2 * (8 + r() * 14);
  const scale = 0.74 + r() * 0.3;
  return { x: Math.round(x), y: Math.round(y), rot: Math.round(rot * 10) / 10, scale: Math.round(scale * 100) / 100 };
}

/** Tuck piece chaos: ring-scattered across the stage. */
export function tuckChaosFor(kind: string): ChaosTransform & { px: number; py: number } {
  const r = mulberry32(hash(kind) + 7);
  const angle = r() * Math.PI * 2;
  const radius = 0.3 + r() * 0.16;
  const px = Math.round((0.5 + Math.cos(angle) * radius) * 100) / 100;
  const py = Math.round((0.5 + Math.sin(angle) * radius) * 100) / 100;
  return { x: 0, y: 0, rot: Math.round((r() - 0.5) * 40), scale: 0.8 + r() * 0.3, px, py };
}

type Slot = {
  kind: string;
  qx: 1 | -1;
  qy: 1 | -1;
  x: string;
  y: string;
  w: string;
  h: string;
  start: number;
  dur: number;
  content: React.ReactNode;
};

const SLOTS: Slot[] = [
  {
    kind: "brand",
    qx: -1, qy: -1,
    x: "2.5%", y: "4%", w: "13%", h: "11%",
    start: 0.2, dur: 0.5,
    content: (
      <span className="ui-brand">
        <SignalBar size={16} className="mark" />
        <span>Signal</span>
      </span>
    ),
  },
  { kind: "navClients", qx: -1, qy: -1, x: "2.5%", y: "19%", w: "13%", h: "6%", start: 0.24, dur: 0.45, content: <NavRow icon="repo" label="Clients" active /> },
  { kind: "navInvoices", qx: -1, qy: -1, x: "2.5%", y: "26%", w: "13%", h: "6%", start: 0.27, dur: 0.45, content: <NavRow icon="invoice" label="Invoices" /> },
  { kind: "navCalendar", qx: -1, qy: -1, x: "2.5%", y: "33%", w: "13%", h: "6%", start: 0.3, dur: 0.45, content: <NavRow icon="calendar" label="Calendar" /> },
  { kind: "navInbox", qx: -1, qy: -1, x: "2.5%", y: "40%", w: "13%", h: "6%", start: 0.33, dur: 0.45, content: <NavRow icon="mail" label="Inbox" /> },
  {
    kind: "head",
    qx: 1, qy: -1,
    x: "18%", y: "3.5%", w: "56%", h: "13%",
    start: 0.36, dur: 0.55,
    content: (
      <div className="ui-head">
        <div className="ui-head-name">
          <span className="beacon-dot" aria-hidden="true" />
          <strong>Acme Co.</strong>
        </div>
        <div className="ui-head-chips">
          <StatusChip label="Paid" state="positive" shape="filled" />
          <StatusChip label="Active" state="positive" shape="outline" />
        </div>
      </div>
    ),
  },
  {
    kind: "stats",
    qx: 1, qy: -1,
    x: "18%", y: "19%", w: "56%", h: "12%",
    start: 0.4, dur: 0.55,
    content: (
      <div className="ui-stats">
        <div className="ui-stat">
          <span className="ui-stat-num num">$42,180</span>
          <span className="ui-stat-label">billed</span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-num num">3</span>
          <span className="ui-stat-label">open</span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-num num">9</span>
          <span className="ui-stat-label">projects</span>
        </div>
      </div>
    ),
  },
  { kind: "tl1", qx: 1, qy: -1, x: "18%", y: "34%", w: "62%", h: "7%", start: 0.46, dur: 0.5, content: <TimelineRow icon="branch" label="PR #42 merged" time="2h" /> },
  { kind: "tl2", qx: 1, qy: -1, x: "18%", y: "42.5%", w: "62%", h: "7%", start: 0.5, dur: 0.5, content: <TimelineRow icon="invoice" label="Invoice INV-2026-0001 sent" time="yesterday" /> },
  { kind: "tl3", qx: 1, qy: 1, x: "18%", y: "51%", w: "62%", h: "7%", start: 0.54, dur: 0.5, content: <TimelineRow icon="check" label="Follow-up completed" time="3d" /> },
  { kind: "tl4", qx: 1, qy: 1, x: "18%", y: "59.5%", w: "62%", h: "7%", start: 0.58, dur: 0.5, content: <TimelineRow icon="sticky" label="Note added" time="3d" /> },
  {
    kind: "palette",
    qx: 1, qy: 1,
    x: "70%", y: "63%", w: "27%", h: "26%",
    start: 0.52, dur: 0.6,
    content: (
      <div className="ui-palette">
        <div className="ui-palette-input">
          <Icon name="search" label="" size={14} />
          <span className="num">⌘K</span>
        </div>
        <div className="ui-palette-row">
          <Icon name="plus" label="" size={13} />
          <span>New invoice</span>
          <span className="ui-palette-kbd num">N</span>
        </div>
        <div className="ui-palette-row">
          <Icon name="repo" label="" size={13} />
          <span>Import repo</span>
          <span className="ui-palette-kbd num">I</span>
        </div>
        <div className="ui-palette-row">
          <Icon name="calendar" label="" size={13} />
          <span>Next deadline</span>
          <span className="ui-palette-kbd num">Aug 25</span>
        </div>
      </div>
    ),
  },
];

type TuckKind = { kind: string; icon: IconName; title: string; sub: string };

const TUCKS: TuckKind[] = [
  { kind: "tuckSlack", icon: "chat", title: "lena — invoice looks good", sub: "slack · just now" },
  { kind: "tuckGithub", icon: "repo", title: "you/repo — PR #42", sub: "github · 2h ago" },
  { kind: "tuckSheet", icon: "table", title: "monthly-summary.csv", sub: "spreadsheet · open" },
  { kind: "tuckMiss", icon: "bell", title: "missed follow-up — Acme Co.", sub: "nudge · 3 days" },
];

function NavRow({ icon, label, active }: { icon: IconName; label: string; active?: boolean }) {
  return (
    <span className={`ui-nav-row${active ? " is-active" : ""}`}>
      <Icon name={icon} label={label} size={14} />
      <span>{label}</span>
    </span>
  );
}

function TimelineRow({ icon, label, time }: { icon: IconName; label: string; time: string }) {
  return (
    <span className="ui-tl">
      <span className="ui-tl-glyph">
        <Icon name={icon} label="" size={13} />
      </span>
      <span className="ui-tl-label">{label}</span>
      <time className="ui-tl-time num">{time}</time>
    </span>
  );
}

export default function Hero({ progressRef }: { progressRef: React.RefObject<number> }) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const winRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const win = winRef.current;
      if (!section || !win) return;
      const mode = motionMode();

      const buildTl = (tl: gsap.core.Timeline) => {
        // Window chrome: frame flies to center and fades in as assembly
        // begins. x/y MUST be tweened (to 0) or GSAP keeps the parsed
        // SSR chaos translation forever and the window never centers.
        tl.to(win, { x: 0, y: 0, opacity: 1, scale: 1, rotation: 0, ease: "power2.inOut", duration: 0.6 }, 0.14);

        for (const s of SLOTS) {
          const el = section.querySelector<HTMLElement>(`[data-piece="${s.kind}"]`);
          if (!el) continue;
          tl.to(
            el,
            { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, ease: "power2.inOut", duration: s.dur },
            s.start
          );
        }
        for (const t of TUCKS) {
          const el = section.querySelector<HTMLElement>(`[data-piece="${t.kind}"]`);
          if (!el) continue;
          // Fades to a ghost, then goes fully hidden — no clutter residue
          // behind the assembled window (visibility flips at tween end).
          tl.to(
            el,
            { x: 0, y: 0, rotation: 0, scale: 0.62, opacity: 0.08, visibility: "hidden", ease: "power2.in", duration: 0.5 },
            0.12 + (hash(t.kind) % 10) * 0.018
          );
        }
        // Intro dissolves as the assembled UI takes the stage.
        const intro = section.querySelector<HTMLElement>(".hero-intro");
        const hint = section.querySelector<HTMLElement>(".hero-hint");
        if (intro) tl.to(intro, { opacity: 0, y: -36, ease: "power1.in", duration: 0.5 }, 0.78);
        if (hint) tl.to(hint, { opacity: 0, duration: 0.3 }, 0.7);
        // The settled caption resolves last — the same payoff line the
        // demo and features sections use, closing the hero.
        const caption = section.querySelector<HTMLElement>(".hero-caption");
        if (caption) tl.fromTo(caption, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, 0.86);
      };

      if (mode === "simple") {
        const tl = gsap.timeline({ delay: 0.35, onComplete: playSignalPing });
        buildTl(tl);
        // .is-full lifts the window's base `visibility: hidden` gate exactly
        // as its fade-in begins (same position as the window tween) — the
        // one-shot path has no scroll to drive a class toggle.
        tl.add(() => win.classList.add("is-full"), 0.14);
        tl.play();
        return;
      }

      // Full: scroll-scrubbed, reversible.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 1,
          onUpdate: (self) => {
            if (import.meta.env.DEV) (window as unknown as { __heroProgress: number }).__heroProgress = self.progress;
            if (progressRef.current !== undefined) progressRef.current = self.progress;
            if (self.progress >= 0.999) playSignalPing();
            // Lift the base `visibility: hidden` gate as the assembly begins
            // (window tween starts at timeline 0.14 of ~1.28). Reversible:
            // scrubbing back past the threshold drops the class and the
            // window recedes with the chaos.
            win.classList.toggle("is-full", self.progress >= 0.11);
          },
        },
      });
      buildTl(tl);
      if (import.meta.env.DEV) (window as unknown as { __heroTl: gsap.core.Timeline }).__heroTl = tl;

      // anchors: the topbar/footer section links must actually work through
      // the pins — default Lenis fights native jumps (clicking #features did
      // nothing). Let Lenis own anchor scrolling, offset for the fixed topbar.
      const lenis = new Lenis({ anchors: { offset: -72 } });
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      // Trigger math must run against the FINAL, settled layout
      // (fonts + images loaded) — brief §6.1.
      const refresh = () => ScrollTrigger.refresh();
      document.fonts?.ready.then(refresh).catch(() => {});
      window.addEventListener("load", refresh, { once: true });

      return () => {
        gsap.ticker.remove(tick);
        lenis.destroy();
      };
    },
    { scope: sectionRef, dependencies: [] }
  );

  const windowChaos = chaosFor("window", 1, 1);

  return (
    <section ref={sectionRef} className="hero-section" id="top" aria-label="Entropy to Signal">
      <div ref={stageRef} className="hero-stage">
        <div className="hero-intro">
          <p className="section-kicker">Entropy → Signal</p>
          <h1 className="display">
            Your business is a mess.
            <br />
            <span style={{ color: "var(--text-body)" }}>Signal is the order it becomes.</span>
          </h1>
          <p className="display-sub">
            The chaos of a solo dev business — invoices, repos, follow-ups — assembled into one calm surface. Scroll.
          </p>
        </div>

        <div className="hero-hint" aria-hidden="true">
          <Icon name="arrow-right" label="" size={14} style={{ transform: "rotate(90deg)" }} />
          scroll — watch it assemble
        </div>

        {/* The settled payoff — appears as the assembly completes. */}
        <p className="hero-caption">
          <Icon name="check" label="" size={13} />
          <span>Assembled — one surface for the whole business.</span>
        </p>

        {/* The window: wrapper owns the centering transform; GSAP only
            animates the inner chrome so nothing fights translate(-50%). */}
        <div className="hero-window-wrap">
          <div
            ref={winRef}
            className="hero-window"
            style={{
              transform: `translate3d(${windowChaos.x}px, ${windowChaos.y}px, 0) rotate(${windowChaos.rot}deg) scale(${windowChaos.scale})`,
              opacity: 0,
            }}
          >
            {SLOTS.map((s) => {
              const c = chaosFor(s.kind, s.qx, s.qy);
              return (
                <div
                  key={s.kind}
                  data-piece={s.kind}
                  className="piece"
                  style={{
                    left: s.x,
                    top: s.y,
                    width: s.w,
                    height: s.h,
                    transform: `translate3d(${c.x}px, ${c.y}px, 0) rotate(${c.rot}deg) scale(${c.scale})`,
                    opacity: 0.92,
                  }}
                >
                  {s.content}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pure-clutter pieces — scatter in stage space, tuck away. */}
        {TUCKS.map((t) => {
          const c = tuckChaosFor(t.kind);
          return (
            <div
              key={t.kind}
              data-piece={t.kind}
              className="chaos-card piece"
              style={{
                left: `${c.px * 100}%`,
                top: `${c.py * 100}%`,
                transform: `translate3d(${c.x}px, ${c.y}px, 0) rotate(${c.rot}deg) scale(${c.scale})`,
              }}
            >
              <Icon name={t.icon} label="" size={16} />
              <span className="chaos-title">{t.title}</span>
              <span className="chaos-sub num">{t.sub}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

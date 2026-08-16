import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Icon } from "signal-ui/Icons";
import { motionMode } from "../lib/motionGate";
import { ILLUSTRATIVE_FEED, type PulseFeed, type PulseSource } from "../data/pulse";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* ============================================================
   Pulse — the quiet live stream (brief §3.5, spec §3.5).
   Same visual family as the signal-bar/cursor-trail motif: a
   thin waveform with soft pulse dots. The events come through
   ONE shape (PulseFeed) from either the Cloudflare Pages
   Function (/pulse — the env-gated real-events seam) or, until
   a source exists, the clearly-labeled illustrative set. The
   marker chip and the caption always reflect WHICH one is
   rendering — never fabricated live data.
   ============================================================ */

/* Deterministic waveform — dots and line come from the same
   function, so the dots always sit ON the line. */
const W = 1200;
const H = 72;
const yAt = (x: number) =>
  H / 2 +
  Math.sin((x / W) * Math.PI * 2 * 3.2 + 0.6) * 7 +
  Math.sin((x / W) * Math.PI * 6 + 1.2) * 4;

function wavePath(): string {
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 20) pts.push(`${x},${yAt(x).toFixed(1)}`);
  return pts.join(" ");
}

function dotPos(i: number, n: number): { x: number; y: number } {
  const x = ((i + 0.6) / n) * W;
  return { x, y: yAt(x) };
}

export default function Pulse() {
  const sectionRef = useRef<HTMLElement>(null);
  const [feed, setFeed] = useState<PulseFeed>(ILLUSTRATIVE_FEED);
  const [source, setSource] = useState<PulseSource>(ILLUSTRATIVE_FEED.source);

  // Data, not animation state: one fetch to the /pulse seam.
  // No function / no source / error → stays illustrative, honestly.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 4000);
    fetch("/pulse", { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<PulseFeed>) : null))
      .then((data) => {
        if (
          data &&
          data.source === "live" &&
          Array.isArray(data.events) &&
          data.events.length > 0
        ) {
          setFeed(data);
          setSource("live");
        }
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(t));
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, []);

  const n = feed.events.length;
  const path = wavePath();
  const dots = feed.events.map((_, i) => dotPos(i, n));

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;
      if (motionMode() === "simple") {
        section.classList.add("is-simple");
        return () => section.classList.remove("is-simple");
      }
      // Calm entrance, once: the line draws, then rows rise in
      // a soft stagger. No pin, no scrub — this section breathes.
      const tl = gsap.timeline({
        scrollTrigger: { trigger: section, start: "top 78%", once: true },
      });
      const line = section.querySelector<SVGPolylineElement>("[data-wave-line]");
      if (line) {
        const len = line.getTotalLength();
        line.style.strokeDasharray = `${len}`;
        line.style.strokeDashoffset = `${len}`;
        tl.to(line, { strokeDashoffset: 0, duration: 1.1, ease: "power1.inOut" }, 0);
      }
      tl.fromTo(
        section.querySelectorAll(".pulse-row"),
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.045 },
        0.25
      );
      tl.fromTo(
        section.querySelectorAll(".pulse-dot"),
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.6)", stagger: 0.05 },
        0.4
      );
    },
    { scope: sectionRef }
  );

  const isLive = source === "live";

  return (
    <section ref={sectionRef} className="pulse-section section" id="pulse" aria-label="Live activity pulse">
      <div className="pulse-intro">
        <p className="section-kicker">Pulse</p>
        <h2 className="section-title">The product, running.</h2>
        <p className="display-sub">
          A quiet stream of Signal doing its job — invoices going out, repos connecting, follow-ups closing.
        </p>
      </div>

      <div className="pulse-panel">
        <div className="pulse-head">
          <span className={`pulse-status${isLive ? " is-live" : ""}`}>
            <span className="pulse-status-dot" aria-hidden="true" />
            {isLive ? "Live" : "Illustrative sample"}
          </span>
          <span className="pulse-count num">{n} events</span>
        </div>

        <div className="pulse-wave-wrap" aria-hidden="true">
          <svg className="pulse-wave" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <polyline data-wave-line points={path} fill="none" />
          </svg>
          {dots.map((d, i) => (
            <span
              key={feed.events[i]?.id ?? i}
              className="pulse-dot"
              style={{ left: `${(d.x / W) * 100}%`, top: `${(d.y / H) * 100}%` }}
            />
          ))}
        </div>

        <ul className="pulse-rows">
          {feed.events.map((e) => (
            <li key={e.id} className="pulse-row">
              <span className="pulse-row-glyph">
                <Icon name={e.icon} label="" size={14} />
              </span>
              <span className="pulse-row-main">
                <span className="pulse-row-label">{e.label}</span>
                {e.detail && <span className="pulse-row-detail">{e.detail}</span>}
              </span>
              <time className="pulse-row-time num">{e.time}</time>
            </li>
          ))}
        </ul>
      </div>

      <p className="pulse-note">
        {isLive
          ? "Real anonymized events from the running product."
          : "Until Signal is deployed, this stream is a clearly-labeled illustrative sample — no fabricated data."}
      </p>
    </section>
  );
}

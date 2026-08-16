import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { SignalBar } from "signal-ui/SignalBar";
import { Icon } from "signal-ui/Icons";
import { motionMode } from "../lib/motionGate";
import { APP_URL, hasAppUrl } from "../config";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* ============================================================
   Footer / CTA — the bookend (brief §3.7).
   The signal-bar mark returns once more. The CTA assembles in
   the same build-order language as the rest of the page (mark →
   headline → sub → truths → actions), scrubbed as it enters —
   then the footer grid and meta resolve. The mark keeps its
   single calm pulse, closing the loop the hero opened.
   ============================================================ */

const TRUTHS = [
  "Free forever — no tiers, no trials",
  "Your data is yours — export or delete anytime",
  "No lock-in, no ransom",
];

export default function Footer() {
  const rootRef = useRef<HTMLElement>(null);
  const markRef = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      if (motionMode() === "simple") {
        markRef.current?.style.setProperty("opacity", "1");
        return;
      }
      const root = rootRef.current;
      const mark = markRef.current;
      if (!root || !mark) return;

      const tl = gsap.timeline({
        scrollTrigger: { trigger: root, start: "top 85%", end: "top 35%", scrub: 1 },
      });
      const pieces = [
        mark,
        root.querySelector("h2"),
        root.querySelector(".display-sub"),
        root.querySelector(".footer-truths"),
        root.querySelector(".footer-actions"),
        root.querySelector(".footer-grid"),
        root.querySelector(".footer-meta"),
      ].filter((el): el is HTMLElement => Boolean(el));
      pieces.forEach((p, i) => {
        tl.fromTo(p, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, i * 0.16);
      });

      // The mark's one calm pulse rides on top of the assembly.
      tl.fromTo(mark, { scale: 0.85 }, { scale: 1, duration: 0.7, ease: "power2.out" }, 0)
        .fromTo(
          mark,
          { boxShadow: "0 0 0 0 rgba(247,248,248,0)" },
          { boxShadow: "0 0 0 10px rgba(247,248,248,0)", duration: 0.9, ease: "power1.out" },
          0.3
        );
      return () => tl.kill();
    },
    { scope: rootRef }
  );

  const primaryHref = hasAppUrl ? APP_URL : "#demo";
  const primaryLabel = hasAppUrl ? "Open Signal" : "See it run";

  return (
    <footer ref={rootRef} className="site-footer" id="bookend">
      <div className="footer-cta">
        <SignalBar ref={markRef} size={44} className="mark" />
        <h2 className="display" style={{ fontSize: "clamp(28px, 4.4vw, 44px)" }}>
          From entropy to signal.
        </h2>
        <p className="display-sub" style={{ marginBottom: "var(--space-5)" }}>
          Free forever. Built for one freelancer at a time — you.
        </p>

        <ul className="footer-truths">
          {TRUTHS.map((t) => (
            <li key={t}>
              <Icon name="check" label="" size={13} />
              <span>{t}</span>
            </li>
          ))}
        </ul>

        <div className="footer-actions">
          <a className="btn btn-primary" href={primaryHref} style={{ height: 44, padding: "0 22px" }}>
            {primaryLabel}
          </a>
          <a className="btn btn-ghost" href="#pricing" style={{ height: 44, padding: "0 22px" }}>
            Read the pricing
          </a>
        </div>
      </div>

      <div className="footer-grid">
        <div className="footer-brand">
          <span className="footer-brand-mark">
            <SignalBar size={16} className="mark" />
            <span>Signal</span>
          </span>
          <p>The calm surface for a solo dev business. Invoices, repos, follow-ups — one timeline.</p>
        </div>
        <nav className="footer-nav" aria-label="Page sections">
          <span className="footer-nav-label num">Page</span>
          <a href="#features">Features</a>
          <a href="#demo">Demo</a>
          <a href="#terminal">Terminal</a>
          <a href="#pulse">Pulse</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <nav className="footer-nav" aria-label="Product">
          <span className="footer-nav-label num">Product</span>
          <a href={primaryHref}>{primaryLabel}</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </div>

      <div className="footer-meta">
        <span>© 2026 Signal — donation-funded, free forever</span>
        <span className="num">entropy → signal</span>
      </div>
    </footer>
  );
}

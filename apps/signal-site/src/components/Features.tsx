import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Icon } from "signal-ui/Icons";
import { motionMode } from "../lib/motionGate";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* ============================================================
   Features — the pipeline scrollytelling (brief §3.2)
   One DOM element — a merged PR — continuously transforms:
   GitHub row → timeline event → invoice line item, scrubbed
   by scroll position (the hero's technique, calmer register).
   A second example (Follow-up completed) fills the timeline
   and deliberately does NOT bill — the pipeline discriminates.
   Calm: panels assemble once at pin start, everything else is
   precise positioning, no spectacle.
   ============================================================ */

export default function Features() {
  const sectionRef = useRef<HTMLElement>(null);
  const resizeTimer = useRef<number | undefined>(undefined);
  const pinWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const ghSlotRef = useRef<HTMLDivElement>(null);
  const tlSlotRef = useRef<HTMLDivElement>(null);
  const invSlotRef = useRef<HTMLDivElement>(null);
  const tl2SlotRef = useRef<HTMLDivElement>(null);
  const travelerRef = useRef<HTMLDivElement>(null);
  const followupRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const pinWrap = pinWrapRef.current;
      const stage = stageRef.current;
      const traveler = travelerRef.current;
      if (!section || !pinWrap || !stage || !traveler) return;
      const mode = motionMode();
      if (import.meta.env.DEV) {
        document.body.dataset.featEffect = mode;
      }

      // Dev-only hook for deterministic scrub verification.
      if (import.meta.env.DEV) {
        (window as unknown as { ScrollTrigger: typeof ScrollTrigger }).ScrollTrigger = ScrollTrigger;
      }

      let cleanupCurrent: (() => void) | undefined;

      /** Slot positions relative to the stage — measured fresh each build. */
      const measure = () => {
        const sr = stage.getBoundingClientRect();
        const rel = (el: HTMLElement | null) => {
          if (!el) return { x: 0, y: 0, w: 0, h: 0 };
          const r = el.getBoundingClientRect();
          return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height };
        };
        return {
          gh: rel(ghSlotRef.current),
          tl: rel(tlSlotRef.current),
          inv: rel(invSlotRef.current),
          tl2: rel(tl2SlotRef.current),
        };
      };

      /** Shared morph/assembly/fill tweens — axis-agnostic. */
      const addMorph = (tl: gsap.core.Timeline, dx1: number, dy1: number, dx2: number, dy2: number) => {
        const q = (sel: string) => section?.querySelector<HTMLElement>(sel);
        const regGh = q("[data-trav-gh]");
        const regTl = q("[data-trav-tl]");
        const regInv = q("[data-trav-inv]");
        const chipOpen = q("[data-chip-open]");
        const chipDone = q("[data-chip-done]");
        const ghGhost = ghSlotRef.current?.querySelector<HTMLElement>(".ghost");
        const tlGhost = tlSlotRef.current?.querySelector<HTMLElement>(".ghost");
        const invGhost = invSlotRef.current?.querySelector<HTMLElement>(".ghost");
        const totalOld = q("[data-total-old]");
        const totalNew = q("[data-total-new]");
        const followup = followupRef.current;
        const caption = captionRef.current;
        const title = titleRef.current;
        const panels = section?.querySelectorAll<HTMLElement>("[data-feat]");

        // Assembly (pin start) — staggered, calm.
        if (title) tl.fromTo(title, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" }, 0);
        if (panels) {
          panels.forEach((p, i) => {
            tl.fromTo(
              p,
              { opacity: 0, y: 22 },
              { opacity: 1, y: 0, duration: 0.32, ease: "power2.out" },
              0.06 + i * 0.08
            );
          });
        }

        // Merge beat — the PR chips swap, a resolved pulse lands.
        if (chipOpen && chipDone) {
          tl.to(chipOpen, { opacity: 0, duration: 0.14 }, 0.34);
          tl.fromTo(
            chipDone,
            { opacity: 0, scale: 0.9, display: "inline-flex" },
            { opacity: 1, scale: 1, duration: 0.2, ease: "power2.out" },
            0.4
          );
          tl.fromTo(
            chipDone,
            { boxShadow: "0 0 0 0 rgba(110,139,110,0.35)" },
            { boxShadow: "0 0 0 8px rgba(110,139,110,0)", duration: 0.8, ease: "power1.out" },
            0.42
          );
        }

        // Travel 1: GitHub row -> timeline event (morphs mid-flight).
        if (ghGhost) tl.to(ghGhost, { opacity: 0, duration: 0.2 }, 0.52);
        tl.to(traveler, { x: dx1, y: dy1, duration: 0.85, ease: "power2.inOut" }, 0.55);
        if (regGh) tl.to(regGh, { opacity: 0, y: -4, duration: 0.18 }, 1.0);
        if (regTl) tl.fromTo(regTl, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.22 }, 1.06);
        if (tlGhost) tl.to(tlGhost, { opacity: 0, duration: 0.2 }, 1.22);

        // Travel 2: timeline event -> invoice line item.
        tl.to(traveler, { x: dx2, y: dy2, duration: 0.85, ease: "power2.inOut" }, 1.4);
        if (regTl) tl.to(regTl, { opacity: 0, y: -4, duration: 0.18 }, 1.85);
        if (regInv) tl.fromTo(regInv, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.22 }, 1.91);
        if (invGhost) tl.to(invGhost, { opacity: 0, duration: 0.2 }, 2.07);

        // The second example fills — follow-up completes, does NOT bill.
        if (followup) {
          tl.fromTo(
            followup,
            { opacity: 0, y: 6 },
            { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" },
            2.3
          );
        }

        // Invoice total catches up.
        if (totalOld && totalNew) {
          tl.to(totalOld, { opacity: 0, duration: 0.16 }, 2.42);
          tl.fromTo(totalNew, { opacity: 0 }, { opacity: 1, duration: 0.24 }, 2.5);
        }

        // The calm payoff line.
        if (caption) {
          tl.fromTo(
            caption,
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, duration: 0.34, ease: "power2.out" },
            2.72
          );
        }
      };

      const buildTimeline = () => {
        const p = measure();
        const dx1 = p.tl.x - p.gh.x;
        const dy1 = p.tl.y - p.gh.y;
        const dx2 = p.inv.x - p.gh.x;
        const dy2 = p.inv.y - p.gh.y;
        return { dx1, dy1, dx2, dy2 };
      };

      const createProof = () => {
        // Scrub-driven stagger as the proof cards enter (like the demo's
        // build order — never a flat fade). SSR stays opacity 1.
        const cards = section.querySelectorAll<HTMLElement>(".feat-proof-intro, .feat-proof-card, .feat-proof-strip");
        if (!cards.length) return () => {};
        if (mode === "simple") return () => {};
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section.querySelector(".feat-proof"),
            start: "top 95%",
            end: "+=380",
            scrub: 1,
          },
        });
        cards.forEach((c, i) => {
          tl.fromTo(c, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, i * 0.14);
        });
        if (import.meta.env.DEV) {
          (window as unknown as { __featProofTl: gsap.core.Timeline }).__featProofTl = tl;
        }
        return () => tl.kill();
      };

      const createFull = () => {
        const mm = gsap.matchMedia();

        // Desktop — horizontal travel across three side-by-side panels.
        mm.add("(min-width: 768px)", () => {
          const { dx1, dy1, dx2, dy2 } = buildTimeline();
          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: pinWrap,
              start: "top top",
              end: "bottom bottom",
              scrub: 1,
            },
          });
          addMorph(tl, dx1, dy1, dx2, dy2);
          if (import.meta.env.DEV) {
            (window as unknown as { __featTlDesktop: gsap.core.Timeline }).__featTlDesktop = tl;
            document.body.dataset.featHooks = "desktop";
          }
        });

        // Mobile — panels stack; travel becomes vertical.
        mm.add("(max-width: 767.98px)", () => {
          const { dx1, dy1, dx2, dy2 } = buildTimeline();
          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: pinWrap,
              start: "top top",
              end: "bottom bottom",
              scrub: 1,
            },
          });
          addMorph(tl, dx1, dy1, dx2, dy2);
          if (import.meta.env.DEV) {
            (window as unknown as { __featTlMobile: gsap.core.Timeline }).__featTlMobile = tl;
            document.body.dataset.featHooks = "mobile";
          }
        });

        const refresh = () => ScrollTrigger.refresh();
        document.fonts?.ready.then(refresh).catch(() => {});
        window.addEventListener("load", refresh, { once: true });

        return () => mm.revert();
      };

      const createSimple = () => {
        // Gate path: one-shot play of the same sequence, no pin/scrub.
        section.classList.add("is-simple");
        const { dx1, dy1, dx2, dy2 } = buildTimeline();
        const tl = gsap.timeline({ delay: 0.35 });
        addMorph(tl, dx1, dy1, dx2, dy2);
        tl.play();
        return () => {
          tl.kill();
          section.classList.remove("is-simple");
        };
      };

      const create = () => {
        cleanupCurrent?.();
        // IIFE — build BOTH timelines now (this thunk-less form matches the
        // createSimple branch: create() must run the builders immediately,
        // returning only the cleanup to hold for teardown/resize).
        cleanupCurrent = mode === "simple" ? createSimple() : (() => {
          const killFull = createFull();
          const killProof = createProof();
          return () => {
            killFull?.();
            killProof?.();
          };
        })();
      };

      create();
      const onResize = () => {
        window.clearTimeout(resizeTimer.current);
        resizeTimer.current = window.setTimeout(create, 200);
      };
      window.addEventListener("resize", onResize);

      return () => {
        window.clearTimeout(resizeTimer.current);
        window.removeEventListener("resize", onResize);
        cleanupCurrent?.();
      };
    },
    { scope: sectionRef, dependencies: [] }
  );

  return (
    <section ref={sectionRef} className="feat-section" id="features" aria-label="Features — the pipeline">
      {/* The 300vh pin runway owns the sticky stage; the proof points below
          enter only AFTER the pin releases — no overlap with the panels. */}
      <div ref={pinWrapRef} className="feat-pin-wrap">
      <div ref={stageRef} className="feat-stage">
        <div ref={titleRef} className="feat-title">
          <p className="section-kicker">Features</p>
          <h2 className="section-title">Your work, already accounted for.</h2>
          <p className="display-sub">
            The GitHub-aware timeline. Auto-generated invoice lines. One continuous pipeline.
          </p>
        </div>

        <div className="feat-panels">
          {/* GitHub */}
          <div className="feat-panel" data-feat="gh">
            <div className="feat-panel-head">
              <Icon name="repo" label="" size={14} />
              <span>GitHub</span>
            </div>
            <div className="feat-rows">
              <div className="feat-row feat-slot" ref={ghSlotRef}>
                <span className="ghost" aria-hidden="true" />
                {/* The traveler lives INSIDE the GitHub slot (natural SSR
                    position), then flies to the other slots via offsets. */}
                <div className="feat-traveler" ref={travelerRef}>
                  <div className="trav-reg trav-gh" data-trav-gh>
                    <Icon name="branch" label="" size={13} />
                    <span className="feat-row-label">feat: billing export</span>
                    <span className="feat-row-meta num">PR #42 · 2 files</span>
                    <span className="trav-chip" data-chip-open>
                      Merge
                    </span>
                    <span className="trav-chip trav-chip-done" data-chip-done>
                      <span className="trav-dot" aria-hidden="true" />
                      Merged
                    </span>
                  </div>
                  <div className="trav-reg trav-tl" data-trav-tl>
                    <span className="trav-glyph">
                      <Icon name="check" label="" size={12} />
                    </span>
                    <span className="feat-row-label">feat: billing export</span>
                    <span className="feat-row-meta num">today 14:02</span>
                  </div>
                  <div className="trav-reg trav-inv" data-trav-inv>
                    <Icon name="invoice" label="" size={13} />
                    <span className="feat-row-label">Dev work — feat: billing export</span>
                    <span className="feat-row-amt num">$250.00</span>
                  </div>
                </div>
              </div>
              <div className="feat-row is-dim">
                <Icon name="branch" label="" size={13} />
                <span className="feat-row-label">chore: bump deps</span>
                <span className="feat-row-meta num">open · PR #45</span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="feat-panel" data-feat="tl">
            <div className="feat-panel-head">
              <Icon name="clock" label="" size={14} />
              <span>Timeline</span>
            </div>
            <div className="feat-rows">
              <div className="feat-row feat-slot" ref={tlSlotRef}>
                <span className="ghost" aria-hidden="true" />
              </div>
              <div className="feat-row feat-slot" ref={tl2SlotRef}>
                <span className="ghost" aria-hidden="true" />
                <div className="feat-row feat-followup" ref={followupRef}>
                  <span className="trav-glyph">
                    <Icon name="check" label="" size={12} />
                  </span>
                  <span className="feat-row-label">Follow-up completed</span>
                  <span className="feat-row-meta num">3d</span>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice */}
          <div className="feat-panel" data-feat="inv">
            <div className="feat-panel-head">
              <Icon name="invoice" label="" size={14} />
              <span>
                Invoice <span className="num inv-no">INV-2026-0007</span>
              </span>
            </div>
            <div className="feat-rows">
              <div className="feat-row is-dim">
                <Icon name="invoice" label="" size={13} />
                <span className="feat-row-label">Design system</span>
                <span className="feat-row-amt num">$1,250.00</span>
              </div>
              <div className="feat-row feat-slot" ref={invSlotRef}>
                <span className="ghost" aria-hidden="true" />
              </div>
            </div>
            <div className="feat-total">
              <span>Total</span>
              <span className="feat-total-old num" data-total-old>
                $1,250.00
              </span>
              <span className="feat-total-new num" data-total-new>
                $1,500.00
              </span>
            </div>
          </div>
        </div>

        <div className="feat-caption" ref={captionRef}>
          <Icon name="arrow-right" label="" size={14} style={{ transform: "rotate(90deg)" }} />
          <span>
            One merge. One timeline event. One invoice line. <strong>Nothing typed twice.</strong>
          </span>
        </div>
      </div>
      </div>

      {/* Below the pin — proof points, staggered in as they enter. */}
      <div className="feat-proof">
        <div className="feat-proof-intro">
          <p className="section-kicker">The pipeline</p>
          <h3>Three steps. Zero re-typing.</h3>
          <p>The GitHub-aware timeline and the invoice lines it feeds are one continuous thing — not three apps bolted together.</p>
        </div>
        <div className="feat-proof-card">
          <span className="feat-proof-step num">01</span>
          <Icon name="repo" label="Merge" size={18} />
          <h3>Merge</h3>
          <p>A PR lands. Signal sees it in your timeline — commits, files, context kept.</p>
        </div>
        <div className="feat-proof-card">
          <span className="feat-proof-step num">02</span>
          <Icon name="clock" label="Track" size={18} />
          <h3>Track</h3>
          <p>The merge becomes a timeline entry. Time and hours follow it around.</p>
        </div>
        <div className="feat-proof-card">
          <span className="feat-proof-step num">03</span>
          <Icon name="invoice" label="Invoice" size={18} />
          <h3>Invoice</h3>
          <p>Drag it into an invoice — it becomes a billable line. Rate and hours come with it.</p>
        </div>
        <div className="feat-proof-strip">
          <span className="feat-proof-strip-label">Signal reads</span>
          <span className="num">commits · PRs · issues · time · rates</span>
        </div>
      </div>
    </section>
  );
}

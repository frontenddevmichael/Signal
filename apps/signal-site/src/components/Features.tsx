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

   ARCHITECTURE — panels literally hand data to one another:
   1. A dedicated "signal layer" sits ABOVE the panel grid as a
      SIBLING (not a child of any one panel), so the traveling
      packet is never clipped by a panel's own overflow:hidden.
   2. The three blocks assemble FIRST, each ghost slot already
      showing where the row will land. The traveler then ENTERS
      the first block as its own beat — it isn't parked there
      before anything else appears.
   3. Every "arrival" is a GSAP label. Everything that reacts to
      an arrival (chip morph, panel glow, followup fill, total
      tick, arrival pulse) is positioned RELATIVE to that label
      ("<", "+=", label refs) instead of an absolute timestamp.
      Insert a beat earlier in the sequence and everything
      downstream re-flows correctly — nothing to re-tune by eye.
   4. Each panel flips a `data-received` attribute at the exact
      label its packet lands; a plain CSS transition on that
      attribute is the panel's own "I got it" reaction. This
      stays scrub-reversible (GSAP timeline .set() calls revert
      correctly on scrub-back) without needing real DOM events,
      which break under fast/jump scrubbing.
   ============================================================ */

export default function Features() {
  const sectionRef = useRef<HTMLElement>(null);
  const resizeTimer = useRef<number | undefined>(undefined);
  const pinWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const signalLayerRef = useRef<HTMLDivElement>(null);
  const ghSlotRef = useRef<HTMLDivElement>(null);
  const tlSlotRef = useRef<HTMLDivElement>(null);
  const invSlotRef = useRef<HTMLDivElement>(null);
  const tl2SlotRef = useRef<HTMLDivElement>(null);
  const travelerRef = useRef<HTMLDivElement>(null);
  const followupRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const dotTlRef = useRef<HTMLDivElement>(null);
  const dotInvRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const pinWrap = pinWrapRef.current;
      const stage = stageRef.current;
      const arena = arenaRef.current;
      const traveler = travelerRef.current;
      if (!section || !pinWrap || !stage || !arena || !traveler) return;
      const mode = motionMode();
      if (import.meta.env.DEV) {
        document.body.dataset.featEffect = mode;
      }

      // Dev-only hook for deterministic scrub verification.
      if (import.meta.env.DEV) {
        (window as unknown as { ScrollTrigger: typeof ScrollTrigger }).ScrollTrigger = ScrollTrigger;
      }

      let cleanupCurrent: (() => void) | undefined;

      /** Slot rects relative to the arena — the shared coordinate space
       *  for the traveler and the arrival pulses. Measuring against the
       *  arena (not the individual panels) keeps the traveler's motion
       *  correct regardless of the panel stacking order. */
      const measure = () => {
        const ar = arena.getBoundingClientRect();
        const rel = (el: HTMLElement | null) => {
          if (!el) return { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };
          const r = el.getBoundingClientRect();
          const x = r.left - ar.left;
          const y = r.top - ar.top;
          return { x, y, w: r.width, h: r.height, cx: x + r.width / 2, cy: y + r.height / 2 };
        };
        return {
          gh: rel(ghSlotRef.current),
          tl: rel(tlSlotRef.current),
          inv: rel(invSlotRef.current),
          tl2: rel(tl2SlotRef.current),
        };
      };

      /** Shared morph/assembly/fill tweens — axis-agnostic, driven
       *  entirely by relative positioning off labels. */
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
        const ghPanel = q('[data-feat="gh"]');
        const tlPanel = q('[data-feat="tl"]');
        const invPanel = q('[data-feat="inv"]');
        const dotTl = dotTlRef.current;
        const dotInv = dotInvRef.current;

        // Reset every panel's "received" flag and the traveler's parked
        // visibility at the very start of the sequence, so scrubbing back
        // to zero always reads as un-fed and un-entered.
        tl.set([tlPanel, invPanel].filter(Boolean) as HTMLElement[], { attr: { "data-received": "false" } }, 0);
        tl.set(traveler, { opacity: 0 }, 0);
        if (dotTl) tl.set(dotTl, { opacity: 0, scale: 0.6 }, 0);
        if (dotInv) tl.set(dotInv, { opacity: 0, scale: 0.6 }, 0);

        // ---- Assembly (pin start) — staggered, calm. The THREE BLOCKS
        // land first, each with its own ghost slot already showing where
        // the traveling row will land. The traveler itself stays hidden
        // until the blocks are settled — it enters the first block as its
        // own beat, it isn't parked there before anything else appears. ----
        tl.addLabel("assemble");
        if (title) {
          tl.fromTo(title, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" }, "assemble");
        }
        if (panels) {
          panels.forEach((p, i) => {
            tl.fromTo(
              p,
              { opacity: 0, y: 22 },
              { opacity: 1, y: 0, duration: 0.32, ease: "power2.out" },
              i === 0 ? "assemble+=0.06" : "<0.08"
            );
          });
        }
        tl.addLabel("assembled");

        // ---- The traveler enters the FIRST block — a settled landing
        // into the GitHub slot, after the blocks have assembled. ----
        tl.addLabel("enter", "assembled+=0.25");
        if (regGh) tl.set(regGh, { opacity: 1 }, "enter");
        tl.fromTo(traveler, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, "enter");
        if (ghGhost) tl.to(ghGhost, { opacity: 0, duration: 0.2 }, "enter+=0.25");

        // ---- Merge beat — the PR chips swap. ----
        tl.addLabel("merge", "enter+=0.3");
        if (chipOpen) tl.to(chipOpen, { opacity: 0, duration: 0.14 }, "merge");
        if (chipDone) {
          tl.fromTo(
            chipDone,
            { opacity: 0, scale: 0.9, display: "inline-flex" },
            { opacity: 1, scale: 1, duration: 0.2, ease: "power2.out" },
            "merge+=0.06"
          );
          tl.fromTo(
            chipDone,
            { boxShadow: "0 0 0 0 rgba(110,139,110,0.35)" },
            { boxShadow: "0 0 0 8px rgba(110,139,110,0)", duration: 0.8, ease: "power1.out" },
            "<"
          );
        }
        tl.addLabel("merged", "merge+=0.18");

        // ---- Travel 1: GitHub row -> timeline event. The packet only
        // reads at the stations: it fades out as it leaves the source slot,
        // stays invisible over the gap, and fades back in as it enters the
        // destination slot — it never hovers over the panels or the
        // background between them. No connector line; the arrival pulse
        // and the panel's "received" glow carry the moment of landing. ----
        tl.addLabel("travel1-start", "merged+=0.03");
        tl.to(traveler, { opacity: 0, duration: 0.2, ease: "power1.in" }, "travel1-start");
        tl.to(traveler, { x: dx1, y: dy1, duration: 0.85, ease: "power2.inOut" }, "travel1-start");
        tl.addLabel("gh-arrive", "travel1-start+=0.85");
        tl.to(traveler, { opacity: 1, duration: 0.2, ease: "power1.out" }, "gh-arrive-=0.2");
        // The instant the packet lands, the timeline panel is marked as
        // fed — its border glow (pure CSS transition) and the arrival
        // pulse both key off this one moment.
        if (tlPanel) tl.set(tlPanel, { attr: { "data-received": "true" } }, "gh-arrive");
        if (dotTl) {
          tl.to(dotTl, { opacity: 1, scale: 1, duration: 0.16, ease: "power2.out" }, "gh-arrive")
            .to(dotTl, { opacity: 0, duration: 0.5, ease: "power1.out" }, "gh-arrive+=0.3");
        }
        if (regGh) tl.to(regGh, { opacity: 0, y: -4, duration: 0.18 }, "gh-arrive+=0.05");
        if (regTl) tl.fromTo(regTl, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.22 }, "<0.05");
        if (tlGhost) tl.to(tlGhost, { opacity: 0, duration: 0.2 }, "<0.1");
        tl.addLabel("tl-settled", "gh-arrive+=0.42");

        // ---- Travel 2: timeline event -> invoice line item. Positioned
        // relative to "tl-settled", not to a global clock. Same station-only
        // visibility as Travel 1 — fade out on departure, hidden over the
        // gap, fade back in on arrival. ----
        tl.addLabel("travel2-start", "tl-settled+=0.1");
        tl.to(traveler, { opacity: 0, duration: 0.2, ease: "power1.in" }, "travel2-start");
        tl.to(traveler, { x: dx2, y: dy2, duration: 0.85, ease: "power2.inOut" }, "travel2-start");
        tl.addLabel("inv-arrive", "travel2-start+=0.85");
        tl.to(traveler, { opacity: 1, duration: 0.2, ease: "power1.out" }, "inv-arrive-=0.2");
        if (invPanel) tl.set(invPanel, { attr: { "data-received": "true" } }, "inv-arrive");
        if (dotInv) {
          tl.to(dotInv, { opacity: 1, scale: 1, duration: 0.16, ease: "power2.out" }, "inv-arrive")
            .to(dotInv, { opacity: 0, duration: 0.5, ease: "power1.out" }, "inv-arrive+=0.3");
        }
        if (regTl) tl.to(regTl, { opacity: 0, y: -4, duration: 0.18 }, "inv-arrive+=0.05");
        if (regInv) tl.fromTo(regInv, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.22 }, "<0.05");
        if (invGhost) tl.to(invGhost, { opacity: 0, duration: 0.2 }, "<0.1");

        // ---- The second example fills — follow-up completes, does NOT
        // bill. It rides in off the SAME "tl-settled" moment as the first
        // packet's timeline landing: two things caused by one arrival. ----
        if (followup) {
          tl.fromTo(
            followup,
            { opacity: 0, y: 6 },
            { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" },
            "tl-settled+=0.35"
          );
        }

        // ---- Invoice total catches up — caused by the invoice arrival,
        // not by a coincidentally-nearby timestamp. ----
        if (totalOld && totalNew) {
          tl.to(totalOld, { opacity: 0, duration: 0.16 }, "inv-arrive+=0.2");
          tl.fromTo(totalNew, { opacity: 0 }, { opacity: 1, duration: 0.24 }, "<0.08");
        }

        // ---- The calm payoff line — waits for the total to have caught
        // up, i.e. for every downstream effect of the merge to resolve. ----
        if (caption) {
          tl.fromTo(
            caption,
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, duration: 0.34, ease: "power2.out" },
            "inv-arrive+=0.72"
          );
        }
      };

      const buildTimeline = () => {
        const p = measure();
        const dx1 = p.tl.x - p.gh.x;
        const dy1 = p.tl.y - p.gh.y;
        const dx2 = p.inv.x - p.gh.x;
        const dy2 = p.inv.y - p.gh.y;

        // Park the traveler exactly over the GitHub slot's measured box —
        // it no longer inherits this from being a DOM child of that slot,
        // since it now lives in the sibling signal layer.
        gsap.set(traveler, { x: 0, y: 0, left: p.gh.x, top: p.gh.y, width: p.gh.w, height: p.gh.h });

        if (dotTlRef.current) gsap.set(dotTlRef.current, { left: p.tl.cx, top: p.tl.cy });
        if (dotInvRef.current) gsap.set(dotInvRef.current, { left: p.inv.cx, top: p.inv.cy });

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

        // Mobile — panels stack; travel becomes vertical. Same relative
        // label chain, just fed different dx/dy/length values from a
        // fresh measure() — the wire and arrivals stay correct either way.
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
        // The wire/dot/data-received choreography still runs — it just
        // plays once instead of being scrubbed — so the "signals travel"
        // story holds even on the reduced-motion-adjacent simple path.
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

        <div ref={arenaRef} className="feat-arena">
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

          {/* The signal layer — sibling of the panel grid, never clipped by
              a panel's overflow:hidden. Owns the traveler and the arrival
              pulses (no connector lines — the packet reads only at the
              stations, so a wire would be a meaningless trail). */}
          <div ref={signalLayerRef} className="feat-signal-layer" aria-hidden="true">
            <div className="signal-dot" ref={dotTlRef} />
            <div className="signal-dot" ref={dotInvRef} />

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
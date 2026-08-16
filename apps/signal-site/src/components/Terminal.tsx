import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { SignalBar } from "signal-ui/SignalBar";
import { Icon, type IconName } from "signal-ui/Icons";
import { motionMode } from "../lib/motionGate";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* ============================================================
   Terminal — the interactive moment (brief §3.4).
   A fake-but-convincing sandboxed terminal: `signal import
   github.com/you/repo` triggers a HAND-ROLLED typewriter that
   populates a mini timeline beside it. Real focus handling
   (the prompt is a real input), Esc completes/skips the
   sequence instantly, and a polite aria-live region announces
   completion for screen readers. Labeled "scripted demo" — the
   honesty the product's voice demands.
   ============================================================ */

type Phase = "idle" | "running" | "done";

const SCRIPT: { line: string; tone: "ok" | "info"; row?: { icon: IconName; label: string; time: string } }[] = [
  { line: "connected to github.com/you/repo", tone: "ok" },
  { line: "fetched 214 commits", tone: "info" },
  { line: "matched 8 pull requests", tone: "info" },
  { line: "PR #128 merged — auth refactor", tone: "info", row: { icon: "branch", label: "PR #128 merged — auth refactor", time: "now" } },
  { line: "PR #127 merged — cache layer", tone: "info", row: { icon: "branch", label: "PR #127 merged — cache layer", time: "now" } },
  { line: "added invoice line — Dev work · PR #128 — $350.00", tone: "ok", row: { icon: "invoice", label: "Invoice line — Dev work · PR #128", time: "$350.00" } },
  { line: "added invoice line — Dev work · PR #127 — $280.00", tone: "ok", row: { icon: "invoice", label: "Invoice line — Dev work · PR #127", time: "$280.00" } },
  { line: "backfilled 3 commits into the timeline", tone: "info", row: { icon: "repo", label: "3 commits backfilled", time: "now" } },
];

const DEFAULT_CMD = "signal import github.com/you/repo";
const CHAR_MS = 16;

export default function Terminal() {
  const sectionRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typed, setTyped] = useState(""); // user's current input
  const [echoed, setEchoed] = useState("");
  const [doneLines, setDoneLines] = useState<string[]>([]);
  const [typingLine, setTypingLine] = useState<{ text: string; chars: number } | null>(null);
  const [rows, setRows] = useState<{ id: string; icon: IconName; label: string; time: string }[]>([]);
  const [announce, setAnnounce] = useState("");

  const timers = useRef<number[]>([]);
  const simple = useRef(false);
  simple.current = typeof window !== "undefined" && motionMode() === "simple";

  // Refs mirroring live state for the observers below (no stale closures).
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const runRef = useRef<(cmd: string) => void>(() => {});
  const autoRanRef = useRef(false);

  // Rows carry a stable id for React keys (the script's row lacks one).
  const allRows = () =>
    SCRIPT.flatMap((s, i) => (s.row ? [{ ...s.row, id: `${i}-${s.row.label}` }] : []));

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => () => clearTimers(), []);

  // Auto-trigger: the FIRST time the terminal scrolls into view, the default
  // command types itself into the prompt and runs — a scripted demo that
  // needs no click (replay stays available via the pill). Focus is NOT
  // stolen: the input fills on screen, then the sequence executes.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || autoRanRef.current || phaseRef.current !== "idle") continue;
          autoRanRef.current = true;
          const cmd = DEFAULT_CMD;
          let i = 0;
          const tick = () => {
            // The user started a run (or Esc'd) mid-auto-type — back off.
            if (phaseRef.current !== "idle") return;
            if (i > cmd.length) {
              runRef.current(cmd);
              return;
            }
            setTyped(cmd.slice(0, i));
            i += 1;
            timers.current.push(window.setTimeout(tick, 30));
          };
          tick();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(section);
    return () => io.disconnect();
  }, []);

  // The demo-style construction: intro, terminal panel, and timeline panel
  // assemble in a staggered scrub as the section enters (same build-order
  // language as the "Watch it run" section — never a flat fade).
  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section || simple.current) return;
      const pieces = [
        section.querySelector(".term-intro"),
        section.querySelector(".term-panel"),
        section.querySelector(".term-timeline"),
      ].filter(Boolean) as HTMLElement[];
      const tl = gsap.timeline({
        scrollTrigger: { trigger: section, start: "top 88%", end: "top 18%", scrub: 1 },
      });
      pieces.forEach((p, i) => {
        tl.fromTo(p, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, i * 0.18);
      });
      return () => tl.kill();
    },
    { scope: sectionRef }
  );

  // Esc completes/skips instantly (keyboard path for SR + power users).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "running") {
        e.preventDefault();
        clearTimers();
        setDoneLines(SCRIPT.map((s) => s.line));
        setTypingLine(null);
        setRows(allRows());
        setPhase("done");
        announceComplete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const announceComplete = () => {
    setAnnounce("Import complete. Timeline updated with merged pull requests and invoice lines.");
  };

  const run = (command: string) => {
    const cmdText = command.trim() || DEFAULT_CMD;
    setEchoed(cmdText);
    setTyped("");
    setDoneLines([]);
    setTypingLine(null);
    setRows([]);
    setAnnounce("");
    setPhase("running");

    if (simple.current) {
      // Gate: no typewriter — reveal the sequence instantly.
      later(() => {
        setDoneLines(SCRIPT.map((s) => s.line));
        setRows(allRows());
        setPhase("done");
        announceComplete();
      }, 350);
      return;
    }

    let li = 0;
    let ci = 0;
    let current = SCRIPT[0]?.line ?? "";

    const tick = () => {
      if (li >= SCRIPT.length) {
        setTypingLine(null);
        setPhase("done");
        announceComplete();
        // Focus AFTER React re-enables the input (a disabled input can't take
        // focus — calling focus() in the same tick as setPhase is a no-op).
        later(() => inputRef.current?.focus(), 0);
        return;
      }
      current = SCRIPT[li].line;
      ci += 1;
      if (ci >= current.length) {
        // Line complete — commit, then pop its timeline row (if any).
        const done = SCRIPT[li];
        setDoneLines((d) => [...d, done.line]);
        if (done.row) setRows((r) => [...r, { ...done.row!, id: `${done.line}-${r.length}` }]);
        setTypingLine(null);
        li += 1;
        ci = 0;
        later(tick, CHAR_MS * 3 + 120);
      } else {
        setTypingLine({ text: current, chars: ci });
        later(tick, CHAR_MS);
      }
    };
    later(tick, 220);
  };
  // Keep the observer's runRef pointing at the current run (declared above).
  runRef.current = run;

  const onSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (phase === "running") return;
    run(typed);
  };

  const runDefault = () => {
    if (phase === "running") return;
    if (inputRef.current) {
      // Native setter so React state syncs.
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(inputRef.current, DEFAULT_CMD);
      inputRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      inputRef.current.focus();
    }
    run(DEFAULT_CMD);
  };

  const lineDots: Record<"ok" | "info", string> = { ok: "dot-ok", info: "dot-info" };

  return (
    <section ref={sectionRef} className="term-section section" id="terminal" aria-label="Interactive terminal demo">
      <div className="term-intro">
        <p className="section-kicker">Terminal</p>
        <h2 className="section-title">Dev-native, to the bone.</h2>
        <p className="display-sub">
          The CLI doesn't fake it — import a repo and watch the timeline and invoice fill themselves in.
        </p>
      </div>

      <div className="term-grid">
        <div className="term-panel">
          <div className="term-head">
            <SignalBar size={14} className="mark" />
            <span>signal</span>
            <span className="term-tag">scripted demo</span>
          </div>

          <div className="term-body">
            {echoed && (
              <div className="term-line">
                <span className="term-prompt">$</span>
                <span className="term-cmd num">{echoed}</span>
              </div>
            )}
            <div className="term-out" aria-hidden="true">
              {doneLines.map((l, i) => {
                const entry = SCRIPT.find((s) => s.line === l);
                return (
                  <div key={i} className="term-line term-out-line">
                    <span className={`term-dot ${lineDots[entry?.tone ?? "info"]}`} aria-hidden="true" />
                    <span>{l}</span>
                  </div>
                );
              })}
              {typingLine && (
                <div className="term-line term-out-line">
                  <span className={`term-dot ${lineDots[SCRIPT[Math.min(doneLines.length, SCRIPT.length - 1)]?.tone ?? "info"]}`} aria-hidden="true" />
                  <span className="term-typing">{typingLine.text.slice(0, typingLine.chars)}</span>
                  <span className="term-cursor" aria-hidden="true" />
                </div>
              )}
            </div>

            <form className="term-line term-input-line" onSubmit={onSubmit}>
              <span className="term-prompt">$</span>
              <input
                ref={inputRef}
                type="text"
                value={typed}
                aria-label="Terminal command"
                placeholder={DEFAULT_CMD}
                autoComplete="off"
                spellCheck={false}
                disabled={phase === "running"}
                onChange={(e) => setTyped(e.target.value)}
              />
            </form>
          </div>

          <div className="term-foot">
            <button type="button" className="term-chip num" onClick={runDefault}>
              {DEFAULT_CMD}
            </button>
            <span className="term-hints">
              <kbd className="num">↵</kbd> run
              <kbd className="num">esc</kbd> skip
            </span>
          </div>

          <div className="term-live" aria-live="polite" role="status">
            {announce}
          </div>
        </div>

        <div className="term-timeline" aria-label="Mini timeline preview">
          <div className="term-timeline-head">
            <span>timeline</span>
            <span className="term-timeline-repo num">you/repo</span>
          </div>
          <ul className="term-rows">
            {rows.length === 0 && (
              <li className="term-rows-empty">
                <Icon name="branch" label="" size={14} />
                <span>Run the command — the timeline fills itself.</span>
              </li>
            )}
            {rows.map((r) => (
              <li key={r.id} className="term-row">
                <span className="term-row-glyph">
                  <Icon name={r.icon} label="" size={12} />
                </span>
                <span className="term-row-label">{r.label}</span>
                <time className="term-row-time num">{r.time}</time>
              </li>
            ))}
          </ul>
          <div className="term-timeline-foot num">
            {rows.length > 0 ? `${rows.length} events · ${rows.filter((r) => r.icon === "invoice").length} billable` : "0 events"}
          </div>
        </div>
      </div>
    </section>
  );
}

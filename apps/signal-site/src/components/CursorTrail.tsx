import { useEffect, useRef } from "react";
import { motionMode } from "../lib/motionGate";
import { isTestMode } from "../lib/testMode";

/* ============================================================
   CursorTrail — the signal-bar trail that follows the cursor
   (brief §3.1). Plain 2D canvas, decoupled from the DOM chaos.
   Amplitude is tied to REAL scroll progress of the hero: points
   over already-resolved areas run calm and straight, points
   over not-yet-settled areas jitter. progress is read from a
   shared mutable ref so the trail never re-renders React.
   ============================================================ */

export interface TrailHandle {
  /** 0..1 — how far the hero assembly has progressed. */
  setProgress: (p: number) => void;
}

const MAX_POINTS = 36;

export default function CursorTrail({ progressRef }: { progressRef: React.RefObject<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The canvas always exists (hydration match); only full mode draws.
    // Under automated tests the continuous rAF loop is skipped entirely —
    // the trail is a permanent frame-every-frame load that can starve
    // React's event queue when several pages run at once (see testMode).
    if (motionMode() !== "full" || isTestMode()) {
      canvas.style.display = "none";
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const points: { x: number; y: number; t: number }[] = [];
    let mouseX = -100;
    let mouseY = -100;
    let lastPush = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const tick = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(tick);

      if (now - lastPush > 16) {
        lastPush = now;
        points.push({ x: mouseX, y: mouseY, t: now });
        if (points.length > MAX_POINTS) points.shift();
      }

      const progress = progressRef.current ?? 0;
      ctx.clearRect(0, 0, w, h);

      if (points.length < 2) return;

      // Amplitude envelope: overall progress flattens everything;
      // within the hero, lower parts of the viewport settle later.
      const eased = progress * progress * (3 - 2 * progress); // smoothstep
      const env = 1 - Math.min(1, eased);

      ctx.beginPath();
      ctx.strokeStyle = "rgba(247, 248, 248, 0.28)";
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        // Per-point "settledAt" — lower on screen resolves later.
        const yFrac = p.y / Math.max(1, h);
        const local = env * (0.35 + 0.65 * yFrac);
        const amp = 7 * local;
        const phase = i * 0.9 + now * 0.006;
        const jitter = Math.sin(phase) * 0.6 + Math.sin(phase * 1.7 + 2) * 0.4;
        const dx = Math.cos(phase) * amp * jitter;
        const dy = Math.sin(phase * 1.3) * amp * jitter * 0.5;
        const x = p.x + dx;
        const y = p.y + dy;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Leading pulse dot — the waveform's moving edge.
      const last = points[points.length - 1];
      ctx.beginPath();
      ctx.fillStyle = `rgba(247, 248, 248, ${0.45 * env})`;
      ctx.arc(last.x, last.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, [progressRef]);

  return <canvas ref={canvasRef} className="cursor-trail" aria-hidden="true" />;
}

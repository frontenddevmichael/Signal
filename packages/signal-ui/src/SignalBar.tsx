import type { SVGProps } from "react";

/* ============================================================
   SignalBar — the brand mark (favicon lineage).
   A sharp waveform pulse: pure monochrome, zero hue dependency,
   legible at 16px. Stroke follows currentColor. Square caps +
   miter joins are part of the mark — don't round them.
   ============================================================ */

export function SignalBar({
  size = 24,
  strokeWidth = 5,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      role="img"
      aria-label="Signal"
      {...rest}
    >
      <path d="M10 32h11l5-16 7 32 5-16h16" />
    </svg>
  );
}

/** The mark as a single-path drawing (for stroke-draw animation). */
export function SignalBarPath({
  size = 24,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...rest}
    >
      <path d="M10 32h11l5-16 7 32 5-16h16" pathLength={1} />
    </svg>
  );
}

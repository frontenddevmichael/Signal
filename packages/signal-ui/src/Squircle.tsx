/* ============================================================
   Squircle — TRUE continuous-corner shape, universal support
   Marketing brief §2: a single div with border-radius is a
   circular arc, not a squircle. A clip-path squircle clips its
   own box-shadow. So: TWO layers.
     .sq-wrap  → carries elevation (box-shadow) + a matching
                 approximate border-radius so the shadow shape
                 reads right (invisible — it only casts shadow)
     .sq-inner → carries the real superellipse clip-path
   The <clipPath> def is rendered ONCE per page (SquircleDef).
   ============================================================ */

/* Superellipse |x/a|^n + |y/b|^n = 1, n ≈ 5, 64 segments,
   normalized to a 0..1 objectBoundingBox so one def serves
   every size. Reused via clip-path: url(#sq-superellipse). */
export const SUPER_ELLIPSE_PATH =
  "M1.0000 0.5000 L0.9990 0.6975 L0.9961 0.7601 L0.9913 0.8049 L0.9844 0.8405 L0.9755 0.8701 L0.9644 0.8952 L0.9511 0.9168 L0.9353 0.9353 L0.9168 0.9511 L0.8952 0.9644 L0.8701 0.9755 L0.8405 0.9844 L0.8049 0.9913 L0.7601 0.9961 L0.6975 0.9990 L0.5000 1.0000 L0.3025 0.9990 L0.2399 0.9961 L0.1951 0.9913 L0.1595 0.9844 L0.1299 0.9755 L0.1048 0.9644 L0.0832 0.9511 L0.0647 0.9353 L0.0489 0.9168 L0.0356 0.8952 L0.0245 0.8701 L0.0156 0.8405 L0.0087 0.8049 L0.0039 0.7601 L0.0010 0.6975 L0.0000 0.5000 L0.0010 0.3025 L0.0039 0.2399 L0.0087 0.1951 L0.0156 0.1595 L0.0245 0.1299 L0.0356 0.1048 L0.0489 0.0832 L0.0647 0.0647 L0.0832 0.0489 L0.1048 0.0356 L0.1299 0.0245 L0.1595 0.0156 L0.1951 0.0087 L0.2399 0.0039 L0.3025 0.0010 L0.5000 0.0000 L0.6975 0.0010 L0.7601 0.0039 L0.8049 0.0087 L0.8405 0.0156 L0.8701 0.0245 L0.8952 0.0356 L0.9168 0.0489 L0.9353 0.0647 L0.9511 0.0832 L0.9644 0.1048 L0.9755 0.1299 L0.9844 0.1595 L0.9913 0.1951 L0.9961 0.2399 L0.9990 0.3025 L1.0000 0.5000 Z";

/** Render ONCE per page (site shell). Defines the reusable clipPath. */
export function SquircleDef() {
  return (
    <svg
      width={0}
      height={0}
      style={{ position: "absolute", width: 0, height: 0 }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id="sq-superellipse" clipPathUnits="objectBoundingBox">
          <path d={SUPER_ELLIPSE_PATH} />
        </clipPath>
      </defs>
    </svg>
  );
}

export interface SquircleProps {
  children?: React.ReactNode;
  /** CSS radius matching the squircle's visual size. */
  radius?: string | number;
  /** Elevation shadow (defaults to elev-2). Pass "none" for flat. */
  shadow?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Outer shadow wrapper + inner clip-path surface. */
export function Squircle({
  children,
  radius = "var(--radius-md)",
  shadow = "var(--elev-2)",
  className = "",
  style,
}: SquircleProps) {
  return (
    <div
      className={`sq-wrap${className ? " " + className : ""}`}
      style={{ borderRadius: radius, boxShadow: shadow, ...style }}
    >
      <div className="sq-inner" style={{ borderRadius: radius }}>
        {children}
      </div>
    </div>
  );
}

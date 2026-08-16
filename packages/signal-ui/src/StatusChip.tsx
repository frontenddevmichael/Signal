/* ============================================================
   StatusChip — the dot register (signal-design.md §1.1).
   Shape carries the state family:
     filled dot         = resolved / connected / paid / active
     filled + 590 text  = overdue / attention
     outline dot        = in-flight: draft/sent/viewed/partial/pending
     dimmed outline     = terminal: void/refunded/closed
   Hue is applied to the DOT only, never to text.
   ============================================================ */

export type ChipState = "positive" | "warning" | "critical" | "inert";
export type DotShape = "filled" | "outline" | "dim";

export interface StatusChipProps {
  label: string;
  state?: ChipState;
  shape?: DotShape;
  /** Monochrome register class: "reg-510" (default) or "reg-590" (overdue). */
  weight?: "510" | "590";
  className?: string;
}

export function StatusChip({
  label,
  state = "positive",
  shape = "filled",
  weight = "510",
  className = "",
}: StatusChipProps) {
  return (
    <span className={`status-chip ${className}`.trim()}>
      <span
        className={`dot dot-${shape} dot-${state}`}
        aria-hidden="true"
      />
      <span className={`status-label reg-${weight}`}>{label}</span>
    </span>
  );
}

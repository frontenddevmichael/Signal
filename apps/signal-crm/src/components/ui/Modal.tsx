import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { IconClose } from "../Icons";

/**
 * §1.4 L3 modal — a frosted glass shell (.modal) carrying a solid content
 * card (.modal-inner) so no text ever sits on a blurred surface. The
 * backdrop is a click-to-close scrim (mousedown, target-checked so a drag
 * that starts inside the dialog can't close it); the dialog stops
 * propagation. width sets the card's max-width.
 *
 * Focus contract (guarded by tests/mobile-regression "modal focus contract"):
 * - Focus moves into the dialog on open (the container itself, so screen
 *   readers announce it via aria-modal + aria-label).
 * - Tab / Shift+Tab cycle within the dialog (first → last, wrapped).
 * - Escape closes. Body scroll locks while open.
 * - Focus RESTORES to the element that opened the dialog on close.
 * - The keydown effect depends ONLY on [open]: callers pass inline closures
 *   (`onClose={() => setX(false)}`) — if onClose were a dependency, ANY
 *   parent re-render (e.g. a reactive Convex query update) would tear down
 *   and re-run the effect, restoring focus to the trigger and re-focusing
 *   the dialog — ripping focus out of the field the user is typing in. The
 *   ref keeps Escape wired to the latest closure without that churn.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="modal"
        style={{ maxWidth: width }}
      >
        <div className="modal-inner">
          <div className="modal-header">
            <h3>{title}</h3>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <IconClose width={16} height={16} />
            </button>
          </div>
          <div className="modal-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

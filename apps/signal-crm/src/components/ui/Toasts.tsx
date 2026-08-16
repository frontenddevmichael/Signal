import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ToastContext } from "./useToasts";
import type { Toast } from "./useToasts";
import { IconAlert, IconCheck, IconClose } from "../Icons";

/**
 * §3.2 — one-off action confirmations, never ongoing state. Toasts sit at
 * --surface-4 with a --border-default edge and popover shadow (solid, per
 * the flagged §1.4 deviation); the icon SHAPE (check vs alert) carries the
 * meaning — never hue. Undo stays wherever reversible (§5.2).
 */
export function Toasts({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timeouts = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timeouts.current.get(id);
    if (t) clearTimeout(t);
    timeouts.current.delete(id);
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
      // §5.3 — status visible long enough to act on.
      const timer = setTimeout(() => dismiss(id), 5000);
      timeouts.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind ?? "info"}`} role="status">
            {t.kind === "success" && <IconCheck width={16} height={16} className="toast-icon" />}
            {t.kind === "error" && <IconAlert width={16} height={16} className="toast-icon" />}
            <span>{t.message}</span>
            {t.undoLabel && t.onUndo && (
              <button
                type="button"
                className="undo"
                onClick={() => {
                  t.onUndo?.();
                  dismiss(t.id);
                }}
              >
                {t.undoLabel}
              </button>
            )}
            <button type="button" className="icon-btn toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <IconClose width={12} height={12} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

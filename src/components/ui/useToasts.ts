import { createContext, useContext } from "react";

export interface Toast {
  id: number;
  message: string;
  kind?: "info" | "success" | "error";
  undoLabel?: string;
  onUndo?: () => void;
}

export const ToastContext = createContext<{
  push: (t: Omit<Toast, "id">) => void;
} | null>(null);

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToasts must be used within <Toasts>");
  return ctx;
}

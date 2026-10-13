import { useCallback, useRef, useState } from "react";

/**
 * Transient success/error/info messages (NP-271) — the native half of the
 * web's `hooks/useToast.ts`: show a message, auto-dismiss it after
 * `duration`. A fresh call replaces whatever is showing and restarts the
 * clock, so two quick taps never leave two timers racing to clear the same
 * state.
 */

export type ToastType = "success" | "error" | "neutral" | "info";

export interface ToastData {
  message: string;
  type: ToastType;
}

export function useToast(duration = 3500) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string, type: ToastType = "neutral") => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ message, type });
      timerRef.current = setTimeout(() => setToast(null), duration);
    },
    [duration],
  );

  const hideToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  return { toast, showToast, hideToast };
}

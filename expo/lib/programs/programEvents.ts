type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Subscribe to program lifecycle events (pause, resume, shift, start-date, abandon).
 * Used by screens and components like Continue Training and Calendar to refresh immediately.
 */
export function subscribeProgramUpdates(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notify all subscribers that a program was modified or abandoned.
 */
export function notifyProgramUpdated(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // non-fatal
    }
  }
}

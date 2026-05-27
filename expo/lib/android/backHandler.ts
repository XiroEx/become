import { useEffect } from "react";

/**
 * Minimum BackHandler contract from react-native. Injectable so jest can fake
 * the listener without pulling in the native module.
 */
export interface BackHandlerLike {
  addEventListener: (
    type: "hardwareBackPress",
    handler: () => boolean,
  ) => { remove: () => void };
}

export interface UseAndroidBackHandlerInput {
  /** When false, the hook is a no-op (no subscription registered). */
  enabled: boolean;
  /** Returns true to intercept (block default back behaviour), false to allow. */
  onBack: () => boolean;
  /** Inject `BackHandler` from react-native; default-undefined no-ops in tests / web. */
  backHandler?: BackHandlerLike;
}

/**
 * Subscribes a hardware-back listener while `enabled === true`. Used by the
 * live-workout screen + recipe-create-equivalents to confirm-on-back so users
 * don't lose in-progress work to a tap of the hardware back button.
 */
export function useAndroidBackHandler({
  enabled,
  onBack,
  backHandler,
}: UseAndroidBackHandlerInput): void {
  useEffect(() => {
    if (!enabled || !backHandler) return;
    const sub = backHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [enabled, onBack, backHandler]);
}

/**
 * Builds a confirm-on-back handler that runs `onConfirm` (typically an alert)
 * the first time the user presses back, then lets the second press through.
 * Pure — no React state — so tests can step through it deterministically.
 */
export function makeConfirmOnBack(input: {
  onConfirm: () => void;
  isConfirmed: () => boolean;
}): () => boolean {
  return () => {
    if (input.isConfirmed()) {
      // Already confirmed → let the system back happen.
      return false;
    }
    input.onConfirm();
    return true; // intercept
  };
}

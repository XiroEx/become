import { useEffect, useState } from "react";
import {
  coldOpenFlow,
  type BiometricsCapability,
  type ColdOpenInput,
  type ColdOpenResult,
} from "@/lib/auth/biometrics";
import type { TokenStore } from "@/lib/auth/secureStoreToken";

export interface UseColdOpenRedirectInput {
  tokenStore: TokenStore;
  optInStore: TokenStore;
  biometrics: BiometricsCapability;
  /** Called once when the cold-open verdict is known. */
  onResolve: (verdict: ColdOpenResult) => void;
}

/**
 * Drives the cold-open flow on mount and forwards the verdict to the caller
 * (typically a router.replace at the root). Lives outside expo/app/_layout.tsx
 * so tests can render the hook in isolation via renderHook.
 */
export function useColdOpenRedirect(
  input: UseColdOpenRedirectInput,
): { resolving: boolean; verdict: ColdOpenResult | null } {
  const [resolving, setResolving] = useState<boolean>(true);
  const [verdict, setVerdict] = useState<ColdOpenResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const flowInput: ColdOpenInput = {
        tokenStore: input.tokenStore,
        optInStore: input.optInStore,
        biometrics: input.biometrics,
      };
      const result = await coldOpenFlow(flowInput);
      if (cancelled) return;
      setVerdict(result);
      setResolving(false);
      input.onResolve(result);
    })();
    return () => {
      cancelled = true;
    };
    // input.onResolve is caller-owned; we only re-run when the stores or
    // biometrics impl change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.tokenStore, input.optInStore, input.biometrics]);

  return { resolving, verdict };
}

/**
 * Default no-op biometrics capability — used in Expo Go where
 * expo-local-authentication isn't bundled. Always reports no hardware so the
 * cold-open flow degrades to dashboard. Replace with the real capability in
 * the dev build (P21).
 */
export const noopBiometricsCapability: BiometricsCapability = {
  async hasHardware() {
    return false;
  },
  async isEnrolled() {
    return false;
  },
  async authenticate() {
    return { success: false, reason: "no-hardware" };
  },
};

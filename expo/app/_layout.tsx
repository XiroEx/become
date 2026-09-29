import "../global.css";
import { useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  noopBiometricsCapability,
  useColdOpenRedirect,
} from "@/lib/auth/coldOpenRedirect";
import {
  createMemoryTokenStore,
  type TokenStore,
} from "@/lib/auth/secureStoreToken";
import type { ColdOpenResult } from "@/lib/auth/biometrics";
import { TimezoneReporter } from "@/components/TimezoneReporter";
import { ApiErrorHandlerProvider } from "@/lib/errors";

// Placeholder in-memory stores — swapped for the real SecureStore-backed
// stores when full auth wiring lands. P17 ships the cold-open scaffolding;
// the actual JWT + biometrics-opt-in stores connect in a follow-up.
const placeholderTokenStore: TokenStore = createMemoryTokenStore();
const placeholderOptInStore: TokenStore = createMemoryTokenStore();

function ColdOpenGate() {
  const router = useRouter();
  const onResolve = useCallback(
    (verdict: ColdOpenResult) => {
      if (verdict.kind === "login") {
        router.replace("/login");
      }
    },
    [router],
  );
  useColdOpenRedirect({
    tokenStore: placeholderTokenStore,
    optInStore: placeholderOptInStore,
    biometrics: noopBiometricsCapability,
    onResolve,
  });
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ColdOpenGate />
        {/* Records the member's timezone on launch and on the first foreground
            of a new local day. The notify cron skips a member with none
            stored, and a workout save used to be the only thing that wrote
            one. */}
        <TimezoneReporter />
        {/*
          THE mount point for refusal handling: every screen below reaches it
          with useApiErrorHandler(). The three answers arrive with the cards
          that build them — sign-out (NP-002), the upgrade sheet (NP-052) and
          the consent sheet (NP-046) — and `session` is the JWT, which is what
          arms "sign out once per session". Until then a refused request comes
          back to the screen it came from, with the server's wording and no
          sheet, which is already the correct behaviour for every other class.
        */}
        <ApiErrorHandlerProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#0a0a0a" },
            }}
          >
            <Stack.Screen name="index" />
          </Stack>
        </ApiErrorHandlerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

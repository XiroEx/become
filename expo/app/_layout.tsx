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
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#0a0a0a" },
          }}
        >
          <Stack.Screen name="index" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

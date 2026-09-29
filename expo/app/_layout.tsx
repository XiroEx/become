import "../global.css";
import { useCallback } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  noopBiometricsCapability,
  useColdOpenRedirect,
} from "@/lib/auth/coldOpenRedirect";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { useAuth } from "@/lib/auth/useAuth";
import {
  biometricsOptInSecureStore,
  sessionStore,
} from "@/lib/auth/secureStoreToken";
import type { ColdOpenResult } from "@/lib/auth/biometrics";
import { ApiErrorHandlerProvider } from "@/lib/errors";

/**
 * THE COLD-OPEN UNLOCK — and nothing else.
 *
 * It runs the biometric flow on the REAL stores (`sessionStore` is the JWT at
 * `become.session`, `biometricsOptInSecureStore` is the unlock opt-in at
 * `become.optin.biometrics`; a failed unlock clears the first and not the
 * second, which is why they are different keys).
 *
 * WHAT IT NO LONGER DOES IS NAVIGATE. It used to `router.replace` the verdict
 * — `/login` or the dashboard — guarded only by "is the current pathname
 * still `/`". The flow is asynchronous, so a cold start on `/verify?token=…`
 * or `/account/restore?u=…&t=…` raced it and lost: the link screen mounted,
 * the verdict landed, and sign-in replaced it with the token already spent.
 *
 * The launch destination is now decided by `app/index.tsx`, which the router
 * only ever mounts when the app was opened on `/`. A launch from a link never
 * renders it, so a link can no longer be overruled. All that is left here is
 * the consequence of a FAILED unlock: the flow has already dropped the JWT,
 * so the session object has to be told, and `index.tsx` then sends the member
 * to sign-in with "Become stayed locked."
 */
function ColdOpenUnlock() {
  const { signOut } = useAuth();

  const onResolve = useCallback(
    (verdict: ColdOpenResult) => {
      if (verdict.kind === "login" && verdict.reason === "biometric-fail") {
        void signOut("biometric-fail");
      }
    },
    [signOut],
  );

  useColdOpenRedirect({
    tokenStore: sessionStore,
    optInStore: biometricsOptInSecureStore,
    biometrics: noopBiometricsCapability,
    onResolve,
  });
  return null;
}

/**
 * The root. Three children, and the whole navigation shell hangs off them:
 *
 *   index    — the launch redirect, mounted only on a launch with no link
 *   (auth)   — sign-in, verify, restore: no session required, none assumed
 *   (app)    — everything behind AuthGuard → consent → OnboardingGuard
 *
 * plus `/onboarding`, which is signed-in but must not sit inside `(app)` or
 * the onboarding gate would redirect to a route behind itself.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* One session for the whole app, above every route. */}
        <AuthProvider>
          <StatusBar style="light" />
          <ColdOpenUnlock />
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
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
              <Stack.Screen name="onboarding" />
            </Stack>
          </ApiErrorHandlerProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

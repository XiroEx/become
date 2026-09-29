import "../global.css";
import { useCallback, useEffect, useRef } from "react";
import { Stack, usePathname, useRouter } from "expo-router";
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

/**
 * The cold-open verdict, on the REAL stores.
 *
 * It used to run against two `createMemoryTokenStore()` placeholders, which
 * are empty in a freshly launched process by definition — so every launch
 * decided "login" and replaced the route, however good the saved session was.
 * `sessionStore` is the JWT (`become.session`) and `biometricsOptInSecureStore`
 * is the unlock opt-in (`become.optin.biometrics`); they are different keys on
 * purpose, because a failed unlock clears the first one.
 */
function ColdOpenGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuth();

  // Read at verdict time, not at mount time: the flow is asynchronous and the
  // router may have moved on (a magic link, a push tap) while it ran.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const onResolve = useCallback(
    (verdict: ColdOpenResult) => {
      // Only the scaffold entry route is ours to replace. A cold start that
      // arrived on /verify?token=… must keep the link it was opened with.
      if (pathnameRef.current !== "/") return;
      if (verdict.kind === "login") {
        // A failed unlock has already dropped the JWT, so the session object
        // has to be told; every other "login" verdict is simply nobody
        // signed in, and signOut is a no-op there.
        if (verdict.reason === "biometric-fail") void signOut("biometric-fail");
        router.replace("/login");
        return;
      }
      router.replace("/(tabs)/dashboard");
    },
    [router, signOut],
  );

  useColdOpenRedirect({
    tokenStore: sessionStore,
    optInStore: biometricsOptInSecureStore,
    biometrics: noopBiometricsCapability,
    onResolve,
  });
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* One session for the whole app, above every route. */}
        <AuthProvider>
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
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

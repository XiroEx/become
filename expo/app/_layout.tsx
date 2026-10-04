import "../global.css";
import { useCallback } from "react";
import { View } from "react-native";
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
import { TimezoneReporter } from "@/components/TimezoneReporter";
import { AppBadgeSync } from "@/components/widgets/AppBadgeSync";
import { ConnectivityBanner } from "@/components/offline/ConnectivityBanner";
import { VersionGate } from "@/components/version/VersionGate";
import { WidgetsBridge } from "@/components/widgets/WidgetsBridge";
import type { PlanGateError } from "@become/api-client";
import { ApiErrorHandlerProvider } from "@/lib/errors";
import { UpgradeSheetHost } from "@/components/entitlements/UpgradeSheetHost";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { AiConsentPromptHost } from "@/components/ai/AiConsentPromptHost";
import { raiseAiConsentPrompt } from "@/lib/ai/aiConsentPrompt";
import { followSystemColorScheme } from "@/lib/theme/colorScheme";
import {
  useThemeTokens,
  useThemedWindowBackground,
} from "@/lib/theme/useThemeTokens";
import { holdSplashForFonts, useGeistFonts } from "@/lib/theme/loadFonts";

/**
 * TWO THEMES, AND THE SYSTEM PICKS — set before the first render, not in an
 * effect (NP-123).
 *
 * The web follows `prefers-color-scheme` (`webapp/app/layout.tsx`), and native
 * now does the same: NativeWind's colour scheme is the system's, every colour
 * comes from a class or from `useThemeTokens()`, and `app.json` says
 * `userInterfaceStyle: "automatic"` so the OS agrees about the surfaces the app
 * does not draw. This replaces NP-013's dark pin, which existed only because 43
 * `#0a0a0a` literals sat in plain RN styles, in 33 files, while the classes
 * around them followed the system.
 */
followSystemColorScheme();

/**
 * ONE TYPEFACE, AND IT IS THE WEB'S — held before the first render, not in an
 * effect.
 *
 * The launch screen stays up until the eight Geist faces are registered
 * (`lib/theme/loadFonts.ts`). React Native does not re-render a `<Text>` when
 * a font arrives, so anything painted before they land keeps the system font
 * for the life of the screen — a frame of San Francisco / Roboto that never
 * goes away. Hiding it again is `useGeistFonts()`'s job, below.
 */
holdSplashForFonts();

/**
 * A plan gate becomes the upgrade sheet (NP-052).
 *
 * Module level, not an inline arrow: `ApiErrorHandlerProvider` memoises its
 * context value on the identity of these callbacks, and a new function every
 * render would rebuild it — and the latch it carries — on every render.
 */
function raiseUpgradeSheet(error: PlanGateError): void {
  showUpgradeSheet(error.gate);
}

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
  const { fontsReady } = useGeistFonts();
  const { colors, statusBarStyle } = useThemeTokens();
  // The window behind every screen, repainted from the theme while the splash is
  // still up and again on every live flip of the system setting.
  useThemedWindowBackground();

  // Nothing at all until Geist is in memory. The launch screen is still up
  // (`holdSplashForFonts()` above), so this is not a blank frame — it is the
  // splash, held for the few milliseconds the faces take to register.
  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* One session for the whole app, above every route. */}
        <AuthProvider>
          {/* `style` names the CONTENT: light glyphs on a dark surface, dark
              glyphs on a light one. Derived from the theme, so it flips with the
              system setting instead of leaving white-on-white icons (NP-123). */}
          <StatusBar style={statusBarStyle} />
          <ColdOpenUnlock />
          {/* Records the member's timezone on launch and on the first foreground
              of a new local day. The notify cron skips a member with none
              stored, and a workout save used to be the only thing that wrote
              one. */}
          <TimezoneReporter />
          {/* Draws the widgets feed's `badgeCount` on the app icon at launch
              and on each foreground (NP-067): the number of daily commitments
              still open, cleared at zero and on sign-out. At the ROOT on
              purpose — a screen-mounted sync would miss every other tab's
              completions, and the sign-out transition unmounts (app). */}
          <AppBadgeSync />
          {/* Keeps the Android home-screen widgets in step with the session
              (NP-198): a signed-in open hands the read-only widgets token over
              and redraws the four tiles from the feed; a sign-out forgets it and
              draws the sign-in prompt. At the ROOT on purpose — the sign-out
              transition unmounts anything inside (app), which is exactly when
              the widgets must stop showing the member's day. */}
          <WidgetsBridge />
          {/*
            THE mount point for refusal handling: every screen below reaches it
            with useApiErrorHandler(). The remaining answers arrive with the cards
            that build them — sign-out (NP-002) and the consent sheet (NP-046) —
            and `session` is the JWT, which is what arms "sign out once per
            session". Until then a refused request comes back to the screen it
            came from, with the server's wording and no sheet, which is already
            the correct behaviour for every other class.

            `onPlanGate` is wired HERE and only here (NP-052): a plan gate is the
            one refusal that answers with an upsell, and `classifyApiError`
            guarantees what reaches it — a 403 carrying BOTH `feature` and
            `requiresTier`. A 429 spend ceiling is `rate-limited` and never
            arrives; an ownership 403 is `forbidden` and never arrives either.
          */}
          <ApiErrorHandlerProvider
            onPlanGate={raiseUpgradeSheet}
            onAiConsent={raiseAiConsentPrompt}
          >
            {/*
              ABOVE EVERY ROUTE, and above the Stack rather than inside it: the
              connection can go while any screen is open, and the writes it
              queues (weight and mood, each keeping the day it was logged on)
              are replayed by a reconnect that may land minutes later, with a
              different screen — or none — mounted. It is also where a
              sign-out clears the queue. See components/offline/.
            */}
            <View style={{ flex: 1 }}>
              <ConnectivityBanner />
              {/*
                THE upgrade sheet, mounted once and above every route (NP-052).
                It renders nothing until `showUpgradeSheet(gate)` is called, and
                it lives here rather than in a screen because a 403 can be routed
                by code that is rendering nothing at all — the AI run client, the
                offline replay — and can land after the screen that asked for it
                has gone.
              */}
              <UpgradeSheetHost />
              {/*
                THE AI consent prompt, mounted once at the root (NP-046). It renders
                nothing until an AI refusal routes to `raiseAiConsentPrompt` or
                `showAiConsentPrompt()` is called.
              */}
              <AiConsentPromptHost />
              <VersionGate>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(app)" />
                  <Stack.Screen name="onboarding" />
                </Stack>
              </VersionGate>
            </View>
          </ApiErrorHandlerProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

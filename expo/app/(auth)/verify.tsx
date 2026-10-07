import { useEffect, useState } from "react";
import { View, ActivityIndicator, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  apiFetch,
  classifyApiError,
  VerifyLinkResponseSchema,
} from "@become/api-client";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import type { VerifyMode } from "@/lib/auth";
import { CheckCircle2, X } from "lucide-react-native";
import {
  defaultPendingSessionStore,
  type PendingSessionStore,
} from "@/lib/auth/pendingAuthSession";

export interface VerifyScreenProps {
  /** DI hook for tests — sends the verify-link request. */
  verifyFn?: (
    token: string,
    mode: VerifyMode,
  ) => Promise<{ token: string }>;
  onSuccess?: (jwt: string) => void | Promise<void>;
  onFailure?: (error: unknown) => void;
  pendingSessionStore?: PendingSessionStore;
}

/**
 * Default verify-link caller: POSTs the magic-link token to the real webapp
 * backend. The server reads only `{ token }` (mode is implied by the link), and
 * returns `{ token, user }`.
 */
function defaultVerifyFn(token: string): Promise<{ token: string }> {
  return apiFetch("/api/auth/verify-link", VerifyLinkResponseSchema, {
    method: "POST",
    body: { token },
    baseUrl: WEBAPP_BASE_URL,
  });
}

/** The two native-only pre-flight failures, before any request is ever made:
 *  no token at all, or a token with no (or an unrecognised) mode. Named so
 *  `friendlyVerifyErrorMessage` can tell them apart from a server refusal
 *  without the caller ever constructing (or this screen ever storing) a raw
 *  `Error`/`unknown` value in state. */
export type LocalVerifyFailure = "no-token" | "bad-mode";

/**
 * Turns a verify failure into the SAME card copy the web `/verify` page shows
 * (`webapp/app/verify/page.tsx`) — never a raw local-validation string, and
 * never a bare `"API error 400"`.
 *
 * - `"no-token"` / `"bad-mode"` are the two native-only pre-flight checks
 *   below. Neither is a shape the web ever sees broken quite that way, so
 *   each maps onto the web's wording for the closest matching URL: no token
 *   maps to the web's "no token" card, a missing/invalid mode means the link
 *   itself is bad.
 * - Anything else came back from the server. `classifyApiError` already pulls
 *   the server's `message`/`error` text out of the response body verbatim
 *   (`shared/api-client/src/errors.ts#messageFrom`) — that IS the friendly
 *   copy (see `webapp/app/api/auth/verify-link/route.ts`), so it is rendered
 *   as-is instead of `err.message`, which on an `ApiError` is just
 *   `"API error 400"`.
 * - No message at all (offline, or a response `classifyApiError` found
 *   nothing in) falls back to the web's own generic line.
 */
export function friendlyVerifyErrorMessage(
  err: LocalVerifyFailure | unknown,
): string {
  if (err === "no-token") return "No verification token provided.";
  if (err === "bad-mode") {
    return "This link has expired or is invalid. Please request a new one.";
  }
  const classification = classifyApiError(err);
  return classification.message ?? "Something went wrong. Please try again.";
}

export function VerifyScreen({
  verifyFn,
  onSuccess,
  onFailure,
  pendingSessionStore,
}: VerifyScreenProps = {}) {
  const { colors, tint } = useThemeTokens();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; mode?: string }>();
  const [status, setStatus] = useState<"working" | "success" | "error">(
    "working",
  );
  // The friendly copy is computed once, at the moment of failure, and that
  // string is all this screen keeps — never the raw error. Holding onto a
  // live `Error`/`ApiError` instance across renders is what used to send this
  // effect into a render loop under React 19 + react-test-renderer.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingStore = pendingSessionStore ?? defaultPendingSessionStore;

  useEffect(() => {
    const rawToken = params.token;
    const rawMode = params.mode;
    // Effect drives the entire verify-link request lifecycle. The setStates
    // below transition between working / success / error tri-state — this is
    // the canonical mount-time data-fetch pattern; the lint rule guards
    // against unnecessary cascades, not necessary ones.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (typeof rawToken !== "string" || rawToken.length < 8) {
      setStatus("error");
      setErrorMessage(friendlyVerifyErrorMessage("no-token"));
      return;
    }
    if (rawMode !== "login" && rawMode !== "register") {
      setStatus("error");
      setErrorMessage(friendlyVerifyErrorMessage("bad-mode"));
      return;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    const fn =
      verifyFn ?? ((token: string, _mode: VerifyMode) => defaultVerifyFn(token));
    let cancelled = false;
    (async () => {
      try {
        const result = await fn(rawToken, rawMode);
        if (cancelled) return;
        setStatus("success");
        // Clear any pending magic-link session and complete sign-in
        await pendingStore.clear();
        await Promise.resolve(onSuccess?.(result.token));
        // After sign-in, go through the guards (consent, onboarding) instead
        // of straight to the dashboard.
        router.replace("/");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(friendlyVerifyErrorMessage(err));
        onFailure?.(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    params.token,
    params.mode,
    verifyFn,
    onSuccess,
    onFailure,
    pendingStore,
    router,
  ]);

  const mode: VerifyMode = params.mode === "register" ? "register" : "login";

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="verify-screen"
    >
      {/* This screen is three states and no controls on working/success, so the
          only thing a VoiceOver user has to go on is what it SAYS — a live
          region, so each state is read as it arrives instead of on the next
          swipe. */}
      <View
        className="flex-1 items-center justify-center px-6"
        accessibilityLiveRegion="polite"
      >
        {status === "working" ? (
          <View style={{ alignItems: "center", gap: 8 }}>
            <ActivityIndicator
              size="large"
              color={colors.primary}
              testID="verify-spinner"
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text
              className="text-foreground mt-3 text-lg font-semibold"
              testID="verify-working-text"
            >
              Signing you in…
            </Text>
            <Text
              className="text-muted-foreground text-sm text-center"
              testID="verify-working-subtext"
            >
              Please wait a moment.
            </Text>
          </View>
        ) : status === "success" ? (
          <View
            style={{ alignItems: "center", gap: 12, maxWidth: 320 }}
            testID="verify-success"
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: tint("success", 0.18),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={28} color={colors.success} />
            </View>
            <Text
              accessibilityRole="header"
              className="text-foreground text-xl font-bold text-center"
              testID="verify-success-title"
            >
              {mode === "register" ? "Account created!" : "Signed in!"}
            </Text>
            <Text
              className="text-muted-foreground text-center"
              testID="verify-success-text"
            >
              Signed in. Loading your account…
            </Text>
          </View>
        ) : (
          // Web parity (NP-252, NP-312): a plain X, "Verification failed", the
          // friendly message mapped from the error above, and a way BACK to
          // sign-in — all inside the same rounded card web draws
          // (`webapp/app/verify/page.tsx`: "rounded-lg bg-white dark:bg-zinc-900
          // ... shadow dark:border"). Previously this rendered straight on the
          // page background with a circled-X glyph (a circle baked into the
          // icon itself, sitting inside our own tint circle) instead of web's
          // plain X on a single light-red circle.
          <View
            className="w-full rounded-2xl border border-border bg-card p-6"
            style={{ alignItems: "center", gap: 16, maxWidth: 320 }}
            testID="verify-error"
            accessibilityRole="alert"
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: tint("destructive", 0.18),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={28} color={colors.destructive} />
            </View>
            <Text
              accessibilityRole="header"
              className="text-foreground text-xl font-bold text-center"
              testID="verify-error-title"
            >
              Verification failed
            </Text>
            <Text
              className="text-muted-foreground text-sm text-center leading-relaxed"
              testID="verify-error-message"
            >
              {errorMessage ?? "Something went wrong. Please try again."}
            </Text>
            <Pressable
              testID="verify-retry"
              accessibilityRole="button"
              accessibilityLabel="Try again"
              accessibilityHint="Back to sign in"
              onPress={() => router.replace("/login")}
              className="mt-2 w-full items-center justify-center rounded-xl bg-foreground px-6 py-3.5 active:opacity-90"
            >
              <Text className="text-base font-semibold text-background">
                Try again
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

/**
 * Route entry point. Binds onSuccess to useAuth().setToken so a successful
 * verify persists the JWT to SecureStore (and hydrates the user) — previously
 * the route rendered VerifyScreen with no onSuccess, dropping the token.
 */
export default function VerifyRoute() {
  const { setToken } = useAuth();
  return (
    <VerifyScreen
      onSuccess={async (jwt) => {
        await setToken(jwt);
      }}
    />
  );
}

import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiFetch, VerifyLinkResponseSchema } from "@become/api-client";
import { resolveToken } from "@/lib/theme/tokens";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import type { VerifyMode } from "@/lib/auth";

export interface VerifyScreenProps {
  /** DI hook for tests — sends the verify-link request. */
  verifyFn?: (
    token: string,
    mode: VerifyMode,
  ) => Promise<{ token: string }>;
  onSuccess?: (jwt: string) => void;
  onFailure?: (error: unknown) => void;
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

export function VerifyScreen({
  verifyFn,
  onSuccess,
  onFailure,
}: VerifyScreenProps = {}) {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; mode?: string }>();
  const [status, setStatus] = useState<"working" | "success" | "error">(
    "working",
  );
  const [error, setError] = useState<string | null>(null);

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
      setError("Missing or malformed token");
      return;
    }
    if (rawMode !== "login" && rawMode !== "register") {
      setStatus("error");
      setError("Missing or invalid mode");
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
        onSuccess?.(result.token);
        // Land the user in the app. Mirrors login.tsx's post-auth target;
        // navigating to "/" would strand them on the cold-open scaffold, which
        // only redirects *unauthed* users (to /login) and never routes an
        // authed user onward.
        router.replace("/(tabs)/dashboard");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Verify failed");
        onFailure?.(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.token, params.mode, verifyFn, onSuccess, onFailure, router]);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="verify-screen"
    >
      <View className="flex-1 items-center justify-center px-6">
        {status === "working" ? (
          <>
            <ActivityIndicator
              size="large"
              color={resolveToken("primary", "dark")}
              testID="verify-spinner"
            />
            <Text className="text-foreground mt-3" testID="verify-working-text">
              Signing you in…
            </Text>
          </>
        ) : status === "success" ? (
          <Text className="text-foreground" testID="verify-success-text">
            Signed in. Loading your account…
          </Text>
        ) : (
          <View testID="verify-error">
            <Text className="text-destructive text-center">
              {error ?? "Something went wrong"}
            </Text>
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
      onSuccess={(jwt) => {
        void setToken(jwt);
      }}
    />
  );
}

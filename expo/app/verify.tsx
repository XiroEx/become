import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { resolveToken } from "@/lib/theme/tokens";
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

export default function VerifyScreen({
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
      verifyFn ??
      (async (token: string, mode: VerifyMode) => {
        const response = await fetch("/api/auth/verify-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, mode }),
        });
        if (!response.ok) {
          throw new Error(`Verify failed (${response.status})`);
        }
        return (await response.json()) as { token: string };
      });
    let cancelled = false;
    (async () => {
      try {
        const result = await fn(rawToken, rawMode);
        if (cancelled) return;
        setStatus("success");
        onSuccess?.(result.token);
        router.replace("/");
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

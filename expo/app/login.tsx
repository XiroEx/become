import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  apiFetch,
  ApiError,
  SendLinkResponseSchema,
  CheckSessionResponseSchema,
  type SendLinkResponse,
  type CheckSessionResponse,
} from "@become/api-client";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { createPoller } from "@/lib/auth/polling";
import { useAuth } from "@/lib/auth/useAuth";

/** Default poll cadence for the magic-link fallback (mirrors the webapp). */
const POLL_INTERVAL_MS = 2000;

/**
 * Pull a human-friendly message out of whatever the API/network threw. The
 * webapp returns `{ message }` bodies on 4xx/5xx (e.g. throttle, invalid mode),
 * so surface that verbatim when present.
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body;
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message?: unknown }).message === "string"
    ) {
      return (body as { message: string }).message;
    }
    return `Something went wrong (${err.status}). Please try again.`;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Couldn't send your magic link. Please try again.";
}

export interface LoginScreenProps {
  /** DI hook for tests — POSTs /api/auth/send-link and returns the sessionId. */
  sendLinkFn?: (email: string) => Promise<SendLinkResponse>;
  /** DI hook for tests — POSTs /api/auth/check-session for the polling fallback. */
  checkSessionFn?: (sessionId: string) => Promise<CheckSessionResponse>;
  /** DI hook for tests — persists the JWT. Defaults to useAuth().setToken. */
  onAuthed?: (token: string) => void | Promise<void>;
  pollIntervalMs?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

export default function LoginScreen({
  sendLinkFn,
  checkSessionFn,
  onAuthed,
  pollIntervalMs,
  setTimeoutImpl,
  clearTimeoutImpl,
}: LoginScreenProps = {}) {
  const router = useRouter();
  const auth = useAuth();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const sendLink =
    sendLinkFn ??
    ((value: string) =>
      apiFetch("/api/auth/send-link", SendLinkResponseSchema, {
        method: "POST",
        body: { email: value, mode: "login" },
        baseUrl: WEBAPP_BASE_URL,
      }));

  const checkSession =
    checkSessionFn ??
    ((sid: string) =>
      apiFetch("/api/auth/check-session", CheckSessionResponseSchema, {
        method: "POST",
        body: { sessionId: sid },
        baseUrl: WEBAPP_BASE_URL,
      }));

  const handleAuthed = onAuthed ?? auth.setToken;

  // Keep the latest poller dependencies in a ref so the polling effect can stay
  // keyed only on [submitted, sessionId] without tearing down/recreating the
  // poller on every render (mirrors the useFetch optsRef pattern).
  const pollRef = useRef({
    checkSession,
    handleAuthed,
    router,
    pollIntervalMs,
    setTimeoutImpl,
    clearTimeoutImpl,
  });
  useEffect(() => {
    pollRef.current = {
      checkSession,
      handleAuthed,
      router,
      pollIntervalMs,
      setTimeoutImpl,
      clearTimeoutImpl,
    };
  });

  const handleSubmit = async (): Promise<void> => {
    if (submittingRef.current) return;
    if (!email.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    submittingRef.current = true;
    setError(null);
    setSending(true);
    try {
      const resp = await sendLink(email.trim().toLowerCase());
      setSessionId(resp.sessionId);
      setSubmitted(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      submittingRef.current = false;
      setSending(false);
    }
  };

  // Polling fallback: once the email is sent, poll check-session until the user
  // taps the link (on this phone or any device). On verified, persist the JWT
  // and head to the dashboard. The poller is torn down on unmount or reset.
  useEffect(() => {
    if (!submitted || !sessionId) return;
    const p = pollRef.current;
    const poller = createPoller<CheckSessionResponse>({
      intervalMs: p.pollIntervalMs ?? POLL_INTERVAL_MS,
      fetcher: () => p.checkSession(sessionId),
      onResult: (result) => {
        if (result.status === "verified" && result.authToken) {
          const token = result.authToken;
          void Promise.resolve(p.handleAuthed(token)).then(() => {
            p.router.replace("/(tabs)/dashboard");
          });
          return "stop";
        }
        if (result.status === "expired") {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setError("That link expired. Please request a new one.");
          setSubmitted(false);
          setSessionId(null);
          return "stop";
        }
        return true;
      },
      // Transient network blips shouldn't kill the session — keep polling.
      onError: () => {},
      setTimeoutImpl: p.setTimeoutImpl,
      clearTimeoutImpl: p.clearTimeoutImpl,
    });
    poller.start();
    return () => poller.stop();
  }, [submitted, sessionId]);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="login-screen"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        testID="login-screen-kav"
      >
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-foreground text-3xl font-bold mb-2">Become</Text>
          <Text className="text-muted-foreground text-base mb-6">
            Sign in with a magic link
          </Text>
          {submitted ? (
            <View testID="login-submitted" style={{ width: "100%" }}>
              <Text className="text-foreground text-center mb-2">
                Check your inbox
              </Text>
              <Text className="text-muted-foreground text-center text-sm">
                We sent a sign-in link to {email}. Tap it on your phone to
                continue — we&apos;ll pick it up automatically.
              </Text>
            </View>
          ) : (
            <View style={{ width: "100%" }}>
              <Input
                testID="login-email"
                label="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                error={error ?? undefined}
                placeholder="you@example.com"
              />
              <View style={{ height: 12 }} />
              <Button
                testID="login-submit"
                onPress={handleSubmit}
                disabled={sending}
              >
                {sending ? "Sending…" : "Send magic link"}
              </Button>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
  type AppStateStatus,
} from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  apiFetch,
  ApiError,
  SendLinkResponseSchema,
  CheckSessionResponseSchema,
  type SendLinkResponse,
  type CheckSessionResponse,
  type AuthMode,
  type SendLinkRequest,
} from "@become/api-client";
import { CONSENT_STATEMENT } from "@become/core";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { createPoller, type Poller } from "@/lib/auth/polling";
import { announce } from "@/lib/a11y/announce";
import { signOutMessage } from "@/lib/auth/AuthProvider";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  defaultPendingSessionStore,
  type PendingSessionStore,
  AUTH_LINK_MAX_AGE_MS,
} from "@/lib/auth/pendingAuthSession";
import { Check } from "lucide-react-native";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

/** Default poll cadence for the magic-link fallback (mirrors the webapp). */
const POLL_INTERVAL_MS = 2000;

function defaultSubscribeToAppState(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

/**
 * Pull a human-friendly message out of whatever the API/network threw. The
 * webapp returns `{ message }` bodies on 4xx/5xx (e.g. throttle, invalid mode,
 * email already in use), so surface that verbatim when present.
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body;
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (typeof b.message === "string" && b.message.length > 0) return b.message;
      if (typeof b.error === "string" && b.error.length > 0) return b.error;
    }
    return `Something went wrong (${err.status}). Please try again.`;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Couldn't send your magic link. Please try again.";
}

export interface LoginScreenProps {
  /** DI hook for tests — POSTs /api/auth/send-link and returns the sessionId. */
  sendLinkFn?: (
    email: string,
    mode?: AuthMode,
    consent?: boolean,
  ) => Promise<SendLinkResponse>;
  /** DI hook for tests — POSTs /api/auth/check-session for the polling fallback. */
  checkSessionFn?: (sessionId: string) => Promise<CheckSessionResponse>;
  /** DI hook for tests — persists the JWT. Defaults to useAuth().setToken. */
  onAuthed?: (token: string) => void | Promise<void>;
  pollIntervalMs?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  pendingSessionStore?: PendingSessionStore;
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
  now?: () => number;
  initialMode?: AuthMode;
}

export default function LoginScreen({
  sendLinkFn,
  checkSessionFn,
  onAuthed,
  pollIntervalMs,
  setTimeoutImpl,
  clearTimeoutImpl,
  pendingSessionStore,
  subscribeToAppState,
  now,
  initialMode,
}: LoginScreenProps = {}) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ mode?: string }>();

  const pendingStore = pendingSessionStore ?? defaultPendingSessionStore;
  const nowImpl = now ?? Date.now;
  const subscribeToAppStateImpl =
    subscribeToAppState ?? defaultSubscribeToAppState;

  const resolvedInitialMode: AuthMode =
    initialMode ?? (params.mode === "register" ? "register" : "login");

  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<AuthMode>(resolvedInitialMode);
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const pollerRef = useRef<Poller | null>(null);
  const isResumedRef = useRef(false);

  const sendLink =
    sendLinkFn ??
    ((value: string, authMode: AuthMode = mode, userConsent?: boolean) => {
      const body: SendLinkRequest = {
        email: value,
        mode: authMode,
        ...(authMode === "register" ? { consent: userConsent === true } : {}),
      };
      return apiFetch("/api/auth/send-link", SendLinkResponseSchema, {
        method: "POST",
        body,
        baseUrl: WEBAPP_BASE_URL,
      });
    });

  const checkSession =
    checkSessionFn ??
    ((sid: string) =>
      apiFetch("/api/auth/check-session", CheckSessionResponseSchema, {
        method: "POST",
        body: { sessionId: sid },
        baseUrl: WEBAPP_BASE_URL,
      }));

  const handleAuthed = onAuthed ?? auth.setToken;

  // Why the member is looking at this screen. After a 401 it says the session
  // ended instead of leaving them to guess why they were thrown out.
  const sessionMessage = signOutMessage(auth.signedOutReason ?? null);

  // Already signed in — a saved session restored while this screen was the
  // route (a deep link, a back stack) must not strand them on sign-in.
  // After sign-in, go through the guards (consent, onboarding) instead of straight to dashboard.
  const isAuthed = auth.isAuthed;
  useEffect(() => {
    if (isAuthed) router.replace("/");
  }, [isAuthed, router]);

  const startedAtRef = useRef(startedAt);
  const submittedRef = useRef(submitted);
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    startedAtRef.current = startedAt;
    submittedRef.current = submitted;
    sessionIdRef.current = sessionId;
  });

  const pollRef = useRef({
    checkSession,
    handleAuthed,
    router,
    pollIntervalMs,
    setTimeoutImpl,
    clearTimeoutImpl,
    pendingStore,
    now: nowImpl,
  });
  useEffect(() => {
    pollRef.current = {
      checkSession,
      handleAuthed,
      router,
      pollIntervalMs,
      setTimeoutImpl,
      clearTimeoutImpl,
      pendingStore,
      now: nowImpl,
    };
  });

  // Restore pending session from SecureStore on launch / mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (auth.isAuthed) return;
      const pending = await pendingStore.get();
      if (cancelled || !pending) return;
      const currentTime = nowImpl();
      if (currentTime - pending.startedAt >= AUTH_LINK_MAX_AGE_MS) {
        await pendingStore.clear();
        setError("That link expired. Please request a new one.");
        return;
      }
      setEmail(pending.email);
      setMode(pending.mode);
      setSessionId(pending.sessionId);
      setStartedAt(pending.startedAt);
      isResumedRef.current = true;
      setSubmitted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthed, pendingStore, nowImpl]);

  // Resume or re-check on returning to foreground
  useEffect(() => {
    const unsubscribe = subscribeToAppStateImpl((nextState) => {
      if (nextState !== "active") return;
      void (async () => {
        const pending = await pendingStore.get();
        if (!pending) return;
        const currentTime = nowImpl();
        if (currentTime - pending.startedAt >= AUTH_LINK_MAX_AGE_MS) {
          await pendingStore.clear();
          if (pollerRef.current) {
            pollerRef.current.stop();
            pollerRef.current = null;
          }
          setSubmitted(false);
          setSessionId(null);
          setStartedAt(null);
          setError("That link expired. Please request a new one.");
          return;
        }
        if (!submittedRef.current) {
          setEmail(pending.email);
          setMode(pending.mode);
          setSessionId(pending.sessionId);
          setStartedAt(pending.startedAt);
          isResumedRef.current = true;
          setSubmitted(true);
        } else {
          void pollerRef.current?.tickNow();
        }
      })();
    });
    return () => {
      unsubscribe();
    };
  }, [pendingStore, nowImpl, subscribeToAppStateImpl]);

  const handleSubmit = async (): Promise<void> => {
    if (submittingRef.current) return;
    if (!email.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    if (mode === "register" && !consent) {
      setError(
        "Please agree to the Terms of Service and Privacy Policy to create an account.",
      );
      return;
    }
    submittingRef.current = true;
    setError(null);
    setSending(true);

    const trimmedEmail = email.trim().toLowerCase();
    const currentMode = mode;
    try {
      const resp = await sendLink(
        trimmedEmail,
        currentMode,
        currentMode === "register" ? consent : undefined,
      );
      const startMs = nowImpl();
      setSessionId(resp.sessionId);
      setStartedAt(startMs);
      setSubmitted(true);
      await pendingStore.set({
        sessionId: resp.sessionId,
        email: trimmedEmail,
        mode: currentMode,
        startedAt: startMs,
      });
      announce(
        currentMode === "register"
          ? `Check your inbox. We sent a sign-up link to ${trimmedEmail}.`
          : `Check your inbox. We sent a sign-in link to ${trimmedEmail}.`,
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      submittingRef.current = false;
      setSending(false);
    }
  };

  const handleChangeEmail = async (): Promise<void> => {
    if (pollerRef.current) {
      pollerRef.current.stop();
      pollerRef.current = null;
    }
    await pendingStore.clear();
    setSubmitted(false);
    setSessionId(null);
    setStartedAt(null);
    setError(null);
  };

  // Polling fallback: once the email is sent, poll check-session until verified,
  // expired, or 15 minutes old.
  useEffect(() => {
    if (!submitted || !sessionId) return;
    const p = pollRef.current;
    const poller = createPoller<CheckSessionResponse>({
      intervalMs: p.pollIntervalMs ?? POLL_INTERVAL_MS,
      fetcher: () => p.checkSession(sessionId),
      onResult: (result) => {
        const start = startedAtRef.current;
        if (start && p.now() - start >= AUTH_LINK_MAX_AGE_MS) {
          void p.pendingStore.clear();
          setError("That link expired. Please request a new one.");
          setSubmitted(false);
          setSessionId(null);
          setStartedAt(null);
          return "stop";
        }

        if (result.status === "verified" && result.authToken) {
          const token = result.authToken;
          void (async () => {
            await p.pendingStore.clear();
            await Promise.resolve(p.handleAuthed(token));
            p.router.replace("/");
          })();
          return "stop";
        }
        if (result.status === "expired") {
          void p.pendingStore.clear();
          setError("That link expired. Please request a new one.");
          setSubmitted(false);
          setSessionId(null);
          setStartedAt(null);
          return "stop";
        }
        return true;
      },
      onError: () => {},
      setTimeoutImpl: p.setTimeoutImpl,
      clearTimeoutImpl: p.clearTimeoutImpl,
    });
    pollerRef.current = poller;
    const immediate = isResumedRef.current;
    isResumedRef.current = false;
    poller.start(immediate);
    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, [submitted, sessionId]);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="login-screen"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        testID="login-screen-kav"
      >
        <View className="flex-1 items-center justify-center px-6">
          <Text
            accessibilityRole="header"
            className="text-foreground text-3xl font-bold mb-2"
          >
            Become
          </Text>
          <Text className="text-muted-foreground text-base mb-6">
            {mode === "register"
              ? "Create an account"
              : "Sign in with a magic link"}
          </Text>
          {sessionMessage ? (
            <Text
              testID="login-session-ended"
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              className="text-destructive text-center mb-4"
            >
              {sessionMessage}
            </Text>
          ) : null}
          {submitted ? (
            <View
              testID="login-submitted"
              accessibilityLiveRegion="polite"
              style={{ width: "100%" }}
            >
              <Text
                accessibilityRole="header"
                className="text-foreground text-center mb-2"
              >
                Check your inbox
              </Text>
              <Text className="text-muted-foreground text-center text-sm mb-2">
                {mode === "register"
                  ? `We sent a sign-up link to ${email}. Tap it on your phone to complete your registration — we'll pick it up automatically.`
                  : `We sent a sign-in link to ${email}. Tap it on your phone to continue — we'll pick it up automatically.`}
              </Text>
              <Text className="text-muted-foreground text-center text-xs mb-6">
                The link expires in 15 minutes.
              </Text>
              <Button
                testID="login-change-email"
                variant="ghost"
                onPress={handleChangeEmail}
              >
                Use a different email
              </Button>
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

              {mode === "register" && (
                <Pressable
                  testID="consent-checkbox"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consent }}
                  accessibilityLabel={CONSENT_STATEMENT}
                  style={{ minHeight: 44 }}
                  onPress={() => setConsent((c) => !c)}
                  className="flex-row items-start gap-3 my-3"
                >
                  <View
                    className={`h-5 w-5 mt-0.5 rounded border items-center justify-center ${
                      consent
                        ? "border-primary bg-primary"
                        : "border-border bg-card"
                    }`}
                  >
                    {consent && (
                      <Check
                        size={14}
                        color={colors.background}
                        strokeWidth={3}
                      />
                    )}
                  </View>
                  <Text className="text-muted-foreground text-xs leading-5 flex-1">
                    {CONSENT_STATEMENT}
                  </Text>
                </Pressable>
              )}

              <View style={{ height: 12 }} />
              <Button
                testID="login-submit"
                onPress={handleSubmit}
                disabled={sending || (mode === "register" && !consent)}
                accessibilityLabel={
                  mode === "register" ? "Create account" : "Send magic link"
                }
              >
                {sending
                  ? "Sending…"
                  : mode === "register"
                    ? "Create account"
                    : "Send magic link"}
              </Button>

              {mode === "register" &&
                error &&
                (error.toLowerCase().includes("already in use") ||
                  error.toLowerCase().includes("sign in")) && (
                  <View className="mt-3">
                    <Button
                      testID="login-offer-signin"
                      variant="secondary"
                      onPress={() => {
                        setMode("login");
                        setError(null);
                      }}
                    >
                      Sign in instead
                    </Button>
                  </View>
                )}

              <Pressable
                testID="login-mode-toggle"
                accessibilityRole="button"
                accessibilityLabel={
                  mode === "login"
                    ? "Don't have an account? Create one"
                    : "Already have an account? Sign in"
                }
                style={minTouchTarget}
                onPress={() => {
                  setMode((m) => (m === "login" ? "register" : "login"));
                  setError(null);
                }}
                className="mt-4 py-2 items-center justify-center"
              >
                <Text className="text-muted-foreground text-sm text-center">
                  {mode === "login" ? (
                    <>
                      Don&apos;t have an account?{" "}
                      <Text className="text-foreground font-semibold">
                        Create one
                      </Text>
                    </>
                  ) : (
                    <>
                      Already have an account?{" "}
                      <Text className="text-foreground font-semibold">
                        Sign in
                      </Text>
                    </>
                  )}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

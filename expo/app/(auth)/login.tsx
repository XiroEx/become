import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  BackHandler,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
  ReviewSignInResponseSchema,
  type ReviewSignInResponse,
  type AppleLinkEmailResponse,
  type AuthMode,
  type SendLinkRequest,
} from "@become/api-client";
import { CONSENT_STATEMENT, LEGAL_MINIMUM_AGE } from "@become/core";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import AppleSignInButton, {
  appleSignInSupported,
} from "@/components/AppleSignInButton";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import {
  sendAppleEmailLink,
  signInWithApple,
  type AppleSignInResult,
} from "@/lib/auth/appleSignIn";
import {
  signInWithGoogle,
  type GoogleSignInResult,
} from "@/lib/auth/googleSignIn";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  useAndroidBackHandler,
  type BackHandlerLike,
} from "@/lib/android/backHandler";
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
import { ArrowLeft, Check, Mail } from "lucide-react-native";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import {
  defaultBrowserLauncher,
  type BrowserLauncher,
} from "@/lib/web/browserLauncher";
import { LegalLinks, LEGAL_BASE_URL } from "@/components/legal/LegalLinks";

/**
 * The web header (`webapp/components/Header.tsx`) reads these from env vars
 * with these exact literals as the fallback; native has no landing page to
 * carry an env-driven brand name, so the fallback IS the value here (NP-251).
 */
const BRAND_NAME = "BECOME";
const BRAND_TAGLINE = "Transform your body and mind.";

/** Default poll cadence for the magic-link fallback (mirrors the webapp). */
const POLL_INTERVAL_MS = 2000;

/**
 * The reviewer demo sign-in, on the same screen the members use.
 *
 * Apple and Google hand the build to a person who has to sign in, and a magic
 * link needs an inbox they do not have. ONE designated demo account can be
 * opened with a fixed code from the runtime config instead — the code works
 * for that account only, is rate limited, and is switchable off from config.
 * The rules live server-side in webapp/lib/reviewSignIn.ts; this string must
 * match REVIEW_SIGN_IN_PATH there, and
 * webapp/tests/unit/auth/reviewSignIn.test.ts fails if it drifts.
 */
export const REVIEW_SIGN_IN_PATH = "/api/auth/review-sign-in";

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
  /** DI hook for tests — POSTs /api/auth/review-sign-in (the reviewer door). */
  reviewSignInFn?: (
    email: string,
    code: string,
  ) => Promise<ReviewSignInResponse>;
  /** DI hook for tests — runs Apple's sheet and POSTs /api/auth/apple. */
  appleSignInFn?: () => Promise<AppleSignInResult>;
  /** DI hook for tests — runs the system auth session and POSTs /api/auth/exchange. */
  googleSignInFn?: () => Promise<GoogleSignInResult>;
  /** DI hook for tests — POSTs /api/auth/apple/link with the Apple session. */
  appleLinkFn?: (token: string, email: string) => Promise<AppleLinkEmailResponse>;
  /** DI hook for tests — the Apple button's availability probe (iOS 13+ only). */
  appleAvailableAsync?: () => Promise<boolean>;
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
  /** DI hook for tests — opens the Terms/Privacy/footer legal links. */
  launcher?: BrowserLauncher;
  /** DI hook for tests — injects `BackHandler` for the hardware-back flip (NP-309). */
  backHandler?: BackHandlerLike;
}

export default function LoginScreen({
  sendLinkFn,
  checkSessionFn,
  reviewSignInFn,
  appleSignInFn,
  googleSignInFn,
  appleLinkFn,
  appleAvailableAsync,
  onAuthed,
  pollIntervalMs,
  setTimeoutImpl,
  clearTimeoutImpl,
  pendingSessionStore,
  subscribeToAppState,
  now,
  initialMode,
  launcher = defaultBrowserLauncher,
  backHandler = BackHandler,
}: LoginScreenProps = {}) {
  const { colors, tint } = useThemeTokens();
  const reducedMotion = useReducedMotion();
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
  // The reviewer door, collapsed. Not something a member has.
  const [showReviewCode, setShowReviewCode] = useState(false);
  const [reviewCode, setReviewCode] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  /**
   * A finished Apple sign-in whose session is NOT stored yet, because the
   * account it opened is reachable only at a Hide My Email relay alias and may
   * therefore belong to a member who already has an account. Storing the token
   * would navigate them straight into the empty one; holding it here is what
   * makes "Already a member? Link your email" possible.
   */
  const [appleOffer, setAppleOffer] = useState<{ token: string } | null>(null);
  const [appleLinkBusy, setAppleLinkBusy] = useState(false);
  const submittingRef = useRef(false);
  const pollerRef = useRef<Poller | null>(null);
  const isResumedRef = useRef(false);

  // NP-309: on Android, One UI 7's edge-to-edge enforcement stops
  // `windowSoftInputMode="adjustResize"` from resizing the window the way it
  // used to, so the keyboard covers "Sign in with review code" with no hint
  // that the field is still there — the member has to know to press the
  // keyboard's own dismiss/next arrow. These three refs scroll the review
  // code field AND its submit button above the keyboard instead of relying
  // on a resize that no longer happens.
  const scrollViewRef = useRef<ScrollView>(null);
  const reviewCodeSectionRef = useRef<View>(null);
  const reviewCodeFocusedRef = useRef(false);
  const scrollOffsetRef = useRef(0);

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

  const reviewSignIn =
    reviewSignInFn ??
    ((value: string, code: string) =>
      apiFetch(REVIEW_SIGN_IN_PATH, ReviewSignInResponseSchema, {
        method: "POST",
        body: { email: value, code },
        baseUrl: WEBAPP_BASE_URL,
      }));

  const appleSignIn = appleSignInFn ?? (() => signInWithApple());
  const googleSignIn = googleSignInFn ?? (() => signInWithGoogle());
  const appleLink =
    appleLinkFn ?? ((token: string, value: string) => sendAppleEmailLink(token, value));

  const handleAuthed = onAuthed ?? auth.setToken;

  // Why the member is looking at this screen. After a 401 it says the session
  // ended instead of leaving them to guess why they were thrown out.
  const sessionMessage = signOutMessage(auth.signedOutReason ?? null);

  // Mirrors webapp/lib/authPageMode.ts's getAuthPageCopy — the heading and
  // welcome copy the web card draws above the form (NP-251).
  const authCopy =
    mode === "register"
      ? {
          heading: "Create account",
          welcome:
            "Start your transformation. Create a free account to get going.",
        }
      : {
          heading: "Sign in",
          welcome: "Welcome back. Sign in to pick up where you left off.",
        };

  // The round back button in the web header (webapp/components/Header.tsx,
  // backButton=true) always leads to the marketing home page. Native has no
  // such page behind sign-in — a cold launch replaces straight into this
  // screen — so there is nothing to go back to unless something actually
  // pushed this screen onto the stack (e.g. a web-only hand-off). NP-309: a
  // button that is always drawn but never does anything is exactly the kind
  // of thing a Play reviewer flags, so it is hidden rather than left inert
  // when there is no history, and only shown (and wired to `router.back()`)
  // on the hand-off path where there actually is one.
  const canGoBack = router.canGoBack?.() ?? false;
  const handleBack = (): void => {
    if (canGoBack) router.back();
  };

  // Opens a legal page (Terms, Privacy) in the in-app browser. Same shape as
  // components/auth/ConsentSheet.tsx's onOpenLink.
  const onOpenLink = useCallback(
    (path: string) => {
      void launcher(`${LEGAL_BASE_URL}${path}`);
    },
    [launcher],
  );

  // The waiting dot on the green "Check your email" card. A real loop
  // (Animated, not moti/Reanimated, so lib/a11y/reducedMotion's build rule
  // does not apply) that respects Reduce Motion by holding still instead.
  const waitingDotOpacity = useMemo(() => new Animated.Value(1), []);
  useEffect(() => {
    if (!submitted || reducedMotion) {
      waitingDotOpacity.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(waitingDotOpacity, {
          toValue: 0.25,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(waitingDotOpacity, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [submitted, reducedMotion, waitingDotOpacity]);

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

  /**
   * Spend a review code. Same email box, same screen; the server answers with
   * the session directly instead of sending mail, and it is stored exactly as
   * a magic-link session is.
   */
  const handleReviewSignIn = async (): Promise<void> => {
    if (reviewBusy) return;
    const trimmedEmail = email.trim().toLowerCase();
    const code = reviewCode.trim();
    if (!trimmedEmail.includes("@") || !code) {
      setError("Enter the email and review code you were given");
      return;
    }
    setError(null);
    setReviewBusy(true);
    try {
      const resp = await reviewSignIn(trimmedEmail, code);
      await pendingStore.clear();
      await Promise.resolve(handleAuthed(resp.token));
      router.replace("/");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setReviewBusy(false);
    }
  };

  /**
   * SIGN IN WITH APPLE. Three endings, and the middle one is the whole point
   * of this card: a member who chose Hide My Email is NOT navigated into the
   * account that was just created — they are offered the link first.
   */
  const handleAppleSignIn = async (): Promise<void> => {
    if (appleBusy) return;
    setError(null);
    setAppleBusy(true);
    try {
      const result = await appleSignIn();
      if (result.status === "cancelled") return; // a dismissal is not an error
      if (result.status === "unavailable") {
        setError("Sign in with Apple isn't available on this device.");
        return;
      }
      if (result.status !== "signed-in" || !result.session) {
        setError(result.message ?? "Apple sign-in failed. Please try again.");
        return;
      }
      const session = result.session;
      if (session.canLinkEmail) {
        setAppleOffer({ token: session.token });
        setEmail("");
        announce(
          "Signed in with Apple. If you already have a Become account, link your email address.",
        );
        return;
      }
      await pendingStore.clear();
      await Promise.resolve(handleAuthed(session.token));
      router.replace("/");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setAppleBusy(false);
    }
  };

  /**
   * SIGN IN WITH GOOGLE. The whole ceremony lives in lib/auth/googleSignIn.ts
   * (the system authentication session, then the one-time code exchanged with
   * the verifier); what happens HERE is only what the screen owes the member:
   * a dismissal says nothing, a failure says one sentence, and a success is
   * stored exactly as a magic-link session is.
   *
   * There is no "link your email" branch, unlike Apple: Google always shares a
   * real address, so `bridgeToBecomeSession` matches an existing member on it
   * and they land in the account they already have.
   */
  const handleGoogleSignIn = async (): Promise<void> => {
    if (googleBusy) return;
    setError(null);
    setGoogleBusy(true);
    try {
      const result = await googleSignIn();
      if (result.status === "cancelled") return; // a dismissal is not an error
      if (result.status !== "signed-in" || !result.session) {
        setError(result.message ?? "Google sign-in failed. Please try again.");
        return;
      }
      await pendingStore.clear();
      await Promise.resolve(handleAuthed(result.session.token));
      router.replace("/");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setGoogleBusy(false);
    }
  };

  /** Continue into the account Apple just created, relay address and all. */
  const handleAppleContinue = async (): Promise<void> => {
    const offer = appleOffer;
    if (!offer) return;
    await pendingStore.clear();
    setAppleOffer(null);
    await Promise.resolve(handleAuthed(offer.token));
    router.replace("/");
  };

  /**
   * Send the sign-in link to the member's real address. The answer is a
   * sessionId, which is polled by exactly the same machinery a magic link
   * uses — and the session it eventually yields belongs to their EXISTING
   * account, because the server merges on verification.
   */
  const handleAppleLinkSubmit = async (): Promise<void> => {
    const offer = appleOffer;
    if (!offer || appleLinkBusy) return;
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.includes("@")) {
      setError("Enter the email address your account uses");
      return;
    }
    setError(null);
    setAppleLinkBusy(true);
    try {
      const resp = await appleLink(offer.token, trimmedEmail);
      const startMs = nowImpl();
      setAppleOffer(null);
      setMode("login");
      setSessionId(resp.sessionId);
      setStartedAt(startMs);
      setSubmitted(true);
      await pendingStore.set({
        sessionId: resp.sessionId,
        email: trimmedEmail,
        mode: "login",
        startedAt: startMs,
      });
      announce(`Check your inbox. We sent a sign-in link to ${trimmedEmail}.`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setAppleLinkBusy(false);
    }
  };

  // A STABLE press handler for the memoised Apple button, latched through a
  // ref the same way the poller's callbacks are: the handler closes over this
  // render's state, the identity the button sees never changes, and the native
  // view is not re-rendered on every keystroke in the email box.
  const appleSignInRef = useRef(handleAppleSignIn);
  useEffect(() => {
    appleSignInRef.current = handleAppleSignIn;
  });
  const onApplePress = useCallback(() => {
    void appleSignInRef.current();
  }, []);

  // The Google button is memoised for the same reason and latched the same way.
  const googleSignInRef = useRef(handleGoogleSignIn);
  useEffect(() => {
    googleSignInRef.current = handleGoogleSignIn;
  });
  const onGooglePress = useCallback(() => {
    void googleSignInRef.current();
  }, []);

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

  /**
   * The sign-in/sign-up toggle, moved (NP-251) so it reads below the green
   * "Check your email" card too, matching webapp/components/AuthScreen.tsx —
   * there it is an ordinary navigation to the other pathname, which cannot
   * leave a stale poller running. Here `mode` is state, not a route, so a
   * press while a link is still out has to tear the pending session down
   * first or it would keep polling a session nobody can see any more.
   */
  const handleToggleMode = async (): Promise<void> => {
    if (submitted) {
      await handleChangeEmail();
    }
    setMode((m: AuthMode) => (m === "login" ? "register" : "login"));
    setError(null);
  };

  // NP-309: system back on "Create account" used to exit the app outright —
  // web's /register is its own page, so its back goes to /login. Mode here is
  // state, not a route, so the hardware back button has to be told to flip it
  // instead. Apple's "link your email" detour isn't a mode, so it is left to
  // the OS default.
  useAndroidBackHandler({
    enabled: mode === "register" && !appleOffer,
    onBack: () => {
      void handleToggleMode();
      return true;
    },
    backHandler,
  });

  // NP-309: scroll the review-code field and its submit button above the
  // keyboard. See the refs above for why this cannot be left to the OS resize
  // on Android. iOS already does this itself (its ScrollView focuses the
  // active TextInput natively), so this only runs on Android.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = Keyboard.addListener("keyboardDidShow", (event) => {
      if (!reviewCodeFocusedRef.current) return;
      const section = reviewCodeSectionRef.current;
      const scroller = scrollViewRef.current;
      if (!section || !scroller) return;
      const keyboardHeight = event?.endCoordinates?.height ?? 0;
      section.measureInWindow((_x, y, _width, height) => {
        const visibleBottom = Dimensions.get("window").height - keyboardHeight;
        const overflow = y + height - visibleBottom;
        if (overflow > 0) {
          scroller.scrollTo({
            y: scrollOffsetRef.current + overflow + 16,
            animated: true,
          });
        }
      });
    });
    return () => subscription.remove();
  }, []);

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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        testID="login-screen-kav"
      >
        <ScrollView
          ref={scrollViewRef}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 40,
          }}
        >
          {/* THE WEB HEADER (webapp/components/Header.tsx, backButton=true):
              a round back button beside the brand name and tagline, replacing
              the centred "Become" wordmark this screen drew on its own
              (NP-251). */}
          <View
            testID="login-header"
            className="flex-row items-center gap-3 mb-6"
          >
            {canGoBack ? (
              <Pressable
                testID="login-back-button"
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={handleBack}
                style={{
                  height: 56,
                  width: 56,
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ArrowLeft size={22} color={colors.foreground} />
              </Pressable>
            ) : null}
            <View className="flex-1">
              <Text
                className="text-foreground text-xl font-bold"
                style={WRAPPABLE_TEXT}
              >
                {BRAND_NAME}
              </Text>
              <Text
                className="text-muted-foreground text-xs"
                style={WRAPPABLE_TEXT}
              >
                {BRAND_TAGLINE}
              </Text>
            </View>
          </View>

          {/* THE CARD (webapp/components/AuthScreen.tsx's <main>): title,
              welcome copy, the form or the sent state, the mode toggle, the
              legal line and the footer links all live together here. */}
          <View
            testID="login-card"
            className="rounded-2xl border border-border bg-card p-5"
          >
            <Text
              testID="login-heading"
              accessibilityRole="header"
              className="text-foreground text-2xl font-bold mb-2"
              style={WRAPPABLE_TEXT}
            >
              {authCopy.heading}
            </Text>
            <Text className="text-muted-foreground text-sm mb-6">
              {authCopy.welcome}
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
                {/* THE GREEN "CHECK YOUR EMAIL" CARD — mirrors
                    webapp/components/AuthForm.tsx's emailSent branch: a mail
                    icon, the heading, the address, the expiry note and a
                    pulsing "Waiting for verification..." dot. */}
                <View
                  testID="login-sent-card"
                  style={{
                    backgroundColor: tint("success", 0.12),
                    borderWidth: 1,
                    borderColor: tint("success", 0.35),
                    borderRadius: 12,
                    padding: 20,
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      height: 48,
                      width: 48,
                      borderRadius: 24,
                      backgroundColor: tint("success", 0.2),
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 12,
                    }}
                  >
                    <Mail size={22} color={colors.success} />
                  </View>
                  <Text className="text-foreground text-lg font-semibold text-center mb-2">
                    Check your email
                  </Text>
                  <Text className="text-muted-foreground text-sm text-center">
                    We sent a verification link to
                  </Text>
                  <Text
                    testID="login-sent-email"
                    className="text-foreground text-sm font-medium text-center mb-3"
                  >
                    {email}
                  </Text>
                  <Text className="text-muted-foreground text-xs text-center mb-3">
                    Click the link in the email to{" "}
                    {mode === "register"
                      ? "complete your registration"
                      : "sign in"}
                    . The link expires in 15 minutes.
                  </Text>
                  <View className="flex-row items-center justify-center gap-2">
                    <Animated.View
                      testID="login-waiting-dot"
                      className="h-2 w-2 rounded-full bg-green-500"
                      style={{ opacity: waitingDotOpacity }}
                    />
                    <Text
                      className="text-muted-foreground text-xs"
                      style={WRAPPABLE_TEXT}
                    >
                      Waiting for verification...
                    </Text>
                  </View>
                </View>

                <Pressable
                  testID="login-change-email"
                  accessibilityRole="button"
                  accessibilityLabel="Use a different email"
                  onPress={handleChangeEmail}
                  style={[
                    minTouchTarget,
                    { alignSelf: "center", alignItems: "center", justifyContent: "center" },
                  ]}
                  className="mt-4"
                >
                  <Text className="text-muted-foreground text-sm underline">
                    Use a different email
                  </Text>
                </Pressable>
              </View>
            ) : appleOffer ? (
            /* Signed in with Apple, holding the session back. See appleOffer. */
            <View testID="apple-link-offer" style={{ width: "100%" }}>
              <Text
                accessibilityRole="header"
                className="text-foreground text-center mb-2"
              >
                Already a member?
              </Text>
              <Text className="text-muted-foreground text-center text-sm mb-4">
                Apple kept your email address private, so we could not tell
                whether you already have a Become account. Enter the email
                address you use and we will send a link to bring it across —
                you will keep one account, with all your history.
              </Text>
              <Input
                testID="apple-link-email"
                label="Your email"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="go"
                onSubmitEditing={handleAppleLinkSubmit}
                value={email}
                onChangeText={setEmail}
                error={error ?? undefined}
                placeholder="you@example.com"
              />
              <View style={{ height: 12 }} />
              <Button
                testID="apple-link-submit"
                onPress={handleAppleLinkSubmit}
                disabled={appleLinkBusy}
                accessibilityLabel="Send a link to my email"
              >
                {appleLinkBusy ? "Sending…" : "Link my email"}
              </Button>
              <View style={{ height: 8 }} />
              <Button
                testID="apple-link-skip"
                variant="ghost"
                onPress={handleAppleContinue}
                accessibilityLabel="Continue as a new member"
              >
                I&apos;m new — continue
              </Button>
            </View>
          ) : (
            <View style={{ width: "100%" }}>
              <Input
                testID="login-email"
                accessibilityLabel="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="go"
                onSubmitEditing={() => {
                  // NP-309: web's Enter submits "Continue with email" — the
                  // keyboard's Go/Done key did nothing but close the keyboard.
                  void handleSubmit();
                }}
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
                  <Text className="text-foreground text-xs leading-5 flex-1">
                    I am at least {LEGAL_MINIMUM_AGE} years old, and I agree to the{" "}
                    <Text
                      testID="consent-terms-link"
                      accessibilityRole="link"
                      accessibilityLabel="Terms of Service"
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        onOpenLink("/terms");
                      }}
                      style={minTouchTarget}
                      className="font-medium text-foreground underline"
                    >
                      Terms of Service
                    </Text>
                    {" and the "}
                    <Text
                      testID="consent-privacy-link"
                      accessibilityRole="link"
                      accessibilityLabel="Privacy Policy"
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        onOpenLink("/privacy");
                      }}
                      style={minTouchTarget}
                      className="font-medium text-foreground underline"
                    >
                      Privacy Policy
                    </Text>
                    .
                  </Text>
                </Pressable>
              )}

              <View style={{ height: 12 }} />
              {/* THE PRIMARY BUTTON. Black, "Continue with email" on both
                  modes, exactly like webapp/components/AuthForm.tsx's
                  `bg-zinc-900 dark:bg-white` submit button (NP-251) — a magic
                  link is sent either way, so the copy no longer has to say
                  which mode sent it. */}
              <Button
                testID="login-submit"
                variant="inverted"
                onPress={handleSubmit}
                disabled={sending || (mode === "register" && !consent)}
                accessibilityLabel="Continue with email"
              >
                {sending ? "Sending…" : "Continue with email"}
              </Button>

              {/* THE OTHER WAYS IN. The divider is unconditional now, because
                  Google is offered on both platforms (NP-126) — it runs in the
                  SYSTEM authentication session, which is the only place Google
                  allows sign-in, and comes back as a one-time code rather than
                  a token in a URL. Sign in with Apple sits under it and is
                  absent where the platform cannot have it. */}
              <View className="my-4 flex-row items-center gap-3">
                <View className="flex-1 h-px bg-border" />
                {/* web's divider is `uppercase tracking-wide` ("OR"); this one
                    rendered plain lowercase "or" (NP-309). */}
                <Text
                  testID="login-or-divider"
                  className="text-muted-foreground text-xs uppercase tracking-wide"
                >
                  or
                </Text>
                <View className="flex-1 h-px bg-border" />
              </View>

              {/* "Continue with Google" on both modes — webapp's Google
                  button never varies by mode either (NP-251). Apple's button
                  below keeps its own sign-in/sign-up wording: Apple draws it,
                  and the web has no Apple button on this screen to match. */}
              <GoogleSignInButton onPress={onGooglePress} disabled={googleBusy} />
              {googleBusy ? (
                <Text
                  testID="google-sign-in-busy"
                  accessibilityLiveRegion="polite"
                  className="text-muted-foreground text-xs text-center mt-2"
                >
                  Signing in with Google…
                </Text>
              ) : null}

              {/* SIGN IN WITH APPLE, drawn by Apple, and no less prominent
                  than the buttons above it — which is what the Human Interface
                  Guidelines require of it. */}
              {appleSignInSupported() ? (
                <>
                  <View style={{ height: 12 }} />
                  <AppleSignInButton
                    intent={mode === "register" ? "sign-up" : "sign-in"}
                    onPress={onApplePress}
                    {...(appleAvailableAsync
                      ? { isAvailableAsync: appleAvailableAsync }
                      : {})}
                  />
                  {appleBusy ? (
                    <Text
                      testID="apple-sign-in-busy"
                      accessibilityLiveRegion="polite"
                      className="text-muted-foreground text-xs text-center mt-2"
                    >
                      Signing in with Apple…
                    </Text>
                  ) : null}
                </>
              ) : null}

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

              {/* App reviewers. See REVIEW_SIGN_IN_PATH above for why this
                  exists: a reviewer must be able to sign in, and there is no
                  inbox here for a magic link. Sign-in mode only. */}
              {mode === "login" &&
                (showReviewCode ? (
                  <View
                    ref={reviewCodeSectionRef}
                    className="mt-4 w-full"
                    testID="login-review-code"
                  >
                    <Text className="text-muted-foreground text-xs mb-2">
                      Enter the email and review code you were given.
                    </Text>
                    <Input
                      testID="login-review-code-input"
                      accessibilityLabel="Review code"
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      // NP-309: plain "one-time-code" still let the Samsung
                      // keyboard learn and suggest the code in its suggestion
                      // strip — a review code is not something to remember or
                      // offer back later, so autofill is switched off and the
                      // field is treated as secure-ish entry like a password.
                      autoComplete="off"
                      importantForAutofill="no"
                      secureTextEntry
                      returnKeyType="go"
                      onSubmitEditing={handleReviewSignIn}
                      onFocus={() => {
                        reviewCodeFocusedRef.current = true;
                      }}
                      onBlur={() => {
                        reviewCodeFocusedRef.current = false;
                      }}
                      value={reviewCode}
                      onChangeText={setReviewCode}
                      placeholder="Review code"
                    />
                    <View style={{ height: 8 }} />
                    {/* web's submit is outlined and disabled until both the
                        email and the code are filled, not a filled grey
                        button that is only disabled while sending (NP-309). */}
                    <Button
                      testID="login-review-code-submit"
                      variant="ghost"
                      disabled={reviewBusy || !email.trim() || !reviewCode.trim()}
                      onPress={handleReviewSignIn}
                      accessibilityLabel="Sign in with review code"
                    >
                      {reviewBusy ? "Signing in…" : "Sign in with review code"}
                    </Button>
                  </View>
                ) : (
                  <Pressable
                    testID="login-review-code-disclosure"
                    accessibilityRole="button"
                    accessibilityLabel="App reviewer? Use a review code"
                    style={minTouchTarget}
                    onPress={() => setShowReviewCode(true)}
                    className="mt-2 py-2 items-center justify-center"
                  >
                    <Text
                      testID="login-review-code-disclosure-text"
                      className="text-muted-foreground text-xs text-center underline"
                    >
                      App reviewer? Use a review code
                    </Text>
                  </Pressable>
                ))}
            </View>
          )}

            {/* THE MODE TOGGLE, THE LEGAL LINE AND THE FOOTER LINKS — all
                rendered by webapp/components/AuthScreen.tsx itself, so they
                sit below the form AND below the green "Check your email"
                card alike (NP-251). Not drawn over the Apple-link offer,
                which is a native-only detour with no "mode" of its own. */}
            {!appleOffer && (
              <>
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
                    void handleToggleMode();
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

                <View
                  className="mt-4 pt-4 border-t border-border"
                  testID="login-legal"
                >
                  {/* webapp/components/AuthScreen.tsx: "Registering here IS
                      the moment of agreement, so the terms have to be
                      reachable from this screen." */}
                  <Text className="text-muted-foreground text-xs leading-5">
                    By continuing you agree to the{" "}
                    <Text
                      testID="login-terms-link"
                      accessibilityRole="link"
                      accessibilityLabel="Terms of Service"
                      onPress={() => onOpenLink("/terms")}
                      style={minTouchTarget}
                      className="font-medium text-foreground underline"
                    >
                      Terms of Service
                    </Text>
                    {" and the "}
                    <Text
                      testID="login-privacy-link"
                      accessibilityRole="link"
                      accessibilityLabel="Privacy Policy"
                      onPress={() => onOpenLink("/privacy")}
                      style={minTouchTarget}
                      className="font-medium text-foreground underline"
                    >
                      Privacy Policy
                    </Text>
                    .
                  </Text>
                  <LegalLinks
                    testID="login-footer-legal-links"
                    launcher={launcher}
                  />
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

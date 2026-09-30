/**
 * THE session. One of them, for the whole app.
 *
 * What this replaces: `useAuth` used to be a plain hook, so every screen that
 * called it held its OWN copy of the session and made its OWN
 * `GET /api/auth/me`. Three consequences, all of them shipped:
 *
 *  - any failure of that call deleted the stored token, so a launch on a train
 *    signed the member out;
 *  - the freshly-minted token the server returns was never stored, so a
 *    session died 30 days after sign-in however active its owner was;
 *  - nothing reacted to a 401 in one place, so an ended session showed up as
 *    empty lists on whichever screens happened to be mounted.
 *
 * The rules here are the web's rules (`webapp/components/AuthGuard.tsx`):
 * check `exp` locally first, roll the sliding session with `/api/auth/me` and
 * STORE the token it returns, and never sign anyone out because the network
 * was unavailable. The one native addition is signing out on a 401 — the web
 * can fall back to its cookie, native cannot.
 *
 * A DELIBERATE SIGN-OUT ALSO TELLS THE SERVER, which the web has always done
 * (`webapp/components/TopNav.tsx` POSTs `/api/auth/logout`). Forgetting the JWT
 * is enough for the app itself — but not for a read-only widgets token, which
 * lives in an OS widget extension outside this process and outlasts it by
 * months. `POST /api/auth/logout` bumps `User.widgetTokenVersion`, and that is
 * the only thing that can stop one (`webapp/lib/widgets/token.ts`).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  MeResponseSchema,
  apiFetch,
  type ApiCallInit,
  type ApiFetchOptions,
  type User,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { isJwtExpired } from "@/lib/auth/jwt";
import { setUnauthorizedHandler } from "@/lib/auth/unauthorized";
import { sessionStore, type TokenStore } from "@/lib/auth/secureStoreToken";
import {
  getStoredPushToken,
  clearStoredPushToken,
} from "@/lib/push/pushTokenStore";
import { clearAppBadge } from "@/lib/widgets/badge";
import { clearAllLiveWorkoutDrafts } from "@/lib/live/liveWorkoutCache";
import { getOfflineWrites } from "@/lib/offline/writes";

/**
 * `loading` is the launch read of the secure store — it is NOT "a request is
 * in flight". Once the stored token has been read and its `exp` checked, the
 * member is signed in or out; whatever `/api/auth/me` answers afterwards can
 * only confirm it or end it.
 */
export type AuthStatus = "loading" | "signed-in" | "signed-out";

export type SignOutReason =
  /** A request answered 401: the server no longer accepts this session. */
  | "unauthorized"
  /** The stored token's own `exp` had passed before we sent anything. */
  | "expired"
  /** `/api/auth/me` answered 404: the user row is gone. */
  | "not-found"
  /** The cold-open unlock failed, so the token was dropped. */
  | "biometric-fail"
  /** The member asked. Nothing to apologise for on the sign-in screen. */
  | "member";

/**
 * What the sign-in screen says about why it is being shown. `null` for a
 * launch that was simply never signed in, and for a deliberate sign out —
 * telling a first-time member their session ended would be a lie.
 */
const SIGN_OUT_MESSAGES: Record<SignOutReason, string | null> = {
  unauthorized: "Your session ended. Please sign in again.",
  expired: "Your session expired. Please sign in again.",
  "not-found": "That account is no longer available. Please sign in again.",
  "biometric-fail": "Become stayed locked. Please sign in again.",
  member: null,
};

export function signOutMessage(reason: SignOutReason | null): string | null {
  if (reason === null) return null;
  return SIGN_OUT_MESSAGES[reason] ?? null;
}

export interface SignOutOptions {
  endpoint?: string;
}

export interface AuthContextValue {
  status: AuthStatus;
  token: string | null;
  user: User | null;
  /** `status === "loading"`. Kept because every guard reads it. */
  loading: boolean;
  /** `status === "signed-in"`. True offline, with or without a cached user. */
  isAuthed: boolean;
  /** Why the last sign-out happened, or `null`. Cleared by the next sign-in. */
  signedOutReason: SignOutReason | null;
  /** Persist a JWT (sign in) or drop it (`null` → sign out). */
  setToken: (value: string | null) => Promise<void>;
  /** Re-read the session and roll it against `/api/auth/me`. */
  refresh: () => Promise<void>;
  /** End the session once, everywhere, with a reason the login screen reads. */
  signOut: (reason?: SignOutReason, options?: SignOutOptions) => Promise<void>;
  /** `signOut("member")`. The name every screen already calls. */
  logout: (options?: SignOutOptions) => Promise<void>;
}

interface SessionState {
  status: AuthStatus;
  token: string | null;
  user: User | null;
  signedOutReason: SignOutReason | null;
}

const INITIAL_STATE: SessionState = {
  status: "loading",
  token: null,
  user: null,
  signedOutReason: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** What `GET /api/auth/me` told us, in the only three flavours that matter. */
type MeOutcome =
  | { kind: "ok"; user: User; token?: string }
  | { kind: "rejected"; reason: SignOutReason }
  | { kind: "unreachable" };

export interface AuthProviderProps {
  children: ReactNode;
  /** Where the JWT lives. Defaults to `sessionStore` (`become.session`). */
  store?: TokenStore;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Clock injection point for tests. */
  now?: () => number;
}

export function AuthProvider({
  children,
  store = sessionStore,
  baseUrl = WEBAPP_BASE_URL,
  fetchImpl,
  now,
}: AuthProviderProps) {
  const [session, setSession] = useState<SessionState>(INITIAL_STATE);

  const mountedRef = useRef<boolean>(true);
  // The state as of NOW, readable synchronously. `signOut` has to know whether
  // it has already run without waiting for a re-render, or two 401s landing in
  // the same tick would each run the teardown.
  const sessionRef = useRef<SessionState>(INITIAL_STATE);
  const configRef = useRef({ store, baseUrl, fetchImpl, now });
  useEffect(() => {
    configRef.current = { store, baseUrl, fetchImpl, now };
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const commit = useCallback((next: SessionState): void => {
    sessionRef.current = next;
    if (mountedRef.current) setSession(next);
  }, []);

  const callMe = useCallback(async (jwt: string): Promise<MeOutcome> => {
    const config = configRef.current;
    const init: ApiCallInit & ApiFetchOptions = {
      method: "GET",
      getToken: () => jwt,
      baseUrl: config.baseUrl,
    };
    if (config.fetchImpl !== undefined) init.fetchImpl = config.fetchImpl;
    try {
      const result = await apiFetch("/api/auth/me", MeResponseSchema, init);
      const outcome: MeOutcome = { kind: "ok", user: result.user };
      if (result.token) outcome.token = result.token;
      return outcome;
    } catch (error) {
      // 401 — the token is not a session any more. 404 — the user row is gone
      // (`webapp/app/api/auth/me/route.ts:56`). Both are real answers.
      if (error instanceof ApiError && error.status === 401) {
        return { kind: "rejected", reason: "unauthorized" };
      }
      if (error instanceof ApiError && error.status === 404) {
        return { kind: "rejected", reason: "not-found" };
      }
      // Everything else — offline, DNS, a 500, a response we could not parse —
      // says nothing about the session. Keep it.
      return { kind: "unreachable" };
    }
  }, []);

  /**
   * Tell the server the member signed out, so every read-only widgets token
   * they hold stops working. Raw `fetch`, not `apiFetch`: there is no body worth
   * parsing, and a 401 here must not be reported to the unauthorized handler
   * that called us.
   *
   * BEST-EFFORT, AND IT RUNS AFTER THE LOCAL SESSION IS ALREADY GONE. Offline,
   * DNS, a 500 — none of them may keep a member signed in on a device they
   * asked to be signed out of. A widgets token that outlives a failed call dies
   * at the next deliberate sign-out, at a deletion request, or with its own exp.
   */
  const notifyServerOfSignOut = useCallback(async (jwt: string): Promise<void> => {
    const config = configRef.current;
    const send = config.fetchImpl ?? fetch;
    try {
      await send(`${config.baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });
    } catch {
      /* a sign-out may never fail */
    }
  }, []);

  const dropPushSubscription = useCallback(
    async (jwt: string, endpoint?: string): Promise<void> => {
      const config = configRef.current;
      const send = config.fetchImpl ?? fetch;
      const targetEndpoint = endpoint ?? (await getStoredPushToken());
      if (targetEndpoint) {
        try {
          await send(`${config.baseUrl}/api/notifications/unsubscribe`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({ endpoint: targetEndpoint }),
          });
        } catch {
          /* unsubscribe failure must not block sign out */
        }
      }
      try {
        await clearStoredPushToken();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const signOut = useCallback(
    async (
      reason: SignOutReason = "member",
      options?: SignOutOptions,
    ): Promise<void> => {
      // ONCE. Three requests can 401 together; the member is signed out one
      // time, with one reason, and the sign-in screen is reached one time.
      if (sessionRef.current.status === "signed-out") return;
      const presented = sessionRef.current.token;
      commit({
        status: "signed-out",
        token: null,
        user: null,
        signedOutReason: reason === "member" ? null : reason,
      });
      try {
        await configRef.current.store.clear();
      } catch {
        // The Keychain refusing to delete cannot keep the member signed in:
        // the in-memory session is already gone, and the next launch re-checks
        // `exp` anyway.
      }

      // Drop on-device caches: last-known cache / offline queue (NP-036),
      // the app icon badge, and any live workout drafts (NP-079).
      try {
        await getOfflineWrites().clear();
      } catch {
        /* ignore */
      }
      try {
        await clearAppBadge();
      } catch {
        /* ignore */
      }
      try {
        await clearAllLiveWorkoutDrafts();
      } catch {
        /* ignore */
      }

      // Only a DELIBERATE sign-out. "unauthorized" and "expired" mean the server
      // has already stopped accepting this token, so the call could not be
      // authenticated and would revoke nothing.
      if (reason === "member" && presented) {
        await dropPushSubscription(presented, options?.endpoint);
        await notifyServerOfSignOut(presented);
      }
    },
    [commit, dropPushSubscription, notifyServerOfSignOut],
  );

  /**
   * Read the stored session and roll it.
   *
   * `showLoading` is true only for the launch read. A refresh from inside the
   * app keeps the current status, because dropping to `loading` would unmount
   * every guarded screen for the duration of a round trip.
   */
  const hydrate = useCallback(
    async (showLoading: boolean): Promise<void> => {
      const config = configRef.current;
      if (showLoading) {
        commit({ ...INITIAL_STATE, status: "loading" });
      }

      let stored: string | null = null;
      try {
        stored = await config.store.get();
      } catch {
        // A secure-store read that throws is not a sign-out: there is nothing
        // to clear and nothing to trust either. Show the sign-in screen.
        stored = null;
      }

      if (!stored) {
        commit({
          status: "signed-out",
          token: null,
          user: null,
          signedOutReason: sessionRef.current.signedOutReason,
        });
        return;
      }

      const nowMs = config.now ? config.now() : Date.now();
      if (isJwtExpired(stored, nowMs)) {
        // Past its own `exp` — no request needed, and none sent.
        try {
          await config.store.clear();
        } catch {
          /* nothing to do: the token is unusable either way */
        }
        commit({
          status: "signed-out",
          token: null,
          user: null,
          signedOutReason: "expired",
        });
        return;
      }

      // The local check passed, so the member IS signed in — before any
      // network call, and whether or not one ever succeeds.
      const cachedUser = sessionRef.current.user;
      commit({
        status: "signed-in",
        token: stored,
        user: cachedUser,
        signedOutReason: null,
      });

      const outcome = await callMe(stored);
      if (!mountedRef.current) return;
      // Something else changed the session while we were waiting (a 401
      // elsewhere, a sign out, a fresh sign-in). Its verdict wins.
      if (sessionRef.current.token !== stored) return;

      if (outcome.kind === "rejected") {
        await signOut(outcome.reason);
        return;
      }
      if (outcome.kind === "unreachable") {
        // Offline or a 5xx: stay signed in with whatever user we had.
        return;
      }

      // The sliding session: `/api/auth/me` mints a fresh 30-day token on
      // every call, and STORING it is what keeps an active member signed in
      // past day 30 (`webapp/app/api/auth/me/route.ts:73-86`, and
      // `rollSession` in webapp/components/AuthGuard.tsx:22-32).
      let token = stored;
      if (outcome.token && outcome.token !== stored) {
        try {
          await config.store.set(outcome.token);
          token = outcome.token;
        } catch {
          // Could not persist the roll — the presented token is still valid,
          // so the member stays signed in on it.
        }
      } else if (outcome.token) {
        token = outcome.token;
      }
      commit({
        status: "signed-in",
        token,
        user: outcome.user,
        signedOutReason: null,
      });
    },
    [callMe, commit, signOut],
  );

  const setToken = useCallback(
    async (value: string | null): Promise<void> => {
      if (value === null) {
        await signOut("member");
        return;
      }
      await configRef.current.store.set(value);
      // A freshly-minted token is trusted immediately: sign-in must not wait
      // on a second round trip, and must not fail because of one.
      commit({
        status: "signed-in",
        token: value,
        user: null,
        signedOutReason: null,
      });

      const outcome = await callMe(value);
      if (!mountedRef.current) return;
      if (sessionRef.current.token !== value) return;
      if (outcome.kind === "rejected") {
        await signOut(outcome.reason);
        return;
      }
      if (outcome.kind === "unreachable") return;

      let token = value;
      if (outcome.token && outcome.token !== value) {
        try {
          await configRef.current.store.set(outcome.token);
          token = outcome.token;
        } catch {
          /* keep the token we already persisted */
        }
      } else if (outcome.token) {
        token = outcome.token;
      }
      commit({
        status: "signed-in",
        token,
        user: outcome.user,
        signedOutReason: null,
      });
    },
    [callMe, commit, signOut],
  );

  const refresh = useCallback(async (): Promise<void> => {
    await hydrate(false);
  }, [hydrate]);

  const logout = useCallback(
    async (options?: SignOutOptions): Promise<void> => {
      await signOut("member", options);
    },
    [signOut],
  );

  useEffect(() => {
    // The launch read. This is the whole point of the provider.
    void hydrate(true);
  }, [hydrate]);

  useEffect(() => {
    // Everything that fails with a 401 ends up here, once.
    return setUnauthorizedHandler(() => {
      void signOut("unauthorized");
    });
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: session.status,
      token: session.token,
      user: session.user,
      loading: session.status === "loading",
      isAuthed: session.status === "signed-in",
      signedOutReason: session.signedOutReason,
      setToken,
      refresh,
      signOut,
      logout,
    }),
    [session, setToken, refresh, signOut, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * The session, from the one provider at the root. Throwing when it is missing
 * is deliberate: a screen rendering its own session is the bug this file
 * exists to remove, and a silent fallback would hide it.
 */
export function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error(
      "useAuth() was called outside <AuthProvider>. Mount it in app/_layout.tsx (and wrap the component under test).",
    );
  }
  return value;
}

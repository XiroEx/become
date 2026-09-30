/**
 * THE THREE THINGS A MEMBER MUST SEE (and must NOT see) — NP-049.
 *
 * Native counterpart of `webapp/tests/unit/entitlements/uiSurfaces.test.tsx`,
 * rendered against the REAL store and a stubbed server, because all three of
 * these are about ordering and identity rather than about markup:
 *
 *   1. a free member at a cap sees the lock, deletes one, and the lock clears
 *      WITHOUT waiting out the TTL (the clock is frozen, so nothing here can
 *      pass by simply letting 60 seconds go by);
 *   2. with `ENTITLEMENTS_ENFORCED` unset on the server — `enforced: false` on
 *      the wire — no lock and no counter render at all. That single check is
 *      what lets the whole paywall ship dark;
 *   3. signing out and in as another member never shows the first member's
 *      plan, driven through the real `AuthProvider` so the wiring is under test
 *      and not just the store.
 */

import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Text } from "@/components/Text";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { useAuth } from "@/lib/auth/useAuth";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import { clearAll, setCacheMemberId } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import { AllowanceCounter } from "@/components/entitlements/AllowanceCounter";
import { AllowanceLock } from "@/components/entitlements/AllowanceLock";
import {
  configureEntitlementsStore,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
  useEntitlements,
} from "@/lib/entitlements";

const NOW_MS = Date.UTC(2026, 8, 30, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function jwtFor(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor((NOW_MS + 30 * DAY_MS) / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-${userId}`;
}

const MEMBER_1 = jwtFor("member-1");
const MEMBER_2 = jwtFor("member-2");

// ─── The entitlements server, one held-open request at a time ────────────────

interface Pending {
  token: string | null;
  settle: (body: unknown) => void;
}

const requests: Pending[] = [];

const entitlementsFetch = ((
  _url: string,
  init?: { headers?: Record<string, string> },
) =>
  new Promise((resolve) => {
    const auth = init?.headers?.Authorization ?? null;
    requests.push({
      token: auth ? auth.replace(/^Bearer /, "") : null,
      settle: (body) =>
        resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(body),
          headers: { get: () => null },
        } as unknown as Response),
    });
  })) as unknown as typeof fetch;

/** `apiFetch` awaits the token before it dispatches, so give it that tick. */
const nextRequest = async (count: number): Promise<void> => {
  await waitFor(() => expect(requests).toHaveLength(count));
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

function freePlan(canCreate: boolean, remaining: number, enforced = true) {
  return {
    role: "user",
    tier: "free",
    enforced,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: true,
    features: {
      "custom-exercises": {
        allowed: true,
        canCreate,
        requiresTier: "plus",
        limit: 3,
        used: 3 - remaining,
        remaining,
        resetsAt: null,
        window: "lifetime",
      },
    },
  };
}

/** At the cap: the lock, the counter at 3/3, no create control. */
const AT_CAP = freePlan(false, 0);
/** One deleted: the slot is back. */
const SLOT_FREED = freePlan(true, 1);
/**
 * The switch is OFF. The server still reports the real counts (shadow mode) and
 * still says the member is at the cap — `canCreate` is what the client reads and
 * `enforced` is the outer gate, so this is the body that proves the gate is the
 * gate.
 */
const UNENFORCED_AT_CAP = freePlan(false, 0, false);
/** Member 2: Plus, nothing capped. */
const PLUS_MEMBER = {
  role: "user",
  tier: "plus",
  enforced: true,
  grandfathered: false,
  subscription: { status: "active", currentPeriodEnd: null, cancelAtPeriodEnd: false },
  checkoutAvailable: true,
  features: {
    "custom-exercises": {
      allowed: true,
      canCreate: true,
      requiresTier: "plus",
      limit: null,
      used: 9,
      remaining: null,
      resetsAt: null,
      window: "lifetime",
    },
  },
};

// ─── One gated screen ────────────────────────────────────────────────────────

function GatedScreen({ onDelete }: { onDelete?: () => Promise<void> }) {
  const { refresh, canCreate } = useEntitlements();
  return (
    <View>
      <AllowanceCounter feature="custom-exercises" />
      <AllowanceLock feature="custom-exercises" />
      {canCreate("custom-exercises") ? (
        <Text testID="create-exercise">New exercise</Text>
      ) : null}
      <Pressable
        testID="delete-exercise"
        onPress={() => {
          void (async () => {
            await onDelete?.();
            // A delete frees its slot server-side immediately. Forcing a read
            // is what makes the lock clear on screen now rather than whenever
            // the TTL happens to lapse.
            await refresh();
          })();
        }}
      >
        <Text>Delete one</Text>
      </Pressable>
    </View>
  );
}

let storage: AsyncStorageLike;

beforeEach(async () => {
  requests.length = 0;
  storage = createMemoryAsyncStorage();
  await clearAll(storage);
  setCacheMemberId(null);
  configureEntitlementsStore({
    baseUrl: "https://example.test",
    fetchImpl: entitlementsFetch,
    storage,
  });
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  // The clock never moves in this file. Anything that passes here passes
  // without the TTL lapsing.
  jest.spyOn(Date, "now").mockImplementation(() => NOW_MS);
});

afterEach(async () => {
  jest.restoreAllMocks();
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  await clearAll(storage);
});

// ─── 1. The cap, and the delete that clears it ───────────────────────────────

describe("a free member at a cap", () => {
  it("sees the lock, deletes one, and the lock clears without waiting for the TTL", async () => {
    setEntitlementsToken(MEMBER_1);
    const onDelete = jest.fn(async () => {});
    const screen = render(<GatedScreen onDelete={onDelete} />);

    await nextRequest(1);
    await act(async () => {
      requests[0]!.settle(AT_CAP);
    });

    // The lock, in the words @become/core gives both apps.
    const lock = await waitFor(() => screen.getByTestId("allowance-lock"));
    expect(lock).toBeTruthy();
    expect(screen.getByTestId("allowance-lock-headline")).toHaveTextContent(
      "Custom exercises are included with Plus.",
    );
    expect(screen.getByTestId("allowance-lock-allowance")).toHaveTextContent(
      "You're using all 3 of your free slots. Delete one to free a slot, or upgrade for unlimited.",
    );
    expect(screen.getByTestId("allowance-counter-count")).toHaveTextContent("3/3");
    // `canCreate` is false, so there is no create control to tap.
    expect(screen.queryByTestId("create-exercise")).toBeNull();

    // They delete one. The clock has not moved.
    await act(async () => {
      fireEvent.press(screen.getByTestId("delete-exercise"));
    });
    expect(onDelete).toHaveBeenCalledTimes(1);

    await nextRequest(2);
    await act(async () => {
      requests[1]!.settle(SLOT_FREED);
    });

    await waitFor(() =>
      expect(screen.queryByTestId("allowance-lock")).toBeNull(),
    );
    expect(screen.getByTestId("create-exercise")).toBeTruthy();
    expect(screen.getByTestId("allowance-counter-count")).toHaveTextContent("2/3");
    expect(Date.now()).toBe(NOW_MS);
  });
});

// ─── 2. The kill-switch ──────────────────────────────────────────────────────

describe("with enforcement off", () => {
  it("renders no lock and no counter, even for a member the server has at the cap", async () => {
    setEntitlementsToken(MEMBER_1);
    const screen = render(<GatedScreen />);

    await nextRequest(1);
    await act(async () => {
      requests[0]!.settle(UNENFORCED_AT_CAP);
    });

    // Nothing tier-aware exists on the screen: no lock, no counter, no badge.
    await waitFor(() =>
      expect(screen.queryByTestId("create-exercise")).toBeTruthy(),
    );
    expect(screen.queryByTestId("allowance-lock")).toBeNull();
    expect(screen.queryByTestId("allowance-counter")).toBeNull();
    expect(screen.queryByTestId("allowance-counter-count")).toBeNull();
    expect(screen.queryByText("Plus")).toBeNull();
  });

  it("renders nothing while the snapshot is unknown either — a blip locks nobody", async () => {
    setEntitlementsToken(MEMBER_1);
    const screen = render(<GatedScreen />);

    await nextRequest(1);
    // The request is still open: the client knows nothing, and a UI lock is
    // explanatory, so it fails OPEN. The route refuses either way.
    expect(screen.queryByTestId("allowance-lock")).toBeNull();
    expect(screen.queryByTestId("allowance-counter")).toBeNull();
    expect(screen.getByTestId("create-exercise")).toBeTruthy();

    await act(async () => {
      requests[0]!.settle(AT_CAP);
    });
  });
});

// ─── 3. Two members, one device ──────────────────────────────────────────────

function SessionScreen() {
  const { token, logout, setToken } = useAuth();
  return (
    <View>
      <Text testID="session">{token ?? "none"}</Text>
      <Pressable testID="sign-out" onPress={() => void logout()}>
        <Text>Sign out</Text>
      </Pressable>
      <Pressable testID="sign-in-member-2" onPress={() => void setToken(MEMBER_2)}>
        <Text>Sign in</Text>
      </Pressable>
      <GatedScreen />
    </View>
  );
}

describe("signing out and in as another member", () => {
  it("never shows the first member's plan", async () => {
    const tokenStore = createMemoryTokenStore(MEMBER_1);
    // `/api/auth/me` (and the sign-out POSTs) answer instantly; only the
    // entitlements read is held open, because that is the one under test.
    const authFetch = jest.fn(async (url: string) => {
      const id = String(url).includes("/api/auth/me")
        ? { user: { _id: "member-1", email: "one@example.test" } }
        : { ok: true };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(id),
      } as unknown as Response;
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider
        store={tokenStore}
        fetchImpl={authFetch as unknown as typeof fetch}
        now={() => NOW_MS}
      >
        {children}
      </AuthProvider>
    );

    const screen = render(<SessionScreen />, { wrapper });

    await waitFor(() => expect(screen.getByTestId("session")).toHaveTextContent(MEMBER_1));
    await nextRequest(1);
    expect(requests[0]!.token).toBe(MEMBER_1);
    await act(async () => {
      requests[0]!.settle(AT_CAP);
    });
    await waitFor(() => expect(screen.getByTestId("allowance-lock")).toBeTruthy());

    // Sign out. The snapshot dies with the session — before any network call,
    // and whether or not one succeeds.
    await act(async () => {
      fireEvent.press(screen.getByTestId("sign-out"));
    });
    await waitFor(() => expect(screen.getByTestId("session")).toHaveTextContent("none"));
    expect(screen.queryByTestId("allowance-lock")).toBeNull();
    expect(screen.queryByTestId("allowance-counter")).toBeNull();

    // Member 2 signs in on the same device. Until their own answer lands the
    // app knows nothing about anybody's plan — it must never paint member 1's.
    await act(async () => {
      fireEvent.press(screen.getByTestId("sign-in-member-2"));
    });
    await waitFor(() => expect(screen.getByTestId("session")).toHaveTextContent(MEMBER_2));
    expect(screen.queryByTestId("allowance-lock")).toBeNull();

    await nextRequest(2);
    expect(requests[1]!.token).toBe(MEMBER_2);
    await act(async () => {
      requests[1]!.settle(PLUS_MEMBER);
    });

    // Plus, uncapped: no lock and no meter, and nothing of member 1's survived.
    await waitFor(() => expect(screen.getByTestId("create-exercise")).toBeTruthy());
    expect(screen.queryByTestId("allowance-lock")).toBeNull();
    expect(screen.queryByTestId("allowance-counter")).toBeNull();
  });

  it("discards member 1's answer when it lands after member 2 signed in", async () => {
    setEntitlementsToken(MEMBER_1);
    const screen = render(<GatedScreen />);
    await nextRequest(1);

    // The switch happens while member 1's read is still on the wire.
    await act(async () => {
      setEntitlementsToken(MEMBER_2);
    });
    await act(async () => {
      requests[0]!.settle(AT_CAP);
    });

    // It is not stale data, it is somebody else's plan.
    expect(screen.queryByTestId("allowance-lock")).toBeNull();
    expect(screen.queryByTestId("allowance-counter")).toBeNull();
  });
});

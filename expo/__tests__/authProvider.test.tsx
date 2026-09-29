/**
 * The session, end to end, against a stubbed server.
 *
 * Every assertion here is one of the four things that were broken: a saved
 * session did not survive a relaunch, an offline launch signed the member out,
 * the rolled 30-day token was thrown away, and a 401 did nothing anywhere.
 *
 * The fetch is stubbed rather than `apiFetch` mocked, so the real client runs:
 * the status → ApiError mapping is part of what is under test.
 */
import type { ReactNode } from "react";
import { Text } from "react-native";
import { act, render, renderHook, waitFor } from "@testing-library/react-native";
import { z } from "zod";
import { ApiError } from "@become/api-client";
import {
  AuthProvider,
  signOutMessage,
  type AuthProviderProps,
} from "@/lib/auth/AuthProvider";
import { useAuth } from "@/lib/auth/useAuth";
import { reportRequestError } from "@/lib/auth/unauthorized";
import { useFetch } from "@/lib/hooks/useFetch";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";

const NOW_MS = Date.UTC(2026, 8, 29, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

/** A JWT whose payload is real enough for the local `exp` check to read. */
function makeJwt(expiresAtMs: number, marker = "a"): string {
  const payload = Buffer.from(
    JSON.stringify({ userId: "u1", marker, exp: Math.floor(expiresAtMs / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature-${marker}`;
}

const FRESH_JWT = makeJwt(NOW_MS + 30 * DAY_MS, "fresh");
const ROLLED_JWT = makeJwt(NOW_MS + 30 * DAY_MS, "rolled");
const STALE_JWT = makeJwt(NOW_MS - 1000, "stale");

const USER = { _id: "u1", email: "jon@example.com", name: "Jon" };

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function trackedStore(initial: string | null) {
  const inner = createMemoryTokenStore(initial);
  return {
    get: jest.fn(() => inner.get()),
    set: jest.fn((value: string) => inner.set(value)),
    clear: jest.fn(() => inner.clear()),
  };
}

type Store = ReturnType<typeof trackedStore>;

function renderAuth(
  store: Store,
  fetchImpl: jest.Mock,
  extra: Partial<AuthProviderProps> = {},
) {
  return renderHook(() => useAuth(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AuthProvider
        store={store}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        now={() => NOW_MS}
        {...extra}
      >
        {children}
      </AuthProvider>
    ),
  });
}

describe("AuthProvider — launch with a saved session", () => {
  it("signs the member in and STORES the token /api/auth/me returned", async () => {
    const store = trackedStore(FRESH_JWT);
    const fetchImpl = jest.fn(async () =>
      jsonResponse(200, { user: USER, token: ROLLED_JWT }),
    );

    const { result } = renderAuth(store, fetchImpl);

    await waitFor(() => expect(result.current.status).toBe("signed-in"));
    await waitFor(() => expect(result.current.user).toEqual(USER));

    // The sliding session: what the server minted is what the phone keeps.
    expect(result.current.token).toBe(ROLLED_JWT);
    expect(await store.get()).toBe(ROLLED_JWT);
    expect(store.set).toHaveBeenCalledWith(ROLLED_JWT);

    // …and it was presented with the token it had, against the real backend.
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("https://become.redbtn.io/api/auth/me");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FRESH_JWT}`,
    );
  });

  it("keeps the member signed in when the network is unreachable", async () => {
    const store = trackedStore(FRESH_JWT);
    const fetchImpl = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });

    const { result } = renderAuth(store, fetchImpl);

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Airplane mode is not a sign-out.
    expect(result.current.status).toBe("signed-in");
    expect(result.current.isAuthed).toBe(true);
    expect(result.current.token).toBe(FRESH_JWT);
    expect(store.clear).not.toHaveBeenCalled();
    expect(await store.get()).toBe(FRESH_JWT);
  });

  it("keeps the member signed in when the server 500s", async () => {
    const store = trackedStore(FRESH_JWT);
    const fetchImpl = jest.fn(async () =>
      jsonResponse(500, { message: "Server error" }),
    );

    const { result } = renderAuth(store, fetchImpl);

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe("signed-in");
    expect(store.clear).not.toHaveBeenCalled();
  });

  it("signs out on 401 and says the session ended", async () => {
    const store = trackedStore(FRESH_JWT);
    const fetchImpl = jest.fn(async () =>
      jsonResponse(401, { message: "Unauthorized" }),
    );

    const { result } = renderAuth(store, fetchImpl);

    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.signedOutReason).toBe("unauthorized");
    expect(signOutMessage(result.current.signedOutReason)).toBe(
      "Your session ended. Please sign in again.",
    );
    expect(await store.get()).toBeNull();
  });

  it("signs out on 404 — the user row is gone", async () => {
    const store = trackedStore(FRESH_JWT);
    const fetchImpl = jest.fn(async () =>
      jsonResponse(404, { message: "Not found" }),
    );

    const { result } = renderAuth(store, fetchImpl);

    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    expect(result.current.signedOutReason).toBe("not-found");
    expect(await store.get()).toBeNull();
  });

  it("signs out on an expired token without sending anything", async () => {
    const store = trackedStore(STALE_JWT);
    const fetchImpl = jest.fn(async () => jsonResponse(200, { user: USER }));

    const { result } = renderAuth(store, fetchImpl);

    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.current.signedOutReason).toBe("expired");
    expect(await store.get()).toBeNull();
  });

  it("shows no message to someone who was simply never signed in", async () => {
    const store = trackedStore(null);
    const fetchImpl = jest.fn(async () => jsonResponse(200, { user: USER }));

    const { result } = renderAuth(store, fetchImpl);

    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.current.signedOutReason).toBeNull();
    expect(signOutMessage(result.current.signedOutReason)).toBeNull();
  });
});

describe("AuthProvider — signing in", () => {
  it("setToken persists the JWT, then the one /api/auth/me rolls", async () => {
    const store = trackedStore(null);
    const fetchImpl = jest.fn(async () =>
      jsonResponse(200, { user: USER, token: ROLLED_JWT }),
    );

    const { result } = renderAuth(store, fetchImpl);
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    await act(async () => {
      await result.current.setToken(FRESH_JWT);
    });

    expect(result.current.status).toBe("signed-in");
    expect(result.current.user).toEqual(USER);
    expect(result.current.token).toBe(ROLLED_JWT);
    expect(await store.get()).toBe(ROLLED_JWT);
  });

  it("a sign-in with no network still signs the member in", async () => {
    const store = trackedStore(null);
    const fetchImpl = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });

    const { result } = renderAuth(store, fetchImpl);
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    await act(async () => {
      await result.current.setToken(FRESH_JWT);
    });

    expect(result.current.status).toBe("signed-in");
    expect(await store.get()).toBe(FRESH_JWT);
  });

  it("signOut('member') clears the session and apologises for nothing", async () => {
    const store = trackedStore(FRESH_JWT);
    const fetchImpl = jest.fn(async () => jsonResponse(200, { user: USER }));

    const { result } = renderAuth(store, fetchImpl);
    await waitFor(() => expect(result.current.status).toBe("signed-in"));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.status).toBe("signed-out");
    expect(result.current.signedOutReason).toBeNull();
    expect(await store.get()).toBeNull();
  });
});

describe("a 401 from any request", () => {
  it("signs the member out ONCE, however many requests fail", async () => {
    const store = trackedStore(FRESH_JWT);
    const fetchImpl = jest.fn(async () => jsonResponse(200, { user: USER }));

    const { result } = renderAuth(store, fetchImpl);
    await waitFor(() => expect(result.current.status).toBe("signed-in"));
    store.clear.mockClear();

    // Three screens' requests coming back 401 in the same tick.
    await act(async () => {
      reportRequestError(new ApiError(401, { message: "Unauthorized" }));
      reportRequestError(new ApiError(401, { message: "Unauthorized" }));
      reportRequestError(new ApiError(401, { message: "Unauthorized" }));
    });

    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(result.current.signedOutReason).toBe("unauthorized");
  });

  it("ignores a 403 (a plan gate) and a 500", async () => {
    const store = trackedStore(FRESH_JWT);
    const fetchImpl = jest.fn(async () => jsonResponse(200, { user: USER }));

    const { result } = renderAuth(store, fetchImpl);
    await waitFor(() => expect(result.current.status).toBe("signed-in"));

    await act(async () => {
      reportRequestError(new ApiError(403, { requiresTier: "plus" }));
      reportRequestError(new ApiError(500, { message: "boom" }));
      reportRequestError(new TypeError("Network request failed"));
    });

    expect(result.current.status).toBe("signed-in");
    expect(store.clear).not.toHaveBeenCalled();
  });

  it("ends the session when a screen's own fetch is refused", async () => {
    const store = trackedStore(FRESH_JWT);
    const meFetch = jest.fn(async () => jsonResponse(200, { user: USER }));
    const screenFetch = jest.fn(async () =>
      jsonResponse(401, { message: "Unauthorized" }),
    );

    function Screen() {
      const auth = useAuth();
      useFetch("/api/streak", z.object({}).passthrough(), {
        baseUrl: "https://become.redbtn.io",
        getToken: () => auth.token ?? undefined,
        fetchImpl: screenFetch as unknown as typeof fetch,
      });
      return <Text testID="status">{auth.status}</Text>;
    }

    const view = render(
      <AuthProvider
        store={store}
        fetchImpl={meFetch as unknown as typeof fetch}
        now={() => NOW_MS}
      >
        <Screen />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(view.getByTestId("status")).toHaveTextContent("signed-out"),
    );
    expect(await store.get()).toBeNull();
  });
});

describe("useAuth outside the provider", () => {
  it("throws rather than quietly handing back a second session", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
    spy.mockRestore();
  });
});

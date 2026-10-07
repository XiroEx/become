/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

/**
 * NP-337: Settings > Nutrition Planning stayed disabled after a change —
 * `saving` never cleared because it awaited `profile.refetch()`, and a
 * refetch that never settles left both cards locked with no way to change
 * the choice back — and reopening Settings showed the stale cached value
 * instead of what the server actually held.
 */

function makeJwt(expiresAtMs: number): string {
  const payload = Buffer.from(
    JSON.stringify({ userId: "u1", exp: Math.floor(expiresAtMs / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
}

let mockStoredJwt: string | null = makeJwt(Date.now() + 86400000);
jest.mock("@/lib/auth/secureStoreToken", () => {
  const actual = jest.requireActual("@/lib/auth/secureStoreToken");
  return {
    ...actual,
    sessionStore: {
      async get() {
        return mockStoredJwt;
      },
      async set(v: string) {
        mockStoredJwt = v;
      },
      async clear() {
        mockStoredJwt = null;
      },
    },
  };
});

import { AuthProvider } from "@/lib/auth/AuthProvider";
import { NutritionPlanningSection } from "@/components/settings/NutritionPlanningSection";
import { setCacheMemberId, writeCache } from "@/lib/cache/lastKnown";
/* eslint-enable import/first */

function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body ?? {},
    text: async () => JSON.stringify(body ?? {}),
  } as Response;
}

function renderSection() {
  return render(
    <AuthProvider fetchImpl={globalThis.fetch}>
      <NutritionPlanningSection />
    </AuthProvider>,
  );
}

function selected(el: { props: { accessibilityState?: { selected?: boolean } } }) {
  return el.props.accessibilityState?.selected === true;
}

function disabled(el: { props: { accessibilityState?: { disabled?: boolean } } }) {
  return el.props.accessibilityState?.disabled === true;
}

describe("NutritionPlanningSection: saving releases without the refetch settling (NP-337)", () => {
  beforeEach(() => {
    mockStoredJwt = makeJwt(Date.now() + 86400000);
  });

  it("clears `saving` in finally even when the post-save refetch never resolves, so the choice can be changed back", async () => {
    let profileGets = 0;
    let serverPlanPromoteMode = "manual";
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) {
        return jsonResponse(200, { user: { _id: "u1", name: "Alex", email: "alex@example.com" } });
      }
      if (url.includes("/api/profile") && init?.method === "PATCH") {
        const body = JSON.parse(init.body as string);
        if (body.profile?.planPromoteMode) serverPlanPromoteMode = body.profile.planPromoteMode;
        return jsonResponse(200, {
          name: "Alex",
          email: "alex@example.com",
          profile: { planPromoteMode: serverPlanPromoteMode },
        });
      }
      if (url.includes("/api/profile")) {
        profileGets += 1;
        if (profileGets === 1) {
          return jsonResponse(200, {
            name: "Alex",
            email: "alex@example.com",
            profile: { planPromoteMode: serverPlanPromoteMode },
          });
        }
        // Every GET after the first is the post-save refetch — and it never
        // settles. That used to leave both cards disabled forever.
        return new Promise(() => {
          /* never resolves */
        });
      }
      return jsonResponse(200, {});
    }) as typeof fetch;

    const { getByTestId } = renderSection();

    await waitFor(() => {
      expect(selected(getByTestId("settings-nutrition-planning-manual"))).toBe(true);
    });

    await act(async () => {
      fireEvent.press(getByTestId("settings-nutrition-planning-auto"));
    });

    await waitFor(() => {
      expect(selected(getByTestId("settings-nutrition-planning-auto"))).toBe(true);
    });

    // The actual bug: both cards re-enable even though the refetch this
    // save triggered is still hanging.
    await waitFor(() => {
      expect(disabled(getByTestId("settings-nutrition-planning-manual"))).toBe(false);
    });
    expect(disabled(getByTestId("settings-nutrition-planning-auto"))).toBe(false);

    // And because it released, the choice CAN be changed back.
    await act(async () => {
      fireEvent.press(getByTestId("settings-nutrition-planning-manual"));
    });
    await waitFor(() => {
      expect(selected(getByTestId("settings-nutrition-planning-manual"))).toBe(true);
    });
    expect(serverPlanPromoteMode).toBe("manual");
  });
});

describe("NutritionPlanningSection: seeds from fresh data, not the cache (NP-337)", () => {
  beforeEach(async () => {
    mockStoredJwt = makeJwt(Date.now() + 86400000);
    setCacheMemberId("u1");
  });

  it("does not adopt a stale cached value — it waits for the real network answer", async () => {
    // Last-known cache says "auto" (stale — from before the member, or the
    // web, set it back to manual).
    await writeCache("/api/profile", { profile: { planPromoteMode: "auto" } }, "u1");

    const resolvers: ((value: Response) => void)[] = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) {
        return jsonResponse(200, { user: { _id: "u1", name: "Alex", email: "alex@example.com" } });
      }
      if (url.includes("/api/profile")) {
        return new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        });
      }
      return jsonResponse(200, {});
    }) as typeof fetch;

    const { getByTestId } = renderSection();

    // The component's own default ("manual"), never the stale cached
    // "auto" — the fetch has not answered yet.
    await waitFor(() => {
      expect(getByTestId("settings-nutrition-planning-manual")).toBeTruthy();
    });
    expect(selected(getByTestId("settings-nutrition-planning-manual"))).toBe(true);

    // The profile fetch only fires once the session resolves and `skip`
    // flips — wait for it to actually be in flight before answering it.
    await waitFor(() => {
      expect(resolvers.length).toBeGreaterThan(0);
    });

    // The server's real (fresh) answer — adopted once it arrives.
    await act(async () => {
      for (const r of resolvers) {
        r(
          jsonResponse(200, {
            name: "Alex",
            email: "alex@example.com",
            profile: { planPromoteMode: "auto" },
          }),
        );
      }
    });

    await waitFor(() => {
      expect(selected(getByTestId("settings-nutrition-planning-auto"))).toBe(true);
    });
  });
});

/**
 * ─── The app-icon badge, natively (NP-067) ──────────────────────────────────
 *
 * The web draws this with the Badging API (`webapp/lib/widgets/badge.ts`,
 * `webapp/components/AppBadgeSync.tsx`); native draws it with
 * `Notifications.setBadgeCountAsync`, which sets the number on a real iPhone's
 * icon and on Android launchers that show badges.
 *
 * The badge equals `WidgetFeed.badgeCount` — the number the widgets and the
 * daily glance use — read from `GET /api/widgets/summary?tz=` at launch and
 * on each foreground (throttled to one request a minute), and cleared at zero
 * and on sign-out / account deletion.
 */

import { render } from "@testing-library/react-native";
import type { AppStateStatus } from "react-native";
import {
  APP_BADGE_MIN_REFRESH_MS,
  applyAppBadge,
  clearAppBadge,
  refreshAppBadge,
  sanitizeBadgeCount,
} from "@/lib/widgets/badge";
import { AppBadgeSync } from "@/components/widgets/AppBadgeSync";

function feedResponse(badgeCount: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ badgeCount }),
  } as unknown as Response;
}

describe("sanitizeBadgeCount", () => {
  it("passes a positive whole count through", () => {
    expect(sanitizeBadgeCount(3)).toBe(3);
  });

  it("floors a fractional count rather than passing it to the OS", () => {
    expect(sanitizeBadgeCount(2.7)).toBe(2);
  });

  it("reads nonsense as nothing owed, which clears", () => {
    expect(sanitizeBadgeCount(-4)).toBe(0);
    expect(sanitizeBadgeCount(Number.NaN)).toBe(0);
    expect(sanitizeBadgeCount(undefined)).toBe(0);
    expect(sanitizeBadgeCount("2")).toBe(0);
  });
});

describe("applyAppBadge — drawing it", () => {
  it("sets a positive count", async () => {
    const setBadge = jest.fn(async () => {});
    expect(await applyAppBadge(2, setBadge)).toBe(true);
    expect(setBadge).toHaveBeenCalledWith(2);
  });

  it("(e015c81c) CLEARS at zero rather than drawing a zero", async () => {
    // A finished day goes clean: the icon must show nothing, not a "0".
    const setBadge = jest.fn(async () => {});
    expect(await applyAppBadge(0, setBadge)).toBe(true);
    expect(setBadge).toHaveBeenCalledWith(0);
  });

  it("clamps nonsense instead of passing it to the platform", async () => {
    const setBadge = jest.fn(async () => {});
    await applyAppBadge(-4, setBadge);
    await applyAppBadge(Number.NaN, setBadge);
    await applyAppBadge(2.7, setBadge);
    expect(setBadge).toHaveBeenNthCalledWith(1, 0);
    expect(setBadge).toHaveBeenNthCalledWith(2, 0);
    expect(setBadge).toHaveBeenNthCalledWith(3, 2);
  });

  it("a refused badge call is a false, never a throw", async () => {
    const setBadge = jest.fn(async () => {
      throw new Error("not allowed");
    });
    expect(await applyAppBadge(3, setBadge)).toBe(false);
  });
});

describe("clearAppBadge", () => {
  it("(e015c81d) clears the icon and never throws", async () => {
    const setBadge = jest.fn(async () => {});
    await expect(clearAppBadge(setBadge)).resolves.toBeUndefined();
    expect(setBadge).toHaveBeenCalledWith(0);
  });

  it("a refused clear is swallowed — sign-out may never fail on decoration", async () => {
    const setBadge = jest.fn(async () => {
      throw new Error("no native module");
    });
    await expect(clearAppBadge(setBadge)).resolves.toBeUndefined();
  });
});

describe("refreshAppBadge — reading the feed", () => {
  const BASE = "https://become.test";

  it("(e015c81c) draws the feed's badgeCount with the session and the device offset", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return feedResponse(3);
    }) as unknown as typeof fetch;
    const setBadge = jest.fn(async () => {});

    const result = await refreshAppBadge("session.jwt", {
      baseUrl: BASE,
      fetchImpl,
      tzOffsetMinutes: 240,
      setBadge,
    });

    expect(result).toBe("applied");
    // `tz` is minutes WEST of UTC — the one wire format this client uses.
    expect(seen[0]?.url).toBe(`${BASE}/api/widgets/summary?tz=240`);
    expect(seen[0]?.init?.method).toBe("GET");
    expect(
      (seen[0]?.init?.headers as Record<string, string>)?.Authorization,
    ).toBe("Bearer session.jwt");
    expect(setBadge).toHaveBeenCalledWith(3);
  });

  it("(e015c81c) clears the icon when the feed says the day is done", async () => {
    const fetchImpl = jest.fn(async () =>
      feedResponse(0),
    ) as unknown as typeof fetch;
    const setBadge = jest.fn(async () => {});

    const result = await refreshAppBadge("session.jwt", {
      baseUrl: BASE,
      fetchImpl,
      tzOffsetMinutes: 240,
      setBadge,
    });

    expect(result).toBe("cleared");
    expect(setBadge).toHaveBeenCalledWith(0);
  });

  it("sends no request without a session", async () => {
    const fetchImpl = jest.fn(async () =>
      feedResponse(2),
    ) as unknown as typeof fetch;
    const setBadge = jest.fn(async () => {});

    expect(
      await refreshAppBadge(null, { baseUrl: BASE, fetchImpl, setBadge }),
    ).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(setBadge).not.toHaveBeenCalled();
  });

  it("keeps the last value when the network is unreachable", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const setBadge = jest.fn(async () => {});

    expect(
      await refreshAppBadge("session.jwt", {
        baseUrl: BASE,
        fetchImpl,
        setBadge,
      }),
    ).toBe("unreachable");
    expect(setBadge).not.toHaveBeenCalled();
  });

  it("keeps the last value on a refusal — a 401 is not a finished day", async () => {
    const fetchImpl = jest.fn(async () =>
      feedResponse({ error: "Unauthorized" }, 401),
    ) as unknown as typeof fetch;
    const setBadge = jest.fn(async () => {});

    expect(
      await refreshAppBadge("session.jwt", {
        baseUrl: BASE,
        fetchImpl,
        setBadge,
      }),
    ).toBe("unreachable");
    expect(setBadge).not.toHaveBeenCalled();
  });

  it("keeps the last value when the body carries no number", async () => {
    const fetchImpl = jest.fn(async () =>
      feedResponse("three"),
    ) as unknown as typeof fetch;
    const setBadge = jest.fn(async () => {});

    expect(
      await refreshAppBadge("session.jwt", {
        baseUrl: BASE,
        fetchImpl,
        setBadge,
      }),
    ).toBe("unreachable");
    expect(setBadge).not.toHaveBeenCalled();
  });

  it("never throws — a badge may not fail a launch", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(
      refreshAppBadge("session.jwt", { baseUrl: BASE, fetchImpl }),
    ).resolves.toBe("unreachable");
  });
});

const mockAuth = {
  status: "loading" as "loading" | "signed-in" | "signed-out",
  token: null as string | null,
};
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    status: mockAuth.status,
    token: mockAuth.token,
    user: null,
    loading: mockAuth.status === "loading",
    isAuthed: mockAuth.status === "signed-in",
    signedOutReason: null,
    setToken: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
    logout: jest.fn(),
  }),
}));

describe("AppBadgeSync", () => {
  beforeEach(() => {
    mockAuth.status = "loading";
    mockAuth.token = null;
    jest.useRealTimers();
  });

  it("renders nothing", () => {
    mockAuth.status = "signed-in";
    mockAuth.token = "jwt";
    const refresh = jest.fn(async () => "applied" as const);
    const { toJSON } = render(
      <AppBadgeSync
        refresh={refresh}
        subscribeToAppState={() => () => {}}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it("syncs at launch when signed in", async () => {
    mockAuth.status = "signed-in";
    mockAuth.token = "jwt";
    const refresh = jest.fn(async () => "applied" as const);
    render(
      <AppBadgeSync refresh={refresh} subscribeToAppState={() => () => {}} />,
    );
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledWith("jwt");
  });

  it("does nothing at launch without a session", async () => {
    mockAuth.status = "signed-out";
    const refresh = jest.fn(async () => "applied" as const);
    render(
      <AppBadgeSync refresh={refresh} subscribeToAppState={() => () => {}} />,
    );
    await Promise.resolve();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("syncs again on each return to the foreground", async () => {
    mockAuth.status = "signed-in";
    mockAuth.token = "jwt";
    const holder: { listener: ((s: AppStateStatus) => void) | null } = {
      listener: null,
    };
    const refresh = jest.fn(async () => "applied" as const);
    render(
      <AppBadgeSync
        refresh={refresh}
        subscribeToAppState={(fn) => {
          holder.listener = fn;
          return () => {};
        }}
      />,
    );
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);

    holder.listener?.("background");
    expect(refresh).toHaveBeenCalledTimes(1);

    // The minute throttle gates foregrounds: move past it, then come back.
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValue(Date.now() + APP_BADGE_MIN_REFRESH_MS + 1);
    holder.listener?.("active");
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it("throttles foregrounds to one request a minute", async () => {
    mockAuth.status = "signed-in";
    mockAuth.token = "jwt";
    const holder: { listener: ((s: AppStateStatus) => void) | null } = {
      listener: null,
    };
    const refresh = jest.fn(async () => "applied" as const);
    render(
      <AppBadgeSync
        refresh={refresh}
        subscribeToAppState={(fn) => {
          holder.listener = fn;
          return () => {};
        }}
      />,
    );
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);

    holder.listener?.("active");
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a failed refresh does not consume the minute — the next foreground retries", async () => {
    mockAuth.status = "signed-in";
    mockAuth.token = "jwt";
    const holder: { listener: ((s: AppStateStatus) => void) | null } = {
      listener: null,
    };
    const refresh = jest.fn(async () => "unreachable" as const);
    render(
      <AppBadgeSync
        refresh={refresh}
        subscribeToAppState={(fn) => {
          holder.listener = fn;
          return () => {};
        }}
      />,
    );
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);

    holder.listener?.("active");
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("a rejected refresh never reaches the tree", async () => {
    mockAuth.status = "signed-in";
    mockAuth.token = "jwt";
    const refresh = jest.fn(async () => {
      throw new Error("badge refresh exploded");
    });
    expect(() =>
      render(
        <AppBadgeSync
          refresh={refresh}
          subscribeToAppState={() => () => {}}
        />,
      ),
    ).not.toThrow();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", () => {
    mockAuth.status = "signed-in";
    mockAuth.token = "jwt";
    const refresh = jest.fn(async () => "applied" as const);
    const unsubscribe = jest.fn();
    const subscribeToAppState = jest.fn(() => unsubscribe);
    const { unmount } = render(
      <AppBadgeSync refresh={refresh} subscribeToAppState={subscribeToAppState} />,
    );
    expect(subscribeToAppState).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

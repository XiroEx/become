/* eslint-disable import/first */
/**
 * ONE HELPER THAT ARRIVES SIGNED IN.
 *
 * Tier-3 surfaces open the web in a browser with no app session, so the member
 * lands on the sign-in page. `openWebSignedIn(path)` trades the session the app
 * is holding for a one-time code and opens the hand-off URL instead.
 *
 * What is pinned here is the behaviour a member actually feels:
 *
 *   • the happy path opens `<base>/auth/handoff?code=…`, never a bare path;
 *   • a network error, a refusal, or no session at all still OPENS THE SCREEN —
 *     signed out, exactly as today — because a Tier-3 button that does nothing
 *     is worse than one that asks you to sign in;
 *   • the code is minted with the member's Bearer token and the target path;
 *   • only Become paths are opened as Become pages: an absolute URL, another
 *     origin, or a path carrying its own query is refused outright and nothing
 *     is opened.
 *
 * The real SecureStore is swapped for an in-memory fake so jest never touches
 * the native module; the browser launcher is injected everywhere.
 */
jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    async getItemAsync(key: string): Promise<string | null> {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItemAsync(key: string, value: string): Promise<void> {
      mem.set(key, value);
    },
    async deleteItemAsync(key: string): Promise<void> {
      mem.delete(key);
    },
    __reset(): void {
      mem.clear();
    },
  };
});

import * as SecureStore from "expo-secure-store";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  createMemoryTokenStore,
  sessionStore,
} from "@/lib/auth/secureStoreToken";
import {
  HANDOFF_MINT_PATH,
  HANDOFF_REDEEM_PATH,
  isBecomeWebPath,
  openWebSignedIn,
} from "@/lib/web/openWebSignedIn";

const fake = SecureStore as unknown as { __reset: () => void };

const BASE = "https://become.test";
const JWT = "header.payload.signature";
const PATH = "/dashboard/programs/p1/edit";

/** A launcher that records what it was asked to open. */
function recordingLauncher() {
  const opened: string[] = [];
  return {
    opened,
    launcher: async (url: string) => {
      opened.push(url);
    },
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  } as unknown as Response;
}

beforeEach(() => {
  fake.__reset();
});

describe("openWebSignedIn", () => {
  it("mints a code and opens the hand-off URL", async () => {
    const { opened, launcher } = recordingLauncher();
    const calls: [string, RequestInit | undefined][] = [];
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return jsonResponse({ code: "abc123", path: PATH, expiresInSeconds: 60 });
    }) as unknown as typeof fetch;

    const result = await openWebSignedIn(PATH, {
      baseUrl: BASE,
      store: createMemoryTokenStore(JWT),
      fetchImpl,
      launcher,
    });

    expect(result).toBe("signed-in");
    expect(opened).toEqual([`${BASE}${HANDOFF_REDEEM_PATH}?code=abc123`]);

    // Minted with this member's session, for this one path.
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0] as [string, RequestInit | undefined];
    expect(url).toBe(`${BASE}${HANDOFF_MINT_PATH}`);
    expect(init?.method).toBe("POST");
    expect(
      (init?.headers as Record<string, string>)["Authorization"],
    ).toBe(`Bearer ${JWT}`);
    expect(JSON.parse(String(init?.body))).toEqual({ path: PATH });
  });

  it("URL-encodes the code it was handed", async () => {
    const { opened, launcher } = recordingLauncher();
    const fetchImpl = (async () =>
      jsonResponse({ code: "a+b/c=" })) as unknown as typeof fetch;

    await openWebSignedIn("/dashboard", {
      baseUrl: BASE,
      store: createMemoryTokenStore(JWT),
      fetchImpl,
      launcher,
    });

    expect(opened).toEqual([`${BASE}${HANDOFF_REDEEM_PATH}?code=a%2Bb%2Fc%3D`]);
  });

  it("falls back to the plain URL on a network error", async () => {
    const { opened, launcher } = recordingLauncher();
    const fetchImpl = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;

    const result = await openWebSignedIn(PATH, {
      baseUrl: BASE,
      store: createMemoryTokenStore(JWT),
      fetchImpl,
      launcher,
    });

    expect(result).toBe("plain");
    expect(opened).toEqual([`${BASE}${PATH}`]);
  });

  it("falls back to the plain URL when the server refuses to mint", async () => {
    const { opened, launcher } = recordingLauncher();
    for (const res of [
      jsonResponse({ error: "path_not_allowed" }, false, 400),
      jsonResponse({ error: "unauthorized" }, false, 401),
      jsonResponse({}, true, 200), // 200 with no code
    ]) {
      opened.length = 0;
      const result = await openWebSignedIn(PATH, {
        baseUrl: BASE,
        store: createMemoryTokenStore(JWT),
        fetchImpl: (async () => res) as unknown as typeof fetch,
        launcher,
      });
      expect(result).toBe("plain");
      expect(opened).toEqual([`${BASE}${PATH}`]);
    }
  });

  it("opens the plain URL without asking when there is no session", async () => {
    const { opened, launcher } = recordingLauncher();
    const fetchImpl = jest.fn() as unknown as typeof fetch;

    const result = await openWebSignedIn(PATH, {
      baseUrl: BASE,
      store: createMemoryTokenStore(null),
      fetchImpl,
      launcher,
    });

    expect(result).toBe("plain");
    expect(opened).toEqual([`${BASE}${PATH}`]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads the session from the keychain when no store is injected", async () => {
    const { opened, launcher } = recordingLauncher();
    await sessionStore.set(JWT);
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["Authorization"]).toBe(
        `Bearer ${JWT}`,
      );
      return jsonResponse({ code: "from-keychain" });
    }) as unknown as typeof fetch;

    const result = await openWebSignedIn("/dashboard", {
      baseUrl: BASE,
      fetchImpl,
      launcher,
    });

    expect(result).toBe("signed-in");
    expect(opened).toEqual([
      `${BASE}${HANDOFF_REDEEM_PATH}?code=from-keychain`,
    ]);
  });

  it("defaults to the webapp base URL — only Become pages are opened", async () => {
    const { opened, launcher } = recordingLauncher();
    const fetchImpl = (async () =>
      jsonResponse({ code: "zzz" })) as unknown as typeof fetch;

    await openWebSignedIn("/dashboard", {
      store: createMemoryTokenStore(JWT),
      fetchImpl,
      launcher,
    });

    expect(String(opened[0]).startsWith(`${WEBAPP_BASE_URL}/`)).toBe(true);
  });

  it("refuses anything that is not a Become path, and opens nothing", async () => {
    const { opened, launcher } = recordingLauncher();
    const fetchImpl = jest.fn() as unknown as typeof fetch;

    for (const bad of [
      "https://evil.example/dashboard",
      "//evil.example/dashboard",
      "/\\evil.example/dashboard",
      "dashboard/programs/new",
      "/dashboard?next=https://evil.example",
      "/dashboard#token",
      "",
    ]) {
      const result = await openWebSignedIn(bad, {
        baseUrl: BASE,
        store: createMemoryTokenStore(JWT),
        fetchImpl,
        launcher,
      });
      expect(result).toBe("refused");
    }

    expect(opened).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("isBecomeWebPath", () => {
  it("accepts a plain path and refuses everything with an origin of its own", () => {
    expect(isBecomeWebPath("/dashboard/recipes/new")).toBe(true);
    expect(isBecomeWebPath("/dashboard")).toBe(true);
    expect(isBecomeWebPath("https://become.redbtn.io/dashboard")).toBe(false);
    expect(isBecomeWebPath("//become.redbtn.io/dashboard")).toBe(false);
    expect(isBecomeWebPath(undefined)).toBe(false);
    expect(isBecomeWebPath(42)).toBe(false);
  });
});

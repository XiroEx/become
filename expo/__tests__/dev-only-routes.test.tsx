/* eslint-disable import/first */
// THE SCREENS A STORE BUILD MUST NOT HAVE — opened, and watched to leave.
//
// Three routes shipped that no member should be able to reach:
//
//   `_stories`         the component gallery. Underscore is a Next.js habit;
//                      expo-router's ignore list is exactly `+api`, `+html`
//                      and `+native-intent`, so this was a LIVE route at
//                      `become://_stories`.
//   `admin/foods`      read-only admin list behind a CLIENT-side role check,
//   `admin/exercises`  which is a blocked screen, not an absent one — and its
//                      Edit link leaves for the browser anyway.
//
// So these are rendered through the REAL route tree (`test-support/appRoutes`)
// with `__DEV__` flipped to what a release bundle has, and the assertion is
// where the member ends up: Home.

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

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    __esModule: true,
    ...actual,
    apiFetch: jest.fn(async () => ({
      user: { _id: "u1", email: "jon@example.com" },
    })),
  };
});

import { renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import {
  appRouteMap,
  routeKeys,
  savedJwt,
  screenId,
} from "../test-support/appRoutes";
import { HOME_HREF, isDevBuild } from "@/lib/dev/devOnlyRoute";
/* eslint-enable import/first */

const fake = SecureStore as unknown as { __reset: () => void };

/** The three route files, and the testID each renders when it DOES render. */
const DEV_ONLY = [
  { url: "/_stories", key: "_stories", testID: "stories-screen" },
  {
    url: "/admin/foods",
    key: "(app)/admin/foods/index",
    testID: "admin-foods-route",
  },
  {
    url: "/admin/exercises",
    key: "(app)/admin/exercises/index",
    testID: "admin-exercises-route",
  },
];

const REAL = DEV_ONLY.map((r) => r.key);
const HOME = screenId("(app)/(tabs)/dashboard/index");

/** Signed in, because "lands on Home" is a claim about a member's app. */
async function renderAt(url: string): Promise<void> {
  await SecureStore.setItemAsync("become.session", savedJwt());
  renderRouter(appRouteMap({ real: REAL }) as never, { initialUrl: url });
}

const globals = globalThis as unknown as { __DEV__: boolean };

beforeEach(() => {
  fake.__reset();
  globals.__DEV__ = true;
});

afterEach(() => {
  globals.__DEV__ = true;
});

describe("the dev-only routes exist — that is the problem", () => {
  it("expo-router ignores only +api / +html / +native-intent, so _stories is a route", () => {
    // Pinned as a fact about the router, because the whole card rests on it:
    // the file is on disk, the map built from disk contains it, and the URL
    // below resolves. If a future SDK starts ignoring `_`-prefixed files this
    // fails and the guard can go.
    expect(routeKeys()).toContain("_stories");
    expect(Object.keys(appRouteMap())).toContain("_stories");
  });

  it("points Home at the dashboard tab, which is what the web calls /dashboard", () => {
    expect(HOME_HREF).toBe("/(tabs)/dashboard");
  });
});

describe("a production build", () => {
  beforeEach(() => {
    globals.__DEV__ = false;
  });

  it("reports itself as not a dev build", () => {
    expect(isDevBuild()).toBe(false);
  });

  it.each(DEV_ONLY)(
    "$url lands on Home, not on $testID",
    async ({ url, testID }) => {
      await renderAt(url);

      expect(await screen.findByTestId(HOME)).toBeTruthy();
      expect(screen.queryByTestId(testID)).toBeNull();
    },
  );

  it("leaves the member on Home rather than bouncing onward", async () => {
    await SecureStore.setItemAsync("become.session", savedJwt());
    const rendered = renderRouter(appRouteMap({ real: REAL }) as never, {
      initialUrl: "/_stories",
    });

    expect(await screen.findByTestId(HOME)).toBeTruthy();
    await waitFor(() => {
      expect(rendered.getPathname()).toBe("/dashboard");
    });
  });
});

describe("a development build", () => {
  it("reports itself as a dev build (jest runs with __DEV__ true)", () => {
    expect(isDevBuild()).toBe(true);
  });

  it.each(DEV_ONLY)("$url still opens $testID", async ({ url, testID }) => {
    await renderAt(url);

    expect(await screen.findByTestId(testID)).toBeTruthy();
    expect(screen.queryByTestId(HOME)).toBeNull();
  });
});

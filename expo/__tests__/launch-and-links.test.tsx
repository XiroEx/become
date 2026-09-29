/* eslint-disable import/first */
// WHERE A LAUNCH LANDS — and, just as important, where it does NOT.
//
// Two bugs are pinned here, both of them shipped:
//
//  1. `app/index.tsx` was the "Native scaffold online" probe. A member who
//     opened the app saw a flame and a slogan.
//  2. the cold-open gate in `app/_layout.tsx` ran on EVERY launch and
//     `router.replace`d its verdict. The flow is asynchronous, so a cold
//     start on `/verify?token=…` or `/account/restore?u=…&t=…` raced it and
//     lost: the linked screen mounted, the verdict landed, and sign-in
//     replaced it — with the magic-link token already spent.
//
// The shell now decides in one place that only exists on a launch with no
// link (`app/index.tsx`), so a link cannot be overruled by construction.

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

const mockApiFetch = jest.fn();
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: mockApiFetch };
});

import * as fs from "fs";
import * as path from "path";
import { waitFor, renderRouter, screen } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import {
  APP_DIR,
  appRouteMap,
  savedJwt,
  screenId,
} from "../test-support/appRoutes";
/* eslint-enable import/first */

const fake = SecureStore as unknown as { __reset: () => void };

/** The routes a launch has to be able to reach for real. */
const REAL_ROUTES = [
  "index",
  "(auth)/login",
  "(auth)/verify",
  "(auth)/account/restore",
];

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** What `GET /api/auth/me` answers. `null` = signed out is the caller's job. */
let meUser: Record<string, unknown> = { _id: "u1", email: "jon@example.com" };
/** Held open by the verify test so the race can be reproduced deliberately. */
let verifyResult: Promise<unknown> | null = null;

beforeEach(() => {
  fake.__reset();
  meUser = { _id: "u1", email: "jon@example.com" };
  verifyResult = null;
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (route: string) => {
    if (route === "/api/auth/verify-link") {
      return verifyResult ?? { token: savedJwt(), user: meUser };
    }
    return { user: meUser };
  });
});

describe("a cold start from a link keeps the link", () => {
  it("lands on /verify and spends the token there, never on sign-in", async () => {
    const pending = deferred<{ token: string; user: unknown }>();
    verifyResult = pending.promise;

    const rendered = renderRouter(appRouteMap({ real: REAL_ROUTES }) as never, {
      initialUrl: "/verify?token=abcdefgh12345678&mode=login",
    });

    // The linked screen, doing its job.
    expect(await screen.findByTestId("verify-screen")).toBeTruthy();
    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.some((c) => c[0] === "/api/auth/verify-link"),
      ).toBe(true);
    });
    const call = mockApiFetch.mock.calls.find(
      (c) => c[0] === "/api/auth/verify-link",
    );
    expect((call?.[2] as { body?: { token?: string } })?.body?.token).toBe(
      "abcdefgh12345678",
    );

    // THE REGRESSION: while the verify request is still in flight — exactly
    // the window the cold-open gate used to resolve in — the route is still
    // the one the app was opened on. No session is stored, so the old gate
    // would have replaced this with /login by now.
    expect(rendered.getPathname()).toBe("/verify");
    expect(screen.queryByTestId("login-screen")).toBeNull();

    // And when the server answers, the link finishes the job it was tapped
    // for: signed in, in the app.
    pending.resolve({ token: savedJwt(), user: meUser });
    await waitFor(() => {
      expect(
        screen.queryByTestId(screenId("(app)/(tabs)/dashboard/index")),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId("login-screen")).toBeNull();
  });

  it("lands on /account/restore with its button, and acts on nothing", async () => {
    const rendered = renderRouter(appRouteMap({ real: REAL_ROUTES }) as never, {
      initialUrl: "/account/restore?u=user-1&t=mac-token",
    });

    expect(await screen.findByTestId("restore-account-route")).toBeTruthy();
    // A button, not an effect — a mail scanner opens the link before a person
    // does, and the screen must still be there for the person.
    expect(screen.getByTestId("restore-confirm")).toBeTruthy();
    expect(rendered.getPathname()).toBe("/account/restore");
    expect(screen.queryByTestId("login-screen")).toBeNull();

    // Still there a beat later: nothing in the shell replaces it.
    await waitFor(() => {
      expect(rendered.getPathname()).toBe("/account/restore");
    });
  });
});

describe("a launch with no link", () => {
  it("goes to sign-in when there is no session", async () => {
    const rendered = renderRouter(appRouteMap({ real: REAL_ROUTES }) as never, {
      initialUrl: "/",
    });

    expect(await screen.findByTestId("login-screen")).toBeTruthy();
    await waitFor(() => {
      expect(rendered.getPathname()).toBe("/login");
    });
  });

  it("goes to onboarding when the member has onboardingCompleted === false", async () => {
    await SecureStore.setItemAsync("become.session", savedJwt());
    meUser = { _id: "u1", email: "jon@example.com", onboardingCompleted: false };

    renderRouter(appRouteMap({ real: REAL_ROUTES }) as never, {
      initialUrl: "/",
    });

    expect(await screen.findByTestId(screenId("onboarding"))).toBeTruthy();
    expect(screen.queryByTestId("login-screen")).toBeNull();
  });

  it("goes Home when the member has completed onboarding", async () => {
    await SecureStore.setItemAsync("become.session", savedJwt());
    meUser = { _id: "u1", email: "jon@example.com", onboardingCompleted: true };

    renderRouter(appRouteMap({ real: REAL_ROUTES }) as never, {
      initialUrl: "/",
    });

    expect(
      await screen.findByTestId(screenId("(app)/(tabs)/dashboard/index")),
    ).toBeTruthy();
  });

  it("goes Home for a legacy member with no onboardingCompleted field", async () => {
    // STRICT `=== false`, as on the web: rows that predate the flag are not
    // gated, or every member from before onboarding existed is sent through it.
    await SecureStore.setItemAsync("become.session", savedJwt());
    meUser = { _id: "u1", email: "jon@example.com" };

    renderRouter(appRouteMap({ real: REAL_ROUTES }) as never, {
      initialUrl: "/",
    });

    expect(
      await screen.findByTestId(screenId("(app)/(tabs)/dashboard/index")),
    ).toBeTruthy();
    expect(screen.queryByTestId(screenId("onboarding"))).toBeNull();
  });

  it("never shows the scaffold screen", async () => {
    renderRouter(appRouteMap({ real: REAL_ROUTES }) as never, {
      initialUrl: "/",
    });

    await screen.findByTestId("login-screen");
    expect(screen.queryByText("Native scaffold online")).toBeNull();
    expect(screen.queryByTestId("probe-title")).toBeNull();

    // And it is gone from the sources, not merely unrendered.
    const index = fs.readFileSync(path.join(APP_DIR, "index.tsx"), "utf8");
    expect(index).not.toMatch(/Native scaffold online/);
    expect(index).toMatch(/Redirect/);
  });
});

describe("the guarded group", () => {
  it("sends a member with no session from a tab route to sign-in", async () => {
    renderRouter(appRouteMap({ real: REAL_ROUTES }) as never, {
      initialUrl: "/(tabs)/dashboard",
    });

    expect(await screen.findByTestId("login-screen")).toBeTruthy();
    expect(
      screen.queryByTestId(screenId("(app)/(tabs)/dashboard/index")),
    ).toBeNull();
  });
});

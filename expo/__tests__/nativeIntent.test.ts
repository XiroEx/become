/* eslint-disable import/first */
// `app/+native-intent.tsx` is where expo-router hands every incoming link
// before it resolves a route — the cold-start one included. Two things are
// pinned here:
//
//  1. it rewrites WEB paths onto native routes through the one resolver
//     (`lib/navigation/webPathToRoute.ts`), so a push, an email link or a
//     widget tap lands on a real screen;
//  2. it leaves a route the app already owns exactly as it found it. A
//     resolver that silently rewrote `/verify?token=…` would be the same class
//     of bug as the launch gate that replaced it with `/login`.

const mockOpenWebSignedIn = jest.fn(async (_path: string) => "signed-in" as const);
jest.mock("@/lib/web/openWebSignedIn", () => ({
  __esModule: true,
  openWebSignedIn: (path: string) => mockOpenWebSignedIn(path),
}));

const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
}));

import * as fs from "fs";
import * as path from "path";
import {
  DIRECT_NATIVE_ROUTES,
  consumePendingRedirect,
  getPendingRedirect,
  redirectSystemPath,
  resolveDirectNativeRoute,
  setPendingRedirect,
} from "../app/+native-intent";
/* eslint-enable import/first */

beforeEach(() => {
  mockOpenWebSignedIn.mockClear();
  mockRouterPush.mockClear();
  setPendingRedirect(null);
});

describe("+native-intent", () => {
  it("is a route-level file expo-router will pick up", () => {
    const file = path.resolve(__dirname, "..", "app", "+native-intent.tsx");
    expect(fs.existsSync(file)).toBe(true);
  });

  it.each([
    "/verify?token=abcdefgh12345678&mode=login",
    "/account/restore?u=user-1&t=mac-token",
    "/(tabs)/programming/p1/workout/2/live",
    "/",
  ])("returns %s unchanged on a cold start", (link) => {
    expect(redirectSystemPath({ path: link, initial: true })).toBe(link);
  });

  it("returns a warm link unchanged too", () => {
    const link = "/verify?token=abcdefgh12345678&mode=register";
    expect(redirectSystemPath({ path: link, initial: false })).toBe(link);
  });

  it.each([
    ["/dashboard", "/(tabs)/dashboard"],
    ["/dashboard/streaks", "/(tabs)/dashboard/streaks"],
    ["/dashboard/calendar?date=2026-09-29", "/(tabs)/calendar?date=2026-09-29"],
    ["/dashboard/nutrition", "/(tabs)/nutrition"],
    ["/dashboard/mind/becoming", "/becoming"],
    [
      "/dashboard/workout/p1/workout/live?day=Day%202&sd=2026-09-29",
      "/(tabs)/programming/p1/workout/1/live?day=Day%202&sd=2026-09-29",
    ],
  ])("rewrites the web path %s to %s", (link, expected) => {
    expect(redirectSystemPath({ path: link, initial: true })).toBe(expected);
  });

  it("sends an unrecognised link Home rather than to a blank screen", () => {
    expect(
      redirectSystemPath({ path: "/dashboard/not-a-page", initial: true }),
    ).toBe("/(tabs)/dashboard");
  });

  it("opens a web-only surface on the web and still lands the app somewhere", () => {
    const landed = redirectSystemPath({
      path: "/dashboard/admin/users",
      initial: false,
    });
    expect(mockOpenWebSignedIn).toHaveBeenCalledWith("/dashboard/admin/users");
    expect(landed).toBe("/(tabs)/dashboard");
  });

  describe("direct native route resolution and pending redirects (NP-308)", () => {
    it("exports DIRECT_NATIVE_ROUTES including expected routes", () => {
      expect(DIRECT_NATIVE_ROUTES.has("/plan")).toBe(true);
      expect(DIRECT_NATIVE_ROUTES.has("/settings")).toBe(true);
      expect(DIRECT_NATIVE_ROUTES.has("/progress")).toBe(true);
      expect(DIRECT_NATIVE_ROUTES.has("/becoming")).toBe(true);
      expect(DIRECT_NATIVE_ROUTES.has("/onboarding")).toBe(true);
    });

    it.each([
      ["become://plan", "/plan"],
      ["become://settings", "/settings"],
      ["become://progress", "/progress"],
      ["become://becoming", "/becoming"],
      ["become://onboarding", "/onboarding"],
      ["/plan", "/plan"],
      ["/settings", "/settings"],
      ["/progress", "/progress"],
      ["/becoming", "/becoming"],
      ["https://become.redbtn.io/plan", "/plan"],
      ["https://become.redbtn.io/settings", "/settings"],
    ])("resolves direct native route %s to %s", (input, expected) => {
      expect(resolveDirectNativeRoute(input)).toBe(expected);
    });

    it("resolves become:// scheme with query params intact", () => {
      expect(
        resolveDirectNativeRoute("become://plan?billing=success&session_id=cs_123"),
      ).toBe("/plan?billing=success&session_id=cs_123");
    });

    it("resolves Stripe checkout return link to /plan with session_id", () => {
      const target = redirectSystemPath({
        path: "become://?billing=success&session_id=cs_test_abc123",
        initial: true,
      });
      expect(target).toBe("/plan?billing=success&session_id=cs_test_abc123");
      expect(getPendingRedirect()).toBe("/plan?billing=success&session_id=cs_test_abc123");
    });

    it("resolves https dashboard/plan link to /plan", () => {
      const target = redirectSystemPath({
        path: "https://become.redbtn.io/dashboard/plan",
        initial: true,
      });
      expect(target).toBe("/plan");
      expect(getPendingRedirect()).toBe("/plan");
    });

    it("calls router.push on warm starts and records pending redirect", () => {
      const target = redirectSystemPath({
        path: "become://plan",
        initial: false,
      });
      expect(target).toBe("/plan");
      expect(mockRouterPush).toHaveBeenCalledWith("/plan");
      expect(getPendingRedirect()).toBe("/plan");
    });

    it("consumes and clears pending redirect", () => {
      setPendingRedirect("/settings");
      expect(getPendingRedirect()).toBe("/settings");
      expect(consumePendingRedirect()).toBe("/settings");
      expect(getPendingRedirect()).toBeNull();
    });
  });
});

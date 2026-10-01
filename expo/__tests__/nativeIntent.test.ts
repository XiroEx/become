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

import * as fs from "fs";
import * as path from "path";
import { redirectSystemPath } from "../app/+native-intent";
/* eslint-enable import/first */

beforeEach(() => {
  mockOpenWebSignedIn.mockClear();
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
    ["/dashboard/mind/becoming", "/(tabs)/mind"],
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
});

import * as fs from "fs";
import * as path from "path";
import { redirectSystemPath } from "../app/+native-intent";

// `app/+native-intent.tsx` is where expo-router hands every incoming link
// before it resolves a route — the cold-start one included. Its job today is
// to be a pass-through and to exist: the web-path resolver is NP-034's, and
// a resolver that silently rewrote an unrecognised link would be the same
// class of bug as the launch gate that replaced /verify with /login.

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
});

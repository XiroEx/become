/**
 * ─── A tap on a widget opens its screen ──────────────────────────────────────
 *
 * The acceptance criterion is "the four widgets open their screens", and the
 * hazard is that a widget tap is not a navigation: it is an `ACTION_VIEW` intent
 * fired by the launcher, so a wrong scheme or a lost path segment shows up as a
 * tap that opens the app at Home — or at nothing — with no error anywhere.
 *
 * So this reads the deep links out of the SERVER's own source
 * (`webapp/lib/widgets/feed.ts`), turns each one into the uri a tile carries, and
 * puts it through the one resolver every other entry point uses. A deep link
 * changed on the server fails this suite until it has a route, exactly as
 * `__tests__/webPathToRoute.test.ts` does for pushes and cards.
 */
import * as fs from "fs";
import * as path from "path";
import {
  NATIVE_ROUTES,
  resolveWebPath,
} from "@/lib/navigation/webPathToRoute";
import {
  WIDGET_SIGN_IN_PATH,
  widgetSignInUri,
  widgetTapUri,
} from "@/lib/widgets/taps";
import { ANDROID_WIDGETS } from "@/lib/widgets/androidWidgets";
import { IOS_WIDGETS } from "@/lib/widgets/iosWidgets";

const FEED_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "..", "..", "webapp", "lib", "widgets", "feed.ts"),
  "utf8",
);

/** `key: 'streak'` … `deepLink: '/dashboard/streaks'`, straight from the server. */
function serverDeepLinks(): Map<string, string> {
  const links = new Map<string, string>();
  const pattern = /key:\s*'([a-z]+)'[\s\S]{0,1200}?deepLink:\s*'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(FEED_SOURCE)) !== null) {
    const [, key, link] = match;
    if (key && link && !links.has(key)) links.set(key, link);
  }
  return links;
}

describe("the server's widget deep links", () => {
  const links = serverDeepLinks();

  it("were found in webapp/lib/widgets/feed.ts", () => {
    expect([...links.keys()].sort()).toEqual([
      "becoming",
      "mind",
      "nutrition",
      "streak",
      "training",
    ]);
  });

  it("each of the four widgets has one", () => {
    for (const definition of ANDROID_WIDGETS) {
      expect(links.get(definition.feedKey)).toMatch(/^\/dashboard/);
    }
  });

  it("every one of them resolves to a real native screen", () => {
    const expected: Record<string, string> = {
      streak: NATIVE_ROUTES.streaks,
      nutrition: NATIVE_ROUTES.nutrition,
      mind: NATIVE_ROUTES.mind,
      becoming: NATIVE_ROUTES.becoming,
    };
    for (const definition of ANDROID_WIDGETS) {
      const link = links.get(definition.feedKey)!;
      const target = resolveWebPath(widgetTapUri(link));
      expect(target.kind).toBe("native");
      if (target.kind !== "native") continue;
      expect(target.pathname).toBe(expected[definition.feedKey]);
      // "unknown" is the resolver's way of saying it guessed. A widget tap may
      // be a deliberate `nearest`, never a guess.
      expect(target.fallback).not.toBe("unknown");
    }
  });
});

describe("widgetTapUri", () => {
  it("turns a web path into a become:// url the launcher can fire", () => {
    expect(widgetTapUri("/dashboard/streaks")).toBe("become://dashboard/streaks");
    expect(widgetTapUri("dashboard/nutrition")).toBe(
      "become://dashboard/nutrition",
    );
    expect(widgetTapUri("/dashboard/mind/becoming")).toBe(
      "become://dashboard/mind/becoming",
    );
  });

  it("keeps a query intact", () => {
    const uri = widgetTapUri("/dashboard/nutrition?date=2026-09-29");
    expect(uri).toBe("become://dashboard/nutrition?date=2026-09-29");
    const target = resolveWebPath(uri);
    expect(target).toMatchObject({
      kind: "native",
      pathname: NATIVE_ROUTES.nutrition,
      params: { date: "2026-09-29" },
    });
  });

  it("leaves an absolute url alone", () => {
    expect(widgetTapUri("https://become.redbtn.io/dashboard/mind")).toBe(
      "https://become.redbtn.io/dashboard/mind",
    );
  });

  it("still produces something openable from an empty path", () => {
    expect(widgetTapUri("")).toBe("become://");
    expect(resolveWebPath(widgetTapUri("")).kind).toBe("native");
  });
});

describe("the signed-out tap", () => {
  it("goes to the sign-in screen", () => {
    expect(WIDGET_SIGN_IN_PATH).toBe("/login");
    expect(widgetSignInUri()).toBe("become://login");
    expect(resolveWebPath(widgetSignInUri())).toMatchObject({
      kind: "native",
      pathname: NATIVE_ROUTES.login,
      fallback: "exact",
    });
  });
});

describe("all five iOS widgets open their screens", () => {
  // iOS draws all five feed keys (Android deliberately has no training tile),
  // and every size of a tile carries the same `props.url` — so one gate per
  // feed key covers small, medium and the Lock Screen sizes together.
  const links = serverDeepLinks();

  it("every iOS widget has a server deep link", () => {
    for (const definition of IOS_WIDGETS) {
      expect(links.get(definition.feedKey)).toMatch(/^\/dashboard/);
    }
  });

  it("every iOS tap resolves to its own native screen, never a guess", () => {
    const expected: Record<string, string> = {
      streak: NATIVE_ROUTES.streaks,
      nutrition: NATIVE_ROUTES.nutrition,
      mind: NATIVE_ROUTES.mind,
      becoming: NATIVE_ROUTES.becoming,
      training: NATIVE_ROUTES.workout,
    };
    for (const definition of IOS_WIDGETS) {
      const link = links.get(definition.feedKey)!;
      const target = resolveWebPath(widgetTapUri(link));
      expect(target.kind).toBe("native");
      if (target.kind !== "native") continue;
      expect(target.pathname).toBe(expected[definition.feedKey]);
      expect(target.fallback).not.toBe("unknown");
    }
  });
});

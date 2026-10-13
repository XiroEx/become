import * as fs from "fs";
import * as path from "path";
import { Text } from "react-native";

/**
 * THE REAL ROUTE TREE, rendered.
 *
 * `renderRouter` takes a map of route key → component, and every test that
 * hand-writes that map is testing the map. The tab bar grew to twenty slots
 * precisely because nobody looked at what the FILES add up to: a folder with
 * no `_layout.tsx` is flattened into its parent navigator, so a screen added
 * three directories down became a tab button and no test noticed.
 *
 * So this walks `expo/app` on disk and builds the map from it:
 *
 *   • every `_layout.tsx` is the REAL layout — they are the thing under test;
 *   • every leaf route is a stub that renders its own key, so a suite can say
 *     "I am on `(app)/(tabs)/programming/[id]/index`" without booting a screen
 *     full of fetches (pass `real` for the handful a test needs for real);
 *   • `+native-intent` and other `+`/`_` files are not routes.
 *
 * A screen file added tomorrow therefore turns up in the render tomorrow,
 * which is the only way a test can catch the next unlisted tab.
 */
export const APP_DIR = path.resolve(__dirname, "..", "app");

/** Extension-free, POSIX route keys relative to `expo/app`, sorted. */
export function routeKeys(dir: string = APP_DIR, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...routeKeys(path.join(dir, entry.name), rel));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(rel.replace(/\.tsx?$/, ""));
    }
  }
  return out.sort();
}

/** `dashboard`, `programming`, … — every direct child folder of `(tabs)`. */
export function tabFolders(): string[] {
  const base = path.join(APP_DIR, "(app)", "(tabs)");
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export interface AppRouteMapOptions {
  /**
   * Route keys to load from disk instead of stubbing — for a test that needs
   * the screen itself to act (the verify screen spending its token, say).
   */
  real?: string[];
}

export function appRouteMap(
  options: AppRouteMapOptions = {},
): Record<string, unknown> {
  const real = new Set(options.real ?? []);
  const map: Record<string, unknown> = {};
  for (const key of routeKeys()) {
    const base = key.split("/").pop() as string;
    if (base === "_layout" || real.has(key)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      map[key] = require(path.join(APP_DIR, key));
      continue;
    }
    // `+native-intent` is not a route (expo-router reads it as the link
    // resolver, and its ignore list is exactly `+api`, `+html` and
    // `+native-intent` — see `getIgnoreList` in
    // `expo-router/build/getRoutesCore.js`).
    //
    // `_stories` IS a route, and that is the point: the leading underscore is a
    // Next.js habit that buys nothing here, so the component gallery shipped
    // reachable at `become://_stories`. It is in this map so a test can open it
    // and watch it redirect (`__tests__/dev-only-routes.test.tsx`).
    if (base.startsWith("+")) continue;
    map[key] = function StubRoute() {
      return <Text testID={`screen:${key}`}>{key}</Text>;
    };
  }
  return map;
}

/** The testID a stubbed route renders, so a test can name the file it means. */
export function screenId(routeKey: string): string {
  return `screen:${routeKey}`;
}

/** An unexpired JWT, so the local `exp` check trusts it without a network. */
export function savedJwt(userId = "u1"): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 3600 }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
}

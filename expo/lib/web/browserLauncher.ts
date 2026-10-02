import * as WebBrowser from "expo-web-browser";

/**
 * THE ONE IN-APP-BROWSER HANDLE (NP-121's launcher).
 *
 * Every Tier-3 "open this Become page in a browser" control — the program
 * editor links, the recipe editor links, the legal links, the consent sheets —
 * opens through THIS, so there is exactly one place that decides HOW a page
 * is opened. `openWebSignedIn` (`lib/web/openWebSignedIn.ts`) takes it as its
 * `launcher` dep and falls back to it for the plain (signed-out) open.
 *
 * Pluggable for tests via the `launcher` arg on every caller.
 */
export type BrowserLauncher = (url: string) => Promise<unknown>;

export const defaultBrowserLauncher: BrowserLauncher = (url) =>
  WebBrowser.openBrowserAsync(url);

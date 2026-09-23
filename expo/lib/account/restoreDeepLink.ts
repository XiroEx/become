/**
 * Pure parser for the "Keep my account" link in the deletion email.
 *
 * The same URL has to work in three places, which is the whole point of the
 * acceptance criterion "the restore link works whether it opens in the app or a
 * browser":
 *
 *   https://become.redbtn.io/account/restore?u=…&t=…
 *       · in any browser, signed out — the webapp page handles it;
 *       · caught by iOS as a Universal Link (app.json → associatedDomains) or
 *         by Android as an autoVerify intent filter, and handled here;
 *   become://account/restore?u=…&t=…
 *       · the custom scheme, for a device where the association has not been
 *         verified yet (a fresh install, or a sideloaded build).
 *
 * Modelled on lib/auth/deepLinkHandler.ts, deliberately: one shape of parser
 * for every link Become sends, so a new one cannot invent its own rules.
 * Returns null for anything that is not a recognisable restore link, including
 * a correct-looking path on a host we do not own.
 */

export interface RestoreDeepLink {
  userId: string;
  token: string;
}

const ALLOWED_HOSTS = new Set([
  "become.redbtn.io",
  "become-beta.redbtn.io",
  "becomeurbest.com",
  "www.becomeurbest.com",
]);

export const RESTORE_PATH = "/account/restore";

export function parseRestoreDeepLink(url: string): RestoreDeepLink | null {
  if (!url || typeof url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const scheme = parsed.protocol.replace(":", "");
  if (scheme === "become") {
    // `become://account/restore?…` parses with hostname "account" and pathname
    // "/restore"; `become:///account/restore?…` gives an empty hostname and the
    // full path. Both shapes are minted by mail clients in the wild.
    const joined = `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, "");
    if (joined !== "account/restore" && joined !== RESTORE_PATH) return null;
  } else if (scheme === "https") {
    if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;
    if (parsed.pathname.replace(/\/+$/, "") !== RESTORE_PATH) return null;
  } else {
    return null;
  }

  const userId = parsed.searchParams.get("u");
  const token = parsed.searchParams.get("t");
  if (!userId || !token) return null;
  return { userId, token };
}

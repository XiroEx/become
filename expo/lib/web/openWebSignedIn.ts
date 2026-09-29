/**
 * Open a web-only Become screen in the in-app browser, ALREADY SIGNED IN.
 *
 * Tier-3 surfaces (the program editor, the recipe editor, the admin screens)
 * live on the web, and the browser the app opens carries no Become session — so
 * every one of them used to land the member on the sign-in page. Three helpers
 * built those links by hand (`WEBAPP_BASE_URL/...`), and two of them pointed at
 * pages that do not exist.
 *
 * This is the one helper they all move to. It:
 *
 *   1. prefixes WEBAPP_BASE_URL — it takes a PATH, never a URL, so only Become
 *      pages are ever opened as Become pages;
 *   2. trades the session the app is already holding for a one-time code
 *      (`POST /api/auth/handoff`), good for sixty seconds, bound to this member
 *      and to this one allow-listed path;
 *   3. opens `WEBAPP_BASE_URL/auth/handoff?code=…`, which spends the code, sets
 *      the session cookie and lands on the path;
 *   4. falls back to the PLAIN url — signed out, exactly today's behaviour —
 *      when the network is down, the session has gone, or the server refuses.
 *      A member on a bad connection gets the sign-in page, not a dead button.
 *
 * The server half is webapp/app/api/auth/handoff/route.ts (mint),
 * webapp/app/auth/handoff/route.ts (redeem) and webapp/lib/authHandoff.ts (the
 * rules, including the allow-list of paths a hand-off may land on).
 */

import { WEBAPP_BASE_URL } from "@/lib/config";
import { sessionStore, type TokenStore } from "@/lib/auth/secureStoreToken";
import {
  defaultBrowserLauncher,
  type BrowserLauncher,
} from "@/lib/programs/browserLauncher";

/** Where a code is minted. Mirrors HANDOFF_MINT_PATH in webapp/lib/authHandoff.ts. */
export const HANDOFF_MINT_PATH = "/api/auth/handoff";

/** Where a code is spent. Mirrors HANDOFF_REDEEM_PATH in webapp/lib/authHandoff.ts. */
export const HANDOFF_REDEEM_PATH = "/auth/handoff";

export interface OpenWebSignedInDeps {
  /** Pluggable for tests; defaults to expo-web-browser. */
  launcher?: BrowserLauncher;
  /** Where the session JWT lives. Defaults to `sessionStore` (`become.session`). */
  store?: TokenStore;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export type OpenWebSignedInResult =
  /** A code was minted and the browser opened on the hand-off URL. */
  | "signed-in"
  /** The plain URL was opened instead — signed out, but the screen is reachable. */
  | "plain"
  /** Nothing was opened: the path was not a Become path. */
  | "refused";

/**
 * A target must be a PATH on the Become web app: one leading slash, no origin
 * of its own, no query and no fragment. The server's allow-list refuses all of
 * those too (webapp/lib/authHandoff.ts#normalizeHandoffPath), so refusing here
 * means a bad caller fails loudly in tests instead of silently degrading to a
 * signed-out open.
 */
export function isBecomeWebPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.includes("\\")) return false;
  if (trimmed.includes("?") || trimmed.includes("#")) return false;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return false;
  return true;
}

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch | null {
  return fetchImpl ?? (globalThis.fetch as typeof fetch | undefined) ?? null;
}

/**
 * Open `path` on the Become web app, signed in when that is possible and signed
 * out when it is not. Never throws: a Tier-3 button must always open something.
 */
export async function openWebSignedIn(
  path: string,
  deps: OpenWebSignedInDeps = {},
): Promise<OpenWebSignedInResult> {
  if (!isBecomeWebPath(path)) return "refused";

  const base = (deps.baseUrl ?? WEBAPP_BASE_URL).replace(/\/$/, "");
  const target = path.trim();
  const plainUrl = `${base}${target}`;
  const launcher = deps.launcher ?? defaultBrowserLauncher;

  const openPlain = async (): Promise<OpenWebSignedInResult> => {
    await launcher(plainUrl);
    return "plain";
  };

  const store = deps.store ?? sessionStore;
  let token: string | null = null;
  try {
    token = await store.get();
  } catch {
    token = null;
  }
  if (!token) return openPlain();

  const fetchImpl = resolveFetch(deps.fetchImpl);
  if (!fetchImpl) return openPlain();

  let code: string | null = null;
  try {
    const res = await fetchImpl(`${base}${HANDOFF_MINT_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ path: target }),
    });
    if (!res.ok) return openPlain();
    const body = (await res.json()) as { code?: unknown };
    code = typeof body?.code === "string" && body.code.length > 0 ? body.code : null;
  } catch {
    // Offline, DNS, TLS, a body that is not JSON — every one of them means "no
    // code", and none of them should stop the member reaching the screen.
    return openPlain();
  }

  if (!code) return openPlain();

  await launcher(
    `${base}${HANDOFF_REDEEM_PATH}?code=${encodeURIComponent(code)}`,
  );
  return "signed-in";
}

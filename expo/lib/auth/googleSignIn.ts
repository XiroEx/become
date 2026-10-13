/**
 * SIGN IN WITH GOOGLE, the app's half (NP-126).
 *
 * GOOGLE REFUSES SIGN-IN INSIDE AN EMBEDDED WEB VIEW. `disallowed_useragent` is
 * what an in-app WKWebView gets, so the only way to offer Google in a native
 * app is the SYSTEM authentication session — `ASWebAuthenticationSession` on
 * iOS, a Custom Tab on Android — which `WebBrowser.openAuthSessionAsync` opens.
 * That session runs the web flow the webapp already has; what is new is how it
 * ENDS.
 *
 * The web flow ends at `/auth/finish#<jwt>`. A fragment is right for a browser
 * tab and wrong for an app: the only way a URL re-enters an app is a scheme the
 * OS routes, and any app on the device can claim a scheme. So the app never
 * receives the token —
 *
 *   1. it invents a VERIFIER (32 bytes from expo-crypto's CSPRNG) and keeps it
 *      in memory, sending only its SHA-256 — the CHALLENGE — in the URL it
 *      opens: `/api/auth/google?app=1&challenge=…`;
 *   2. the Google callback mints a one-time code bound to the member AND that
 *      challenge, and returns it through `/auth/app-callback?code=…`;
 *   3. this module exchanges the code for the session at
 *      `POST /api/auth/exchange`, WITH the verifier.
 *
 * A code lifted out of that redirect is therefore worth nothing: the verifier
 * never left this process, and the code is single use and dead in sixty
 * seconds. The server's half is webapp/lib/appAuthCode.ts, which argues each of
 * those rules; the constants below are mirrored there and
 * webapp/tests/unit/auth/appAuthCode.test.ts fails if the two drift.
 *
 * Every dependency is injectable, so the whole flow is exercised in Jest with
 * no device, no browser and no network.
 */
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import {
  apiFetch,
  AppAuthExchangeResponseSchema,
  type AppAuthExchangeResponse,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { bytesToBase64Url, sha256Base64Url } from "@/lib/auth/sha256";

/** Mirrors APP_AUTH_START_PATH in webapp/lib/appAuthCode.ts. */
export const GOOGLE_AUTH_START_PATH = "/api/auth/google";

/** Mirrors APP_AUTH_EXCHANGE_PATH in webapp/lib/appAuthCode.ts. */
export const APP_AUTH_EXCHANGE_PATH = "/api/auth/exchange";

/**
 * Mirrors APP_AUTH_RETURN_URL in webapp/lib/appAuthCode.ts: the URL
 * `/auth/app-callback` redirects to, which is what CLOSES the system
 * authentication session and resolves `openAuthSessionAsync`. `become` is
 * `expo.scheme` in app.json.
 */
export const APP_AUTH_RETURN_URL = "become://auth/app-callback";

/** 32 bytes — the same strength the server's own codes are minted with. */
export const APP_AUTH_VERIFIER_BYTES = 32;

/** Random bytes, from the platform CSPRNG. */
export type RandomBytes = (byteCount: number) => Uint8Array;

/**
 * A FRESH VERIFIER PER ATTEMPT, from a real CSPRNG.
 *
 * `expo-crypto`'s `getRandomBytes` is `SecRandomCopyBytes` / `SecureRandom`.
 * There is deliberately NO weaker fallback: neither React Native nor Expo
 * installs `crypto.getRandomValues`, and a verifier built from `Math.random` is
 * a verifier an attacker who catches the code can hope to guess inside the
 * sixty seconds it is alive. If the platform cannot produce randomness this
 * throws, and `signInWithGoogle` reports an error instead of starting a flow it
 * cannot protect.
 */
export function createAppAuthVerifier(randomBytes?: RandomBytes): string {
  const random = randomBytes ?? Crypto.getRandomBytes;
  const bytes = random(APP_AUTH_VERIFIER_BYTES);
  if (!bytes || bytes.length !== APP_AUTH_VERIFIER_BYTES) {
    throw new Error("secure randomness is unavailable on this device");
  }
  return bytesToBase64Url(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

/** The challenge for a verifier: SHA-256, base64url. The server hashes the
 *  verifier the same way and compares (models/AppAuthCode.ts). */
export function appAuthChallengeFor(verifier: string): string {
  return sha256Base64Url(verifier);
}

/** The URL the system authentication session is opened on. */
export function googleAuthStartUrl(challenge: string, baseUrl = WEBAPP_BASE_URL): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${GOOGLE_AUTH_START_PATH}?app=1&challenge=${encodeURIComponent(challenge)}`;
}

/**
 * The `code` (or `error`) out of the URL the authentication session came back
 * with.
 *
 * Parsed by hand rather than with `URL`: the return URL uses a custom scheme,
 * and a URL implementation's handling of a non-special scheme is exactly the
 * kind of thing that differs between Hermes, Expo's winter polyfill and Node —
 * on a value the sign-in depends on. Only the query matters here.
 */
export function paramsFromReturnUrl(url: string): { code?: string; error?: string } {
  if (typeof url !== "string") return {};
  const start = url.indexOf("?");
  if (start < 0) return {};
  const query = url.slice(start + 1).split("#")[0] ?? "";
  const out: { code?: string; error?: string } = {};
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = eq < 0 ? pair : pair.slice(0, eq);
    const raw = eq < 0 ? "" : pair.slice(eq + 1);
    let value = raw;
    try {
      value = decodeURIComponent(raw.replace(/\+/g, " "));
    } catch {
      // A malformed escape is not a code; leave it as it arrived and let the
      // exchange refuse it.
    }
    // First value wins: `?code=a&code=b` is a mistake, not a list.
    if (key === "code" && out.code === undefined && value) out.code = value;
    if (key === "error" && out.error === undefined && value) out.error = value;
  }
  return out;
}

export type GoogleSignInStatus =
  | "signed-in"
  /** The member closed the sheet. Say nothing. */
  | "cancelled"
  | "error";

export interface GoogleSignInResult {
  status: GoogleSignInStatus;
  session?: AppAuthExchangeResponse;
  message?: string;
}

export interface GoogleSignInDeps {
  /** Opens the SYSTEM authentication session. Never an in-app web view. */
  openAuthSession?: (
    url: string,
    returnUrl: string,
  ) => Promise<WebBrowser.WebBrowserAuthSessionResult>;
  /** POSTs the code + verifier to Become. */
  exchange?: (code: string, verifier: string) => Promise<AppAuthExchangeResponse>;
  randomBytes?: RandomBytes;
  baseUrl?: string;
}

function defaultExchange(
  code: string,
  verifier: string,
  baseUrl: string,
): Promise<AppAuthExchangeResponse> {
  return apiFetch(APP_AUTH_EXCHANGE_PATH, AppAuthExchangeResponseSchema, {
    method: "POST",
    body: { code, verifier },
    baseUrl,
    // No `getToken`: there is no session yet — this call is what produces one.
  });
}

/**
 * Run the whole flow: the system authentication session, then the exchange.
 * Resolves rather than throws for every ending, because a sign-in button needs
 * to know which of them happened.
 */
export async function signInWithGoogle(
  deps: GoogleSignInDeps = {},
): Promise<GoogleSignInResult> {
  const baseUrl = deps.baseUrl ?? WEBAPP_BASE_URL;
  const open = deps.openAuthSession ?? WebBrowser.openAuthSessionAsync;
  const exchange =
    deps.exchange ?? ((code: string, verifier: string) => defaultExchange(code, verifier, baseUrl));

  let verifier: string;
  try {
    verifier = createAppAuthVerifier(deps.randomBytes);
  } catch {
    return {
      status: "error",
      message: "This device could not start a secure sign-in. Please try again.",
    };
  }

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await open(
      googleAuthStartUrl(appAuthChallengeFor(verifier), baseUrl),
      APP_AUTH_RETURN_URL,
    );
  } catch {
    return {
      status: "error",
      message: "Couldn't open Google sign-in. Please try again.",
    };
  }

  // 'cancel' is the member dismissing the sheet; 'dismiss' is the same act on
  // the other platform. Neither is an error and neither says anything.
  if (result.type !== "success") {
    return result.type === "cancel" || result.type === "dismiss"
      ? { status: "cancelled" }
      : {
          status: "error",
          message: "Google sign-in didn't finish. Please try again.",
        };
  }

  const { code, error } = paramsFromReturnUrl(result.url);
  if (!code) {
    return {
      status: "error",
      message:
        error === "google_email"
          ? "Google didn't share an email address, so we couldn't sign you in."
          : "Google sign-in didn't finish. Please try again.",
    };
  }

  try {
    const session = await exchange(code, verifier);
    return { status: "signed-in", session };
  } catch {
    // Every refusal from the exchange is one 400: an expired code, a replayed
    // one, a verifier that does not match. All of them mean "start again".
    return {
      status: "error",
      message: "We couldn't finish signing you in. Please try again.",
    };
  }
}

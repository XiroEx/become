/**
 * PASSKEYS NATIVELY (NP-161).
 *
 * `webapp/lib/passkeyClient.ts` runs the WebAuthn ceremony in the browser via
 * `@simplewebauthn/browser`. This module runs the SAME ceremony on-device
 * through `react-native-passkey` — a maintained RN module wrapping
 * `ASAuthorizationPlatformPublicKeyCredentialProvider` on iOS and the
 * Credential Manager API on Android. Both platforms hand back exactly the
 * JSON shape `@simplewebauthn/{browser,server}` already speaks
 * (`PublicKeyCredentialCreationOptionsJSON`/`RegistrationResponseJSON` and
 * their authentication equivalents), so the options/response bodies below are
 * passed straight through to `webapp/app/api/auth/passkey/*` with no
 * reshaping — the native ceremony is a drop-in for the web one.
 *
 * SAME RELYING PARTY AS THE WEB: `webapp/lib/redauth.ts`'s `rpID` (default
 * `redbtn.io`) is unchanged by any of this, so a passkey added on
 * become.redbtn.io in a browser signs this app in, and a passkey added here
 * signs the browser in — the one rule NP-161 says must travel.
 *
 * ANDROID'S ORIGIN IS DIFFERENT, THOUGH: Credential Manager reports
 * `android:apk-key-hash:<fingerprint>` as the WebAuthn origin, never the
 * `https://become.redbtn.io` the web and iOS both present (iOS reports the
 * associated domain it is signed into, once `webcredentials:become.redbtn.io`
 * is in `ios.associatedDomains` — see app.json). `@redbtn/redauth` checks the
 * assertion against exactly ONE configured origin per instance, so every
 * request below carries `PASSKEY_PLATFORM_HEADER` — `webapp/lib/redauth.ts`'s
 * `passkeyOriginFromRequest` reads it to pick the Android-pinned instance.
 * Web never sends this header (nothing changes for it); iOS sends it too, but
 * resolves to the same "web" instance because its origin already matches.
 */
import { Platform } from "react-native";
import {
  Passkey,
  type PasskeyCreateRequest,
  type PasskeyCreateResult,
  type PasskeyGetRequest,
  type PasskeyGetResult,
} from "react-native-passkey";
import { WEBAPP_BASE_URL } from "@/lib/config";

/** Mirrors `PASSKEY_ORIGIN_HEADER` in `webapp/lib/redauth.ts`. */
export const PASSKEY_PLATFORM_HEADER = "x-become-platform";

/** The capability this module needs from `react-native-passkey` — narrowed to
 *  three calls so tests can inject a fake with no native module in play. */
export interface PasskeyCapability {
  isSupported(): boolean;
  create(request: PasskeyCreateRequest): Promise<PasskeyCreateResult>;
  get(request: PasskeyGetRequest): Promise<PasskeyGetResult>;
}

export const realPasskeyCapability: PasskeyCapability = {
  isSupported: () => Passkey.isSupported(),
  create: (request) => Passkey.create(request),
  get: (request) => Passkey.get(request),
};

/** Whether this device can run a passkey ceremony at all (iOS 15+ / Android
 *  API 28+, per `react-native-passkey`). Settings and the login screen use
 *  this to fall back to the web hand-off / email link instead of showing a
 *  control that would only throw. */
export function passkeySupported(capability: PasskeyCapability = realPasskeyCapability): boolean {
  return capability.isSupported();
}

/** Every error `react-native-passkey` throws is a plain `{ error, message }`
 *  object, never a real `Error` — see its `PasskeyError.ts`. */
function isNativePasskeyError(err: unknown): err is { error: string; message: string } {
  return (
    !!err &&
    typeof err === "object" &&
    typeof (err as { error?: unknown }).error === "string"
  );
}

/** True for the one outcome that means nothing: the member dismissed the
 *  system sheet. Same treatment Google's `signInWithGoogle` gives 'cancel'. */
function isUserCancelled(err: unknown): boolean {
  return isNativePasskeyError(err) && err.error === "UserCancelled";
}

/** A message a member can act on, for the errors that are not a plain cancel. */
export function describeNativePasskeyError(err: unknown): string {
  if (isNativePasskeyError(err)) {
    switch (err.error) {
      case "NotSupported":
        return "This device does not support passkeys.";
      case "CredentialAlreadyExists":
        return "A passkey for this account already exists on this device.";
      case "NoCredentials":
        return "No passkey was found for this account on this device.";
      case "BadConfiguration":
        return "Passkeys are not set up correctly for this app yet.";
      default:
        return err.message || "Could not complete the passkey request.";
    }
  }
  return err instanceof Error && err.message
    ? err.message
    : "Could not complete the passkey request.";
}

export interface PasskeyFetchInit {
  method: "POST";
  token?: string;
  body?: unknown;
}

/** POSTs to a `webapp/app/api/auth/passkey/*` route with the platform header
 *  `passkeyOriginFromRequest` reads, and throws the server's `{ error }`
 *  message verbatim on a non-OK response — same contract as the web's
 *  `passkeyClient.ts` `readError`. */
export type PasskeyFetchJson = (path: string, init: PasskeyFetchInit) => Promise<Record<string, unknown>>;

export const defaultPasskeyFetchJson: PasskeyFetchJson = async (path, init) => {
  const res = await fetch(`${WEBAPP_BASE_URL}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      [PASSKEY_PLATFORM_HEADER]: Platform.OS === "android" ? "android" : "ios",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data: Record<string, unknown> = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof data?.error === "string" ? data.error : "Request failed";
    throw new Error(message);
  }
  return data;
};

export interface PasskeyNativeDeps {
  /** DI for tests. Defaults to `realPasskeyCapability`. */
  passkey?: PasskeyCapability;
  /** DI for tests. Defaults to `defaultPasskeyFetchJson`. */
  fetchJson?: PasskeyFetchJson;
}

export type RegisterPasskeyResult =
  | { status: "registered" }
  | { status: "cancelled" }
  | { status: "unsupported" }
  | { status: "error"; message: string };

/**
 * Enroll a passkey for the signed-in member — the on-device half of
 * `PasskeySection`'s "Add a passkey" row. Mirrors
 * `webapp/lib/passkeyClient.ts`'s `registerPasskey`: fetch options, run the
 * ceremony, POST the response for verification.
 */
export async function registerPasskeyNative(
  token: string,
  deps: PasskeyNativeDeps = {},
): Promise<RegisterPasskeyResult> {
  const passkey = deps.passkey ?? realPasskeyCapability;
  const fetchJson = deps.fetchJson ?? defaultPasskeyFetchJson;

  if (!passkey.isSupported()) return { status: "unsupported" };

  let challengeId: unknown;
  let options: unknown;
  try {
    const opts = await fetchJson("/api/auth/passkey/register/options", {
      method: "POST",
      token,
    });
    challengeId = opts.challengeId;
    options = opts.options;
  } catch (err) {
    return { status: "error", message: describeNativePasskeyError(err) };
  }

  let response: PasskeyCreateResult;
  try {
    response = await passkey.create(options as PasskeyCreateRequest);
  } catch (err) {
    if (isUserCancelled(err)) return { status: "cancelled" };
    return { status: "error", message: describeNativePasskeyError(err) };
  }

  try {
    await fetchJson("/api/auth/passkey/register/verify", {
      method: "POST",
      token,
      body: { challengeId, response },
    });
  } catch (err) {
    return { status: "error", message: describeNativePasskeyError(err) };
  }

  return { status: "registered" };
}

export type SignInWithPasskeyResult =
  | { status: "signed-in"; token: string }
  | { status: "cancelled" }
  | { status: "unsupported" }
  | { status: "error"; message: string };

/**
 * Sign in with a passkey — the on-device half of the login screen's passkey
 * button. No email required: a usernameless/discoverable-credential
 * ceremony, same as `webapp/lib/passkeyClient.ts`'s `loginWithPasskey()`.
 */
export async function signInWithPasskeyNative(
  deps: PasskeyNativeDeps = {},
): Promise<SignInWithPasskeyResult> {
  const passkey = deps.passkey ?? realPasskeyCapability;
  const fetchJson = deps.fetchJson ?? defaultPasskeyFetchJson;

  if (!passkey.isSupported()) return { status: "unsupported" };

  let challengeId: unknown;
  let options: unknown;
  try {
    const opts = await fetchJson("/api/auth/passkey/authenticate/options", {
      method: "POST",
    });
    challengeId = opts.challengeId;
    options = opts.options;
  } catch {
    return { status: "error", message: "No passkey available" };
  }

  let response: PasskeyGetResult;
  try {
    response = await passkey.get(options as PasskeyGetRequest);
  } catch (err) {
    if (isUserCancelled(err)) return { status: "cancelled" };
    return { status: "error", message: describeNativePasskeyError(err) };
  }

  try {
    const result = await fetchJson("/api/auth/passkey/authenticate/verify", {
      method: "POST",
      body: { challengeId, response },
    });
    return { status: "signed-in", token: String(result.token ?? "") };
  } catch {
    return { status: "error", message: "Passkey sign-in failed" };
  }
}

/**
 * SIGN IN WITH APPLE, the app's half.
 *
 * The OS does the authenticating. What this file owns is the three things the
 * server cannot do for us:
 *
 *   1. THE NONCE. A fresh random value per attempt, sent to Apple and echoed
 *      back inside the identity token, which is what stops a token captured
 *      from one sign-in being replayed into another. The server refuses a
 *      token whose nonce it did not just issue a challenge for
 *      (webapp/lib/apple/identityToken.ts), so this is not optional.
 *   2. THE AUTHORIZATION CODE. Sent alongside the identity token because the
 *      server exchanges it for a refresh token, and that refresh token is the
 *      only thing account deletion can hand back to Apple — which Apple
 *      requires of every app that offers Sign in with Apple.
 *   3. CANCELLATION IS NOT AN ERROR. `signInAsync` rejects with
 *      `ERR_REQUEST_CANCELED` when the member dismisses the sheet, and a
 *      red "something went wrong" under the button for a deliberate dismissal
 *      is the most common way this flow is got wrong.
 *
 * Every dependency is injectable, so the whole flow is exercised in Jest
 * without a device: there is no Apple sheet on a simulator-less CI runner, and
 * `isAvailableAsync` answers false on Android by design.
 */
import * as AppleAuthentication from "expo-apple-authentication";
import {
  apiFetch,
  AppleLinkEmailResponseSchema,
  AppleSignInResponseSchema,
  type AppleLinkEmailResponse,
  type AppleSignInRequest,
  type AppleSignInResponse,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

/** Must match the route (webapp/app/api/auth/apple/route.ts). */
export const APPLE_SIGN_IN_PATH = "/api/auth/apple";
/** Must match webapp/app/api/auth/apple/link/route.ts. */
export const APPLE_LINK_EMAIL_PATH = "/api/auth/apple/link";

/** What `signInAsync` rejects with when the member dismisses the sheet. */
export const APPLE_CANCELLED_CODE = "ERR_REQUEST_CANCELED";

/**
 * A one-shot random value for this sign-in.
 *
 * `crypto.randomUUID` is 122 bits of randomness and is what the runtime gives
 * us when it has it. The fallback is the same one lib/live/workoutSave.ts
 * uses, and it is a DEGRADATION, not an equivalent: it is still unique per
 * attempt (which is what defeats replaying a captured token into a later
 * sign-in) but it is guessable, so it is the last resort and not the default.
 */
export function generateAppleNonce(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  try {
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // fall through
  }
  return `an-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function isAppleCancellation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === APPLE_CANCELLED_CODE) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes(APPLE_CANCELLED_CODE);
}

export type AppleSignInStatus =
  | "signed-in"
  /** The member dismissed Apple's sheet. Say nothing. */
  | "cancelled"
  /** Not an iOS 13+ device — the button should not have been rendered. */
  | "unavailable"
  | "error";

export interface AppleSignInResult {
  status: AppleSignInStatus;
  session?: AppleSignInResponse;
  message?: string;
}

export interface AppleSignInDeps {
  isAvailableAsync?: () => Promise<boolean>;
  signInAsync?: (
    options?: AppleAuthentication.AppleAuthenticationSignInOptions,
  ) => Promise<AppleAuthentication.AppleAuthenticationCredential>;
  /** POSTs the verified credential to Become. */
  postSignIn?: (body: AppleSignInRequest) => Promise<AppleSignInResponse>;
  makeNonce?: () => string;
}

function defaultPostSignIn(body: AppleSignInRequest): Promise<AppleSignInResponse> {
  return apiFetch(APPLE_SIGN_IN_PATH, AppleSignInResponseSchema, {
    method: "POST",
    body,
    baseUrl: WEBAPP_BASE_URL,
  });
}

/** Run the whole flow: Apple's sheet, then Become's session. */
export async function signInWithApple(
  deps: AppleSignInDeps = {},
): Promise<AppleSignInResult> {
  const isAvailable = deps.isAvailableAsync ?? AppleAuthentication.isAvailableAsync;
  const signIn = deps.signInAsync ?? AppleAuthentication.signInAsync;
  const post = deps.postSignIn ?? defaultPostSignIn;
  const nonce = (deps.makeNonce ?? generateAppleNonce)();

  try {
    if (!(await isAvailable())) return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await signIn({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce,
    });
  } catch (error) {
    if (isAppleCancellation(error)) return { status: "cancelled" };
    return {
      status: "error",
      message: "Apple couldn't complete the sign-in. Please try again.",
    };
  }

  if (!credential.identityToken) {
    // Nothing to verify: without the token the server cannot prove anything
    // about who this is, so there is no signing in on faith.
    return {
      status: "error",
      message: "Apple didn't return a sign-in token. Please try again.",
    };
  }

  try {
    const session = await post({
      identityToken: credential.identityToken,
      nonce,
      ...(credential.authorizationCode
        ? { authorizationCode: credential.authorizationCode }
        : {}),
      ...(credential.fullName
        ? {
            fullName: {
              givenName: credential.fullName.givenName,
              familyName: credential.fullName.familyName,
              nickname: credential.fullName.nickname,
            },
          }
        : {}),
    });
    return { status: "signed-in", session };
  } catch {
    return {
      status: "error",
      message: "We couldn't finish signing you in. Please try again.",
    };
  }
}

/**
 * Ask the server to send a sign-in link to the member's REAL address, on
 * behalf of the Apple account that was just created. The session that comes
 * back from polling belongs to their EXISTING account — see
 * webapp/lib/appleLink.ts.
 */
export function sendAppleEmailLink(
  token: string,
  email: string,
  fetchImpl?: (
    path: string,
    body: { email: string },
    bearer: string,
  ) => Promise<AppleLinkEmailResponse>,
): Promise<AppleLinkEmailResponse> {
  if (fetchImpl) return fetchImpl(APPLE_LINK_EMAIL_PATH, { email }, token);
  return apiFetch(APPLE_LINK_EMAIL_PATH, AppleLinkEmailResponseSchema, {
    method: "POST",
    body: { email },
    baseUrl: WEBAPP_BASE_URL,
    // The Apple session authorises moving its own identity somewhere else. It
    // is passed explicitly because it is NOT stored yet: storing it would
    // navigate the member into the empty account they are trying to escape.
    getToken: () => token,
  });
}

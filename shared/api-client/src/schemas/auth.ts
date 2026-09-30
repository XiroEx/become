import { z } from 'zod';
// The profile shape lives with the account routes that own it
// (schemas/account.ts) — it is the server's allow-list, not an auth concern.
// Imported rather than re-exported so `src/index.ts` exports it exactly once.
import { UserProfileSchema } from './account';

/** Billing state, as GET /api/auth/me projects it. Deliberately partial: the
 *  route selects only the three fields a client renders. */
export const UserSubscriptionSchema = z
  .object({
    status: z.string().optional(),
    currentPeriodEnd: z.string().nullish(),
    cancelAtPeriodEnd: z.boolean().optional(),
  })
  .passthrough();

export const UserSchema = z
  .object({
    _id: z.string(),
    email: z.string().email(),
    name: z.string().optional().nullable(),
    role: z.string().optional(),
    /** 'free' | 'plus'. Optional because legacy rows may not carry it. */
    tier: z.string().optional(),
    grandfathered: z.boolean().optional(),
    subscription: UserSubscriptionSchema.optional().nullable(),
    trainerId: z.string().optional().nullable(),
    savedPrograms: z.array(z.string()).optional(),
    profile: UserProfileSchema.optional().nullable(),
    onboardingCompleted: z.boolean().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

// Passthrough on the envelope too: the route may grow a sibling of `token`
// (it already grew `tier`/`grandfathered` inside `user`), and a store build
// that is months old must keep whatever it is sent rather than drop it.
export const MeResponseSchema = z
  .object({
    user: UserSchema,
    token: z.string().optional(),
  })
  .passthrough();

// GET /api/profile + PATCH /api/profile live in schemas/account.ts
// (ProfileResponseSchema), next to the allow-list they answer with.

export type User = z.infer<typeof UserSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ---------------------------------------------------------------------------
// Magic-link auth flow (mirrors webapp/app/api/auth/{send-link,check-session,
// verify-link}/route.ts). Used by the native login + verify screens.
// ---------------------------------------------------------------------------

export const AuthModeSchema = z.enum(['login', 'register']);
export type AuthMode = z.infer<typeof AuthModeSchema>;

/** POST /api/auth/send-link request body. */
export const SendLinkRequestSchema = z.object({
  email: z.string().email(),
  mode: AuthModeSchema,
  /** LEGACY. Sign-up asks for an email and nothing else — the name is collected
   *  during onboarding — so the server ignores this. Kept optional so an older
   *  native build that still sends one is not rejected by the schema. */
  name: z.string().optional(),
  /** Register mode REQUIRES `true`: the "I am at least 13 and agree to the
   *  Terms and Privacy Policy" tick. The server refuses a register without it
   *  (400) and stamps the agreement on the member at creation. */
  consent: z.boolean().optional(),
});

/** POST /api/auth/send-link 200 response. */
export const SendLinkResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  sessionId: z.string(),
});

/** POST /api/auth/check-session request body. */
export const CheckSessionRequestSchema = z.object({
  sessionId: z.string(),
});

/** POST /api/auth/check-session 200 response. `authToken` (the JWT) is present only when verified. */
export const CheckSessionResponseSchema = z.object({
  status: z.enum(['pending', 'verified', 'expired']),
  authToken: z.string().optional(),
});

/** POST /api/auth/verify-link request body. */
export const VerifyLinkRequestSchema = z.object({
  token: z.string(),
});

/** POST /api/auth/verify-link 200 response. `user` is a trimmed projection, not the full UserSchema. */
export const VerifyLinkResponseSchema = z.object({
  token: z.string(),
  user: z
    .object({
      id: z.string(),
      name: z.string().optional().nullable(),
      email: z.string().email(),
    })
    .passthrough(),
});

// ---------------------------------------------------------------------------
// The reviewer demo sign-in (webapp/app/api/auth/review-sign-in/route.ts).
//
// Become is passwordless, and an App Store / Play reviewer cannot read the
// inbox a magic link lands in. ONE designated demo account signs in with a
// fixed code from the runtime config, typed on the normal sign-in screen. The
// code works for that account only, is rate limited (429 + Retry-After) and is
// switchable off from config (404). See webapp/lib/reviewSignIn.ts.
// ---------------------------------------------------------------------------

/** POST /api/auth/review-sign-in request body. */
export const ReviewSignInRequestSchema = z.object({
  email: z.string().email(),
  code: z.string(),
});

/** POST /api/auth/review-sign-in 200 response — the same shape verify-link
 *  answers with, so the app stores the session the same way. */
export const ReviewSignInResponseSchema = z.object({
  token: z.string(),
  user: z
    .object({
      id: z.string(),
      name: z.string().optional().nullable(),
      email: z.string().email(),
    })
    .passthrough(),
});

export type ReviewSignInRequest = z.infer<typeof ReviewSignInRequestSchema>;
export type ReviewSignInResponse = z.infer<typeof ReviewSignInResponseSchema>;

// ---------------------------------------------------------------------------
// Sign in with Apple (webapp/app/api/auth/apple/*).
//
// The device talks to Apple; the server verifies what comes back. `nonce` is
// the value THIS sign-in generated and is not optional — without it a captured
// identity token replays. `authorizationCode` is optional on the wire only so
// an older build is not refused: without it the server has no refresh token to
// revoke when the account is deleted, which Apple requires of us.
// ---------------------------------------------------------------------------

/** Apple's `fullName`, which arrives on the FIRST authorization only. */
export const AppleFullNameSchema = z
  .object({
    givenName: z.string().nullish(),
    familyName: z.string().nullish(),
    nickname: z.string().nullish(),
  })
  .partial()
  .passthrough();

/** POST /api/auth/apple request body. */
export const AppleSignInRequestSchema = z.object({
  identityToken: z.string(),
  nonce: z.string(),
  authorizationCode: z.string().optional(),
  fullName: AppleFullNameSchema.nullish(),
});

/** POST /api/auth/apple 200 response — the same session shape verify-link
 *  answers with, plus what the app needs to decide whether to offer the
 *  "Already a member? Link your email" step. */
export const AppleSignInResponseSchema = z
  .object({
    token: z.string(),
    user: z
      .object({
        id: z.string(),
        name: z.string().optional().nullable(),
        // Deliberately NOT `.email()`: an Apple account may carry a relay
        // alias or the server's unroutable placeholder, and a session must
        // never be dropped by this client over the shape of an address it is
        // only going to display.
        email: z.string(),
      })
      .passthrough(),
    isNew: z.boolean().optional(),
    matchedBy: z.enum(['apple_sub', 'email', 'created']).optional(),
    /** True when the account is reachable only at an Apple relay alias (or a
     *  placeholder), so it may still belong to an existing member. */
    canLinkEmail: z.boolean().optional(),
  })
  .passthrough();

/** POST /api/auth/apple/link request body. */
export const AppleLinkEmailRequestSchema = z.object({
  email: z.string().email(),
});

/** POST /api/auth/apple/link 200 response. `sessionId` is polled with
 *  /api/auth/check-session exactly as a magic link is — the merge happens when
 *  the member taps the link, and the session that comes back belongs to their
 *  EXISTING account. */
export const AppleLinkEmailResponseSchema = z.object({
  success: z.boolean(),
  sessionId: z.string(),
  message: z.string(),
});

export type AppleFullName = z.infer<typeof AppleFullNameSchema>;
export type AppleSignInRequest = z.infer<typeof AppleSignInRequestSchema>;
export type AppleSignInResponse = z.infer<typeof AppleSignInResponseSchema>;
export type AppleLinkEmailRequest = z.infer<typeof AppleLinkEmailRequestSchema>;
export type AppleLinkEmailResponse = z.infer<typeof AppleLinkEmailResponseSchema>;

export type SendLinkRequest = z.infer<typeof SendLinkRequestSchema>;
export type SendLinkResponse = z.infer<typeof SendLinkResponseSchema>;
export type CheckSessionRequest = z.infer<typeof CheckSessionRequestSchema>;
export type CheckSessionResponse = z.infer<typeof CheckSessionResponseSchema>;
export type VerifyLinkRequest = z.infer<typeof VerifyLinkRequestSchema>;
export type VerifyLinkResponse = z.infer<typeof VerifyLinkResponseSchema>;

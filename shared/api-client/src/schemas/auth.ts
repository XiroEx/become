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

export type SendLinkRequest = z.infer<typeof SendLinkRequestSchema>;
export type SendLinkResponse = z.infer<typeof SendLinkResponseSchema>;
export type CheckSessionRequest = z.infer<typeof CheckSessionRequestSchema>;
export type CheckSessionResponse = z.infer<typeof CheckSessionResponseSchema>;
export type VerifyLinkRequest = z.infer<typeof VerifyLinkRequestSchema>;
export type VerifyLinkResponse = z.infer<typeof VerifyLinkResponseSchema>;

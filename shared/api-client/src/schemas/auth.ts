import { z } from 'zod';

export const UserProfileSchema = z
  .object({
    goal: z.string().optional(),
    trainingExperience: z.string().optional(),
    primaryFocus: z.string().optional(),
    birthYear: z.number().int().optional(),
  })
  .passthrough();

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

export const MeResponseSchema = z.object({
  user: UserSchema,
  token: z.string().optional(),
});

// GET /api/profile + PATCH /api/profile both return this shape. Mirrors
// webapp/app/api/profile/route.ts.
export const ProfileResponseSchema = z
  .object({
    profile: UserProfileSchema.nullish(),
    onboardingCompleted: z.boolean().optional(),
    name: z.string().nullable().optional(),
    email: z.string().optional(),
  })
  .passthrough();

export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

export type User = z.infer<typeof UserSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ---------------------------------------------------------------------------
// Magic-link auth flow (mirrors webapp/app/api/auth/{send-link,check-session,
// verify-link}/route.ts). Used by the native login + verify screens.
// ---------------------------------------------------------------------------

export const AuthModeSchema = z.enum(['login', 'register']);
export type AuthMode = z.infer<typeof AuthModeSchema>;

/** POST /api/auth/send-link request body. `name` is required server-side only for register mode. */
export const SendLinkRequestSchema = z.object({
  email: z.string().email(),
  mode: AuthModeSchema,
  name: z.string().optional(),
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

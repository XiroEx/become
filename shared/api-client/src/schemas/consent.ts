import { z } from 'zod';

/**
 * The two consents, which are two records with two versions and must never be
 * collapsed into one:
 *
 *   TERMS  — "I am at least <minimumAge> and I agree to the Terms and the
 *            Privacy Policy". Taken at sign-up and re-asked by the gate
 *            whenever the stored version is not the current one.
 *   AI     — "Become may send what I submit to its AI provider" (App Store
 *            Review Guideline 5.1.2(i)). Separate, optional, and revocable;
 *            it is never implied by the terms tick.
 *
 * Mirrors webapp/lib/consent.ts (ConsentStatus) and webapp/lib/aiConsent.ts
 * (AiConsentStatus).
 *
 * Routes: GET | POST /api/me/consent, GET | POST | DELETE /api/me/ai-consent.
 */

/**
 * The AI permission's state. Returned on its own by every verb of
 * /api/me/ai-consent, and nested under `ai` by /api/me/consent.
 *
 * `granted` and `decided` are the two questions a client actually asks, and
 * they are not the same one: `decided: false` means the member has never
 * answered the CURRENT ask (so raise the sheet), while `granted: false` with
 * `decided: true` is a member who said no and must not be nagged.
 */
export const AiConsentStatusSchema = z
  .object({
    /** The version of the ask the app is making right now. */
    version: z.string().optional(),
    /** The provider the permission names, so no client hardcodes it. */
    provider: z.string().optional(),
    /** May data be sent to the provider at this moment? */
    granted: z.boolean(),
    /** Has this member answered the current ask, either way? */
    decided: z.boolean(),
    decidedAt: z.string().nullish(),
    /** Set only when a permission that was actually HELD was withdrawn. */
    revokedAt: z.string().nullish(),
    /** The version they answered, which may be an older one. */
    decidedVersion: z.string().nullish(),
  })
  .passthrough();

/**
 * GET | POST /api/me/consent — the terms agreement, with the AI decision
 * riding along so one app load costs one round trip.
 *
 * `current` is the gate's answer: true when the STORED agreement is for
 * `termsVersion`. A member who agreed to v1.0.0 has not agreed to v1.1.0.
 */
export const ConsentStatusSchema = z
  .object({
    /** What the app is asking members to agree to right now. */
    termsVersion: z.string().optional(),
    /** The minimum age the tick attests to. */
    minimumAge: z.number().optional(),
    current: z.boolean(),
    /** The stored agreement, if any — possibly for an older version. */
    acceptedVersion: z.string().nullish(),
    acceptedAt: z.string().nullish(),
    ai: AiConsentStatusSchema.optional(),
  })
  .passthrough();

/**
 * POST /api/me/consent body. `accepted` must be a literal `true` — the server
 * 400s anything else, because an empty or mis-shaped request must never count
 * as consent — and the server stamps the version itself.
 *
 * `ai` is the second, separate tick: omitting it leaves any existing AI
 * decision exactly as it was, and `false` is recorded as a refusal rather than
 * ignored.
 */
export const ConsentAcceptRequestSchema = z.object({
  accepted: z.literal(true),
  ai: z.boolean().optional(),
});

/** Where an AI decision was made. Recorded on the row. */
export const AiConsentSourceSchema = z.enum(['prompt', 'settings']);

/**
 * POST /api/me/ai-consent body. `accepted` is a literal boolean — `false` is a
 * legitimate answer here (unlike the terms tick) so the member is not asked
 * again on every app open. Withdrawal is DELETE, not `accepted: false`.
 */
export const AiConsentRequestSchema = z.object({
  accepted: z.boolean(),
  source: AiConsentSourceSchema.optional(),
});

/**
 * The 403 every AI-dispatching route answers with when the permission is
 * missing (webapp/lib/aiConsent.ts → requireAiConsent). Carries the current
 * status so a client can raise the consent sheet without a second request.
 */
export const AiConsentRefusalSchema = z
  .object({
    error: z.string().optional(),
    /** A stable code for the refusal, next to the human-readable `error`. */
    reason: z.string().optional(),
    aiConsent: AiConsentStatusSchema.optional(),
  })
  .passthrough();

export type AiConsentStatus = z.infer<typeof AiConsentStatusSchema>;
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;
export type ConsentAcceptRequest = z.infer<typeof ConsentAcceptRequestSchema>;
export type AiConsentSource = z.infer<typeof AiConsentSourceSchema>;
export type AiConsentRequest = z.infer<typeof AiConsentRequestSchema>;
export type AiConsentRefusal = z.infer<typeof AiConsentRefusalSchema>;

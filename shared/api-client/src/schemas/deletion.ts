import { z } from 'zod';

/**
 * Account deletion — GET | DELETE | POST /api/me/account and
 * POST /api/me/account/restore.
 *
 * The path an App Store reviewer must be able to walk signed in, from inside
 * the app, without composing an email (Guideline 5.1.1(v)), and the one the
 * GDPR right to erasure and its US equivalents are answered by. Mirrors
 * webapp/lib/accountDeletion.ts and webapp/app/api/me/account/**.
 *
 * DELETE SCHEDULES, it does not erase: the record is stamped with a purge date
 * a fixed number of days out, and until then the member can undo it — from a
 * session (POST `{ cancel: true }`) or from the emailed link, which needs no
 * session at all because requesting deletion signs every device out.
 */

/** What the body must spell out before the server will schedule anything. Not
 *  a boolean: a stray `{}`, a retry or a truthy default cannot spell it. */
export const DELETE_CONFIRMATION = 'DELETE';

/** Where the request came from — recorded so "was it reachable in the store
 *  build?" is answerable from data. */
export const DeletionSourceSchema = z.enum(['web', 'ios', 'android', 'unknown']);

/** What every surface shows a member about a pending request. */
export const DeletionStatusSchema = z
  .object({
    pending: z.boolean(),
    requestedAt: z.string().nullish(),
    /** ISO. The last instant the restore link works, which is also the purge
     *  due date: while a request is pending those are the same clock. */
    restorableUntil: z.string().nullish(),
    /** Whole days left, floored at 0 — copy says "N days", never "0.4". */
    daysLeft: z.number().optional(),
    restoreWindowDays: z.number().optional(),
  })
  .passthrough();

/**
 * GET /api/me/account — the danger zone's read.
 *
 * `covers` and `exceptions` are the member-facing wording, served rather than
 * typed into each client: the web danger zone, the native danger zone, the
 * public /delete-account page and the confirmation email all render the same
 * list, and a client that wrote its own would eventually promise something the
 * purge does not do.
 */
export const AccountStatusResponseSchema = z
  .object({
    email: z.string().nullish(),
    deletion: DeletionStatusSchema,
    covers: z.array(z.string()).default([]),
    exceptions: z.array(z.string()).default([]),
    /** The confirmation phrase this server expects — read it rather than
     *  hardcoding DELETE_CONFIRMATION, so the two can never drift. */
    confirmation: z.string().optional(),
  })
  .passthrough();

/** DELETE /api/me/account body. */
export const DeleteAccountRequestSchema = z.object({
  confirm: z.literal(DELETE_CONFIRMATION),
  source: DeletionSourceSchema.optional(),
});

/**
 * DELETE /api/me/account 200. A second request while one is already pending
 * answers `alreadyPending: true` with the EXISTING dates — re-stamping would
 * slide the purge date forward and kill the restore link already in the
 * member's inbox.
 */
export const DeleteAccountResponseSchema = z
  .object({
    ok: z.boolean(),
    alreadyPending: z.boolean().optional(),
    /** Did the restore email go out? Best-effort: a mail failure does not undo
     *  the request, and the in-app banner can still cancel it. */
    emailed: z.boolean().optional(),
    /** Push registrations dropped at REQUEST time — web endpoints and native
     *  Expo tokens alike. A member who asked to be deleted stops hearing from
     *  us that minute. */
    pushSubscriptionsDropped: z.number().optional(),
    deletion: DeletionStatusSchema,
  })
  .passthrough();

/** DELETE /api/me/account 400 when the confirmation is missing or wrong. */
export const DeleteAccountRefusalSchema = z
  .object({
    error: z.string(),
    /** The phrase the server wanted. */
    confirmation: z.string().optional(),
  })
  .passthrough();

/** POST /api/me/account body — the change of mind, from a session that still
 *  works. */
export const CancelDeletionRequestSchema = z.object({
  cancel: z.literal(true),
});

/** POST /api/me/account 200 — answers with the CLEARED status. */
export const CancelDeletionResponseSchema = z
  .object({
    ok: z.boolean(),
    deletion: DeletionStatusSchema.optional(),
  })
  .passthrough();

/**
 * POST /api/me/account/restore body — UNAUTHENTICATED by design: `t` is an
 * HMAC over the exact `requestedAt` of the request being undone, and it is the
 * credential. Both values come out of the emailed link (`?u=…&t=…`).
 */
export const RestoreAccountRequestSchema = z.object({
  u: z.string(),
  t: z.string(),
});

/**
 * POST /api/me/account/restore. One refusal for every failure mode
 * (`{ ok: false, error: 'invalid_or_expired' }`, 400): an attacker must not be
 * able to tell "no such member" from "wrong MAC" from "already purged".
 */
export const RestoreAccountResponseSchema = z
  .object({
    ok: z.boolean(),
    deletion: DeletionStatusSchema.optional(),
    error: z.string().optional(),
  })
  .passthrough();

export type DeletionSource = z.infer<typeof DeletionSourceSchema>;
export type DeletionStatus = z.infer<typeof DeletionStatusSchema>;
export type AccountStatusResponse = z.infer<typeof AccountStatusResponseSchema>;
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;
export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponseSchema>;
export type DeleteAccountRefusal = z.infer<typeof DeleteAccountRefusalSchema>;
export type CancelDeletionRequest = z.infer<typeof CancelDeletionRequestSchema>;
export type CancelDeletionResponse = z.infer<typeof CancelDeletionResponseSchema>;
export type RestoreAccountRequest = z.infer<typeof RestoreAccountRequestSchema>;
export type RestoreAccountResponse = z.infer<typeof RestoreAccountResponseSchema>;

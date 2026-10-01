import { z } from 'zod';

/**
 * Allowance information returned in the start envelope.
 * Present when an AI route dispenses an allowance unit and/or follow-up ticket.
 */
export const AiAllowanceSchema = z
  .object({
    feature: z.string(),
    limit: z.number().nullish(),
    remaining: z.number().nullish(),
    resetsAt: z.string().nullish(),
    ticket: z.string().optional(),
  })
  .passthrough();

export type AiAllowance = z.infer<typeof AiAllowanceSchema>;
export const AllowanceSchema = AiAllowanceSchema;
export type Allowance = AiAllowance;

/**
 * Start envelope returned by POST /api/ai/* endpoints.
 *
 * Either returns `runId` for an asynchronous background graph run,
 * or immediate fields (`result`, `reply` / `text`, `fallback`, `unavailable`).
 */
export const AiStartEnvelopeSchema = z
  .object({
    ok: z.boolean().optional(),
    runId: z.string().optional(),
    allowance: AiAllowanceSchema.optional(),
    fallback: z.boolean().optional(),
    unavailable: z.boolean().optional(),
    reply: z.string().optional(),
    text: z.string().optional(),
    result: z.unknown().optional(),
    error: z.string().optional(),
  })
  .passthrough();

export type AiStartEnvelope = z.infer<typeof AiStartEnvelopeSchema>;
export const StartEnvelopeSchema = AiStartEnvelopeSchema;
export type StartEnvelope = AiStartEnvelope;

/**
 * Poll snapshot returned by GET /api/ai/run/{runId}.
 * The client polls until `status !== 'pending'`.
 */
export const AiPollSnapshotSchema = z
  .object({
    status: z.string(),
    ok: z.boolean().optional(),
    result: z.unknown().optional(),
    text: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

export type AiPollSnapshot = z.infer<typeof AiPollSnapshotSchema>;
export const PollSnapshotSchema = AiPollSnapshotSchema;
export type PollSnapshot = AiPollSnapshot;

import { z } from 'zod';

/**
 * GET /api/exercises/alternatives?slug=… — exercise swap suggestions.
 * Mirrors webapp/app/api/exercises/alternatives/route.ts +
 * lib/exerciseAlternatives.ts (AlternativeCandidate).
 */
export const AlternativeCandidateSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    score: z.number().optional(),
    reasons: z.array(z.string()).optional(),
    equipment: z.array(z.string()).optional(),
    category: z.string().optional(),
  })
  .passthrough();

export const ExerciseAlternativesResponseSchema = z
  .object({
    source: z
      .object({ slug: z.string(), name: z.string() })
      .passthrough()
      .optional(),
    alternatives: z.array(AlternativeCandidateSchema),
    total: z.number().optional(),
  })
  .passthrough();

export type AlternativeCandidate = z.infer<typeof AlternativeCandidateSchema>;
export type ExerciseAlternativesResponse = z.infer<
  typeof ExerciseAlternativesResponseSchema
>;

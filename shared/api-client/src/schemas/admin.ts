import { z } from 'zod';

/**
 * Admin read-only list responses for the native admin surfaces.
 *
 * NOTE on paths: there is no `/api/admin/exercises` route — the canonical
 * exercise list lives at GET /api/exercises ({ exercises, total }). Foods have a
 * dedicated admin route GET /api/admin/foods ({ foods, total, flaggedCount }).
 * Schemas are permissive (passthrough) since the native admin lists only need a
 * handful of fields for read-only display.
 */

export const ExerciseListItemSchema = z
  .object({
    slug: z.string().optional(),
    name: z.string(),
    category: z.string().optional(),
    videoUrl: z.string().nullable().optional(),
  })
  .passthrough();

/** GET /api/exercises → { exercises: [...], total }. */
export const ExercisesListResponseSchema = z
  .object({
    exercises: z.array(ExerciseListItemSchema).default([]),
    total: z.number().optional(),
  })
  .passthrough();

export const AdminFoodItemSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    brand: z.string().nullable().optional(),
    source: z.string().optional(),
    needsReview: z.boolean().optional(),
  })
  .passthrough();

/** GET /api/admin/foods → { foods: [...], total, flaggedCount }. */
export const AdminFoodsResponseSchema = z
  .object({
    foods: z.array(AdminFoodItemSchema).default([]),
    total: z.number().optional(),
    flaggedCount: z.number().optional(),
  })
  .passthrough();

export type ExerciseListItem = z.infer<typeof ExerciseListItemSchema>;
export type ExercisesListResponse = z.infer<typeof ExercisesListResponseSchema>;
export type AdminFoodItem = z.infer<typeof AdminFoodItemSchema>;
export type AdminFoodsResponse = z.infer<typeof AdminFoodsResponseSchema>;

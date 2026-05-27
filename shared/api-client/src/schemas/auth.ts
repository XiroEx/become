import { z } from 'zod';

export const UserProfileSchema = z
  .object({
    goal: z.string().optional(),
    trainingExperience: z.string().optional(),
    primaryFocus: z.string().optional(),
    birthYear: z.number().int().optional(),
  })
  .passthrough();

export const UserSchema = z
  .object({
    _id: z.string(),
    email: z.string().email(),
    name: z.string().optional().nullable(),
    role: z.string().optional(),
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

export type User = z.infer<typeof UserSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;

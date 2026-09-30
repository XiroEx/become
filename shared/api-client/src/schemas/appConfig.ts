import { z } from 'zod';

/**
 * GET /api/app/config (NP-041)
 *
 * App configuration for minimum-version gating and store updates.
 * Every field is optional so an unset value never breaks the app.
 */
export const AppPlatformConfigSchema = z.object({
  minVersion: z.string().optional(),
  latestVersion: z.string().optional(),
  storeUrl: z.string().optional(),
});

export type AppPlatformConfig = z.infer<typeof AppPlatformConfigSchema>;

export const AppConfigResponseSchema = z.object({
  ios: AppPlatformConfigSchema.optional().default({}),
  android: AppPlatformConfigSchema.optional().default({}),
});

export type AppConfigResponse = z.infer<typeof AppConfigResponseSchema>;

/**
 * Proof-of-life import from the shared/api-client/ package (P3-shared-api-client).
 *
 * The webapp re-exports a small set of shared types so individual routes can
 * import them via `@/lib/sharedApiTypes` and have one canonical zod-inferred
 * source. The matching schemas live in `../shared/api-client/src/schemas/` and
 * the Expo sibling consumes them too.
 *
 * This file exists primarily to keep the webapp coupled to the shared package
 * so it cannot silently drift. Adding a route that imports from
 * `@become/api-client` directly is equally fine.
 */
export type {
  ActiveProgram,
  ActiveProgramsResponse,
  MeResponse,
  MoodEntry,
  MoodHistoryResponse,
  ScheduleResponse,
  ScheduleSlot,
  User,
  WeightEntry,
  WeightHistoryResponse,
  WorkoutLog,
  WorkoutsListResponse,
} from '@become/api-client';

export { MeResponseSchema } from '@become/api-client';

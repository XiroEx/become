export * from './apiFetch';
export * from './errors';
export * from './tz';
export * from './schemas/auth';
export * from './schemas/account';
export * from './schemas/consent';
export * from './schemas/entitlements';
export * from './schemas/billing';
export * from './schemas/notifications';
export * from './schemas/widgets';
export * from './schemas/deletion';
export * from './schemas/weight';
export * from './schemas/mood';
export * from './schemas/mind';
export * from './schemas/becoming';
export * from './schemas/workouts';
export * from './schemas/schedule';
export * from './schemas/programs';
export * from './schemas/streak';
export * from './schemas/exercises';
export * from './schemas/nutrition';
export * from './schemas/chat';
export * from './schemas/admin';
export * from './schemas/checkin';
export * from './schemas/dashboard';
export * from './schemas/appConfig';

// `./errors` and `./schemas/consent` both name the AI-consent shapes: the
// classifier's hand-written interfaces (what `aiConsentRefusalFrom` RETURNS)
// and the zod-inferred contract types. Two `export *` carrying one name is
// TS2308 — "Module './errors' has already exported a member named
// 'AiConsentStatus'" — which failed `tsc --noEmit` for this package AND for the
// webapp, whose tsconfig compiles `../shared/api-client/src/**/*.ts`.
//
// The classifier's versions win the bare name, so the functions that return
// them keep a name to be called by; the schema side stays reachable exactly the
// way every other contract type is, as `z.infer<typeof AiConsentStatusSchema>`.
export type { AiConsentStatus, AiConsentRefusal } from './errors';

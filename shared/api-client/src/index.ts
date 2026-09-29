export * from './apiFetch';
export * from './errors';
export * from './tz';
export * from './schemas/auth';
export * from './schemas/account';
export * from './schemas/consent';
// `AiConsentStatus` and `AiConsentRefusal` are declared twice: as the
// classifier's internal shapes in ./errors and as the zod wire types in
// ./schemas/consent. Two `export *` of one name is TS2308 — "already exported
// a member named …" — which fails `npm run typecheck` for the whole package
// and takes every consumer's build with it. The wire types win, because they
// are what a RESPONSE is parsed into and what the rest of this package
// exports; ./errors keeps using its own declarations internally.
export type { AiConsentStatus, AiConsentRefusal } from './schemas/consent';
export * from './schemas/entitlements';
export * from './schemas/billing';
export * from './schemas/notifications';
export * from './schemas/widgets';
export * from './schemas/deletion';
export * from './schemas/weight';
export * from './schemas/mood';
export * from './schemas/workouts';
export * from './schemas/schedule';
export * from './schemas/programs';
export * from './schemas/streak';
export * from './schemas/exercises';
export * from './schemas/nutrition';
export * from './schemas/chat';
export * from './schemas/admin';

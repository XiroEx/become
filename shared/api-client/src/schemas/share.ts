// ===========================================================================
// POST /api/share — public, read-only snapshot links.
// Mirrors webapp/app/api/share/route.ts + webapp/components/share/ShareButton.tsx.
//
//   { kind: 'program',  programId }
//   { kind: 'workout',  programId, phase?, day }
//   { kind: 'session',  session: { title, focus?, exercises[] } }  // one-off/AI
//
// Answers `{ shareId, url }` where `url` is the RELATIVE public path
// (`/share/<shareId>`); the caller prefixes the web origin. The public page
// (`webapp/app/share/[shareId]/page.tsx`) needs no session — anyone with the
// link can open it signed out.
//
// A member can share only what they can open: catalogue programs, their own
// custom ones, and the ones shared with them (webapp/lib/programVisibility.ts
// — POST /api/share answers 404 otherwise). The native Share buttons are
// gated on the same rule client-side; the server stays the gate.
// ===========================================================================

import { z } from 'zod';

/** The three snapshot kinds the route accepts. */
export const ShareKindSchema = z.enum(['program', 'workout', 'session']);

export type ShareKind = z.infer<typeof ShareKindSchema>;

/**
 * The request body. `phase` is the web phase NAME (e.g. "Phase 1"), not a
 * 1-based number — the route matches `ph.phase !== phase` verbatim and skips
 * the filter when it is absent. `session.exercises` is a loose draft shape
 * the server sanitizes (`webapp/lib/share.ts#sanitizeWorkout`); it must hold
 * at least one named exercise or the route answers 400.
 */
export const ShareCreateRequestSchema = z.object({
  kind: ShareKindSchema,
  programId: z.string().optional(),
  day: z.string().optional(),
  phase: z.string().optional(),
  session: z
    .object({
      title: z.string(),
      focus: z.string().optional(),
      exercises: z.array(z.unknown()),
    })
    .passthrough()
    .optional(),
});

export type ShareCreateRequest = z.infer<typeof ShareCreateRequestSchema>;

/**
 * The 201 answer. `url` is RELATIVE (`/share/<shareId>`) — the web prefixes
 * `window.location.origin`, native prefixes the web origin
 * (`expo/lib/share/shareLink.ts#shareViewerUrl`).
 */
export const ShareCreateResponseSchema = z
  .object({
    shareId: z.string(),
    url: z.string(),
  })
  .passthrough();

export type ShareCreateResponse = z.infer<typeof ShareCreateResponseSchema>;

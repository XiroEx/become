/**
 * The Becoming — the pure spatial layout of the journey stage (NP-204).
 *
 * `layout.ts` is a COPY of `webapp/lib/becoming/layout.ts` (never edited
 * here; see its header), so the native stage places a week exactly where the
 * web does. `types.ts` mirrors the week model the copy type-imports.
 *
 * The root index re-exports the layout only: `types.ts` carries a `MindState`
 * that `mindContent.ts` also exports, and the mirror is for the copy's
 * benefit, not a second public model.
 */

export * from './layout'
export type * from './types'

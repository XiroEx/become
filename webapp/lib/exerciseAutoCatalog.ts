// Every exercise a program names exists in the catalog.
//
// Card: "Some program exercises don't exist in our data base or are not in
// our admin portal which means we can't upload videos or edit them."
//
// The hole was in dehydrateProgram: an exercise name the catalog didn't know
// became `slugify(name)` and was stored as `exerciseSlug`. Nothing created the
// document that slug pointed at, and nothing reported that it was missing —
// so the entry rendered with no video, no instructions, and no row in the
// admin portal to fix any of that on. Thirty-six references across the nine
// live programs were in that state when the card was written.
//
// So an unresolved name now MINTS the row instead of a dangling pointer to
// one. What gets written is whatever lib/exerciseInference.ts can read out of
// the name, plus the `needs-review` tag and — deliberately — no video, which
// is what lists it in the admin portal's "No Video" tab. That tab is the
// flag: it is the queue of exercises waiting for Jon to record something.
//
// Resolution is tried first and hard (lib/exerciseNameMatch.ts), because the
// best outcome is not a new row at all — it is discovering that "DB Hammer
// Curl" was the catalog's "Hammer Curl" all along, video included.

import ExerciseModel from '@/models/Exercise'
import { inferExerciseFields } from './exerciseInference'

/** Marks a row the app minted from a program rather than one an admin
 *  authored. Provenance only — the surfaced flag is the missing video. */
export const AUTO_CATALOG_TAG = 'needs-review'

/** The slug an exercise name gets when it has to be created. Same rule the
 *  admin create form uses, so a name typed in either place lands on one row. */
export function autoCatalogSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** The document body for a newly minted catalog row. Pure, so the shape is
 *  testable without a database. */
export function buildAutoCatalogExercise(name: string, slug: string) {
  return {
    slug,
    name: name.trim(),
    aliases: [] as string[],
    description: '',
    ...inferExerciseFields(name),
    instructions: [] as string[],
    cues: [] as string[],
    commonMistakes: [] as string[],
    tags: [AUTO_CATALOG_TAG],
    isActive: true,
    // Not a member's custom exercise: this belongs to the shared catalog the
    // program is built from, and has to be visible to everyone the program is.
    isCustom: false,
  }
}

/**
 * Creates the catalog row for `name` under `slug` unless one is already
 * there. Returns the slug either way, so callers can use it unconditionally.
 *
 * A concurrent save of the same program can race this; the unique index on
 * `slug` settles it and the loser treats E11000 as "already there", which it
 * is.
 */
export async function ensureCatalogExercise(name: string, slug: string): Promise<string> {
  if (!slug) return slug
  const existing = await ExerciseModel.exists({ slug })
  if (existing) return slug

  try {
    await ExerciseModel.create(buildAutoCatalogExercise(name, slug))
  } catch (error) {
    const code = (error as { code?: number })?.code
    if (code !== 11000) throw error
  }
  return slug
}

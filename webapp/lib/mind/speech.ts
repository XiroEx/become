// Builds the short first-person "speech" the user recites to themselves at the
// end of a session (the capstone move). Pure + deterministic for now — derived
// from the user's identity statement, chapter, and mission. THIS is the prime
// hook for the generative layer later: swap composeSpeech for an AI call that
// writes 3–4 sentences from the whole session, no scene changes needed.

import { IDENTITY_POOL, type SessionContext } from './moves'

const BECOMING_BY_CHAPTER = [
  'I get out of my own way.',
  "I see clearly where I'm going.",
  'I do the hard thing first.',
  'I protect what I am building.',
  'I shape the world around me.',
]

const RESOLVE = [
  "No excuses. No drift. Just the next move.",
  'Comfort is not the goal. Becoming is.',
  "I don't negotiate with the version of me that quits.",
  'I am not defined by how I feel — I am defined by what I do.',
]

function lowerFirst(s: string): string {
  return s.length ? s[0].toLowerCase() + s.slice(1) : s
}

/** 3–4 first-person sentences to be spoken aloud. */
export function composeSpeech(ctx: SessionContext): string[] {
  const seed = ctx.dayOfYear
  const identity =
    ctx.identityStatement && ctx.identityStatement.trim().length > 0
      ? ctx.identityStatement.trim().replace(/\.?$/, '.')
      : IDENTITY_POOL[seed % IDENTITY_POOL.length]

  const becoming = BECOMING_BY_CHAPTER[Math.min(4, Math.max(0, ctx.chapter - 1))]

  const mission = ctx.missionAction?.trim()
    ? `Today, I ${lowerFirst(ctx.missionAction.trim().replace(/\.?$/, ''))}.`
    : null

  const resolve = RESOLVE[seed % RESOLVE.length]

  return [identity, becoming, ...(mission ? [mission] : []), resolve]
}

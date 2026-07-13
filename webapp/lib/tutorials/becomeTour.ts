import type { TutorialDefinition } from '@redbtn/redtutorial'
import type { TutorialSection } from './sections/types'

// ── BECOME onboarding tour — section registry ────────────────────────────────
// The tour is assembled from per-route "sections" (one file each in ./sections).
// Each section contributes its own steps + the segment(s) that trigger them on a
// route, so sections can be authored independently and merged without conflicts.
// The engine plays each segment the first time the user hits its route, and the
// whole thing runs once per ACCOUNT (progress via /api/tutorial-progress).
//
// To add coverage for a new route: create ./sections/<name>.ts exporting a
// `TutorialSection`, then import it and add it to the SECTIONS array below.
// Bump `version` when the set changes materially so the expanded tour re-shows.

// ── SECTION IMPORTS (agents: add your import here) ───────────────────────────
import { coreSection } from './sections/core'
import { mindSection } from './sections/mind'
import { nutritionSection } from './sections/nutrition'

// ── SECTION REGISTRY (agents: add your section to this array) ────────────────
const SECTIONS: TutorialSection[] = [
  coreSection,
  mindSection,
  nutritionSection,
]

export const becomeOnboardingTour: TutorialDefinition = {
  id: 'become-onboarding',
  version: 3, // bumped: full-app section rewrite (dashboard cards → concept, per-route sections)
  title: 'Welcome to BECOME',
  steps: SECTIONS.flatMap((s) => s.steps),
  segments: Object.assign({}, ...SECTIONS.map((s) => s.segments)),
  // Anchors that may be absent (customized layouts, feature-gated UI, a nudge
  // that isn't showing right now) are skipped rather than stalling the tour.
  onMissingTarget: 'skip',
  canSkip: true,
  skipLabel: 'Skip tour',
  doneLabel: 'Got it',
}

export const becomeTutorials: TutorialDefinition[] = [becomeOnboardingTour]

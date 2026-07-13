import type { TutorialDefinition } from '@redbtn/redtutorial'

// A tutorial "section" is one route-scoped slice of the BECOME onboarding tour:
// its own step definitions + the segment(s) that trigger them on a route.
// The registry in ../becomeTour.ts flatMaps every section's steps and merges
// their segments into the single `become-onboarding` tour, so each section
// lives in its own file and can be authored independently (one file per route
// area — dashboard, nutrition, workout, programs, mind, …).
//
// Conventions:
//   - Step ids are globally unique — prefix them with the section (e.g.
//     'workout-browse', 'programs-detail-schedule').
//   - Segment keys are globally unique too (usually the section/route name).
//   - Use `onMissingTarget: 'skip'` semantics: anchors that may not be present
//     (customized layouts, feature-gated UI) are fine — the tour skips them.
export type TutorialSection = {
  steps: NonNullable<TutorialDefinition['steps']>
  segments: NonNullable<TutorialDefinition['segments']>
}

import type { TutorialTrigger } from '@redbtn/redtutorial'
import { becomeOnboardingTour } from './becomeTour'

// The tour segment whose route trigger matches `path`, so Help in the profile
// menu can replay just the current page's part of the tour. The most specific
// (longest) match wins: '/dashboard' would otherwise claim every page.
// Same rules as redTutorial's routeMatches, inlined so the profile menu never
// loads the ESM-only package at runtime (the CJS unit tests render it).
function routeMatches(pattern: string | RegExp, path: string): boolean {
  if (pattern instanceof RegExp) return pattern.test(path)
  if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1))
  const norm = (x: string) => (x.length > 1 && x.endsWith('/') ? x.slice(0, -1) : x)
  return norm(pattern) === norm(path)
}

export const TOUR_HELP_EVENT = 'become:tour-help'

export function segmentForPath(path: string | null): string | null {
  if (path == null) return null
  let best: { name: string; len: number } | null = null
  for (const [name, segment] of Object.entries(becomeOnboardingTour.segments ?? {})) {
    const triggers: TutorialTrigger[] = segment.trigger
      ? Array.isArray(segment.trigger) ? segment.trigger : [segment.trigger]
      : []
    for (const t of triggers) {
      if (t.type !== 'route' || !routeMatches(t.match, path)) continue
      const len = typeof t.match === 'string' ? t.match.length : 0
      if (!best || len > best.len) best = { name, len }
    }
  }
  return best?.name ?? null
}

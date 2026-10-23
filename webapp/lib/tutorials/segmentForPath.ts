import { routeMatches, type TutorialTrigger } from '@redbtn/redtutorial'
import { becomeOnboardingTour } from './becomeTour'

// The tour segment whose route trigger matches `path`, so Help in the profile
// menu can replay just the current page's part of the tour. The most specific
// (longest) match wins: '/dashboard' would otherwise claim every page.
export function segmentForPath(path: string | null): string | null {
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

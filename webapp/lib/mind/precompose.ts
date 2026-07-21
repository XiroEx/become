// Background pre-composition of the AI Mind session. Runs on APP OPEN (mounted
// in the dashboard shell) and as a fallback when the Mind tab opens with an
// empty cache (e.g. after a workout/nutrition log invalidated it). It is:
//   • cooldown-gated — at most one composition per 8h (timestamp stamped the
//     moment we attempt, so a slow/failed run can't re-fire), and
//   • silent — never surfaces in the global activity indicator (no toast), and
//   • non-blocking — callers don't await it to render; the deterministic plan
//     shows instantly and the cached AI plan is adopted when ready.

import { composeSessionAI } from './aiEngine'
import { MIND_AI_PLAN_KEY, AI_PLAN_TTL, readMindPlanCache } from './sessionCache'
import { getPathSession } from './sessionPath'
import { getUnlockedSystems } from '@/lib/mindXP'
import type { SessionContext } from './moves'
import type { MindState } from '@/lib/mindContent'
import type { MindSessionPlan } from './moves'

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}` }
}

function dayOfYear(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000)
}

function stamp(plan?: MindSessionPlan): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(MIND_AI_PLAN_KEY, JSON.stringify(plan ? { plan, ts: Date.now() } : { ts: Date.now() }))
  } catch { /* ignore */ }
}

// In-tab guard so concurrent callers (app-open warmer + a quick Mind open)
// don't both fire before the cooldown stamp lands.
let inFlight = false

/** Compose + cache the AI session if the 8h cooldown has lapsed. No-op otherwise. */
export async function precomposeMindSession(): Promise<void> {
  if (typeof window === 'undefined' || inFlight) return
  const cache = readMindPlanCache()
  if (cache && Date.now() - cache.ts < AI_PLAN_TTL) return // still fresh — skip
  inFlight = true
  // Start the cooldown immediately so failures/slow runs can't re-fire.
  stamp()
  try {
    const h = authHeaders()
    const [progressRes, sessionRes, stateRes, missionRes] = await Promise.all([
      fetch('/api/mind/progress', { headers: h }),
      fetch(`/api/mind/session?tz=${new Date().getTimezoneOffset()}`, { headers: h }),
      fetch('/api/mind/state', { headers: h }),
      fetch('/api/mind/mission', { headers: h }),
    ])
    if (!progressRes.ok) return
    const p = await progressRes.json()
    let recentState: MindState | null = null
    let lastBreathAt: number | null = null
    let recentKinds: string[] = []
    let missionAction: string | null = null
    if (sessionRes.ok) {
      const s = await sessionRes.json()
      lastBreathAt = typeof s.lastBreathAt === 'number' ? s.lastBreathAt : null
      recentKinds = Array.isArray(s.recentKinds) ? s.recentKinds : []
    }
    if (stateRes.ok) {
      const st = await stateRes.json()
      const last = Array.isArray(st.logs) && st.logs.length > 0 ? st.logs[0] : null
      if (last?.state) recentState = last.state as MindState
    }
    if (missionRes.ok) {
      const m = await missionRes.json()
      missionAction = m?.mission?.dailyAction ?? null
    }
    const ctx: SessionContext = {
      chapter: p.chapter ?? 1,
      unlockedSystems: p.unlockedSystems ?? getUnlockedSystems(p.chapter ?? 1),
      recentState,
      missionAction,
      identityStatement: p.vision?.identityStatement ?? null,
      recentKinds,
      // The directed 50-session path: this session's prescribed focus.
      pathFocus: getPathSession(p.mainSessionCount ?? 0),
      dayOfYear: dayOfYear(),
      // A fresh seed every composition — the day-of-year alone is stable within a
      // day, so back-to-back sessions were fed near-identical input and came out
      // near-identical. This varies the model's angle/modality mix run-to-run so
      // no two sessions feel the same (the prompt keys its variety off `seed`).
      seed: Math.floor(Math.random() * 1_000_000),
      now: Date.now(),
      lastBreathAt,
    }
    const plan = await composeSessionAI(ctx)
    if (plan) stamp(plan)
  } catch { /* best-effort; cooldown stamp already set */ } finally {
    inFlight = false
  }
}

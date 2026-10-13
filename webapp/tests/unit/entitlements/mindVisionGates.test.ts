// Run with: npm run test:file tests/unit/entitlements/mindVisionGates.test.ts
//
// THE GATE HAS TO BE WHERE THE MONEY IS SPENT.
//
// Both Mind paywalls shipped guarding the friendly route in front of the
// dispatch rather than the dispatch, and both were walked straight past on
// production with an isolated free account:
//
//   • mind-sessions was enforced on /api/mind/session (PUT persist, POST
//     complete). POST /api/ai/mind/session — the route that actually dispatches
//     the composer — had no tier guard at all, only requireSpendCap, which is a
//     ceiling and is OFF in production. A member locked at 10/10 got a runId.
//   • vision was enforced on POST/PATCH /api/mind/vision. POST /api/mind/journal
//     { system: 'vision' } (every protocol the Vision workspace saves) and POST
//     /api/ai/mind/flow { system: 'vision' } were open to a member whose
//     entitlements said vision { allowed: false }.
//
// A spend ceiling is not a paywall: it is identical for free and plus, refuses
// as 429 so the upgrade sheet cannot be raised from it, and defaults off. It can
// never stand in for a tier gate.
//
// The other half of this file is the anti-lockout rule: the FREE parts of Mind
// must stay free. Mood check-ins, wins, plain progress reads, the arsenal tools
// and the first 10 sessions are the product; gating one of those by accident is
// a worse bug than the one being fixed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const AI_SESSION = 'app/api/ai/mind/session/route.ts'
const AI_FLOW = 'app/api/ai/mind/flow/route.ts'
const AI_GENERATE = 'app/api/ai/mind/generate/route.ts'
const JOURNAL = 'app/api/mind/journal/route.ts'

// ─── The paid dispatch carries the feature's gate ────────────────────────────

test('the Mind composer is gated on mind-sessions, not merely ceilinged', () => {
  const src = read(AI_SESSION)
  assert.match(
    src,
    /requireAiFeature\(gate\.user, 'mind-sessions'\)/,
    'the route that dispatches the composer must take the same gate as the session it composes',
  )
  // The ceiling stays — it brakes the silent app-open precompose — but it is
  // no longer the only thing standing there.
  assert.match(src, /requireSpendCap\([^)]*'mind-composition'/)
})

test('every Vision door takes the vision gate', () => {
  // The feature is BINARY (FREE_LIMITS.vision.limit === 0), so every door is the
  // same decision: a free member may read what they have and write nothing.
  assert.match(read(AI_FLOW), /requireAiFeature\(gate\.user, 'vision'\)/)
  assert.match(read(AI_GENERATE), /requireAiFeature\(gate\.user, 'vision'\)/)
  assert.match(read(JOURNAL), /requireQuotaForUser\(auth\.userId!, gated\)/)
  assert.match(read(JOURNAL), /GATED_SYSTEMS = \{ vision: 'vision' \}/)

  // And the door that was already gated stays gated.
  const vision = read('app/api/mind/vision/route.ts')
  assert.match(vision, /requireFeature\(request, 'vision'\)/)
})

test('the gated surface is decided server-side, never from a client flag', () => {
  // `system` / `kind` are the route's own parsed, validated discriminators —
  // the same strings the dashboards are keyed on. A member cannot opt out of
  // being a vision request by omitting a field, because omitting it changes
  // which flow they get.
  assert.match(read(AI_FLOW), /VISION_SYSTEM\.has\(system\.trim\(\)\.toLowerCase\(\)\)/)
  assert.match(read(AI_GENERATE), /VISION_KINDS\.has\(kind\)/)
  // An allowlist of what IS gated, not a deny-list of what is not.
  assert.match(read(AI_FLOW), /const VISION_SYSTEM = new Set\(\['vision'\]\)/)
  assert.match(read(AI_GENERATE), /const VISION_KINDS = new Set\(\['vision'\]\)/)
})

// ─── Ordering inside the gated AI routes ─────────────────────────────────────

test('the tier gate runs before the ceiling and before the dispatch', () => {
  for (const file of [AI_SESSION, AI_FLOW, AI_GENERATE]) {
    const src = read(file)
    const auth = src.indexOf('requireAiUser')
    const tier = src.indexOf('requireAiFeature(')
    const cap = src.indexOf('requireSpendCap(')
    const trigger = src.indexOf('triggerOwnedRun(')

    assert.ok(auth >= 0 && tier > auth, `${file} gates before it knows who is asking`)
    assert.ok(tier < cap, `${file} burns a ceiling unit on a member the paywall already refused`)
    assert.ok(tier < trigger, `${file} dispatches before the gate — that is a meter, not a limit`)

    // A malformed body must still 400 for free.
    for (const m of src.matchAll(/status:\s*400/g)) {
      assert.ok(m.index! < tier, `${file} can 400 after gating`)
    }
    assert.match(src, /if \(!tier\.ok\) return tier\.response/, `${file} must bail on a refusal`)
  }
})

test('a refusal is the canonical 403 the upgrade sheet is built from', () => {
  // requireAiFeature returns requireQuotaForUser's response verbatim, which is
  // gateResponse(payloadFor(...)) — a 403 carrying BOTH `feature` and
  // `requiresTier`, the only shape lib/entitlementsClient.ts#gateFrom accepts.
  // Anything else and a locked surface reads to the member as an outage.
  const src = read('lib/ai/allowance.ts')
  const fn = src.slice(src.indexOf('export async function requireAiFeature'))
  assert.match(fn, /requireQuotaForUser\(user\.userId, feature/)
  assert.match(fn, /gate\.ok \? \{ ok: true \} : \{ ok: false, response: gate\.response \}/)
})

test('requireAiFeature cannot be handed a feature that spends a unit', () => {
  // A windowed allowance is CHARGED when it is checked, so it must go through
  // requireAiAllowance, which owns the refund and the follow-up ticket. The type
  // makes the mistake unrepresentable rather than a runtime surprise.
  const src = read('lib/ai/allowance.ts')
  assert.match(src, /export type NonWindowFeature = \{/)
  assert.match(src, /extends 'window' \? never : K/)
  assert.match(src, /feature: NonWindowFeature/)
  // The compile-time half lives in tests/unit/entitlements/nonWindowFeature.ts,
  // which tsc type-checks with the rest of the project.
  assert.ok(fs.existsSync(path.join(ROOT, 'tests/unit/entitlements/nonWindowFeature.ts')))
})

// ─── The free half of Mind stays free ────────────────────────────────────────

test('the free Mind surfaces are not gated by anything', () => {
  // Mood check-ins, wins, plain progress reads and the arsenal tools are the
  // product. The first 10 sessions are too — that gate lives in
  // /api/mind/session and nowhere else.
  const OPEN = [
    'app/api/mind/state/route.ts',
    'app/api/mind/wins/route.ts',
    'app/api/mind/summary/route.ts',
    'app/api/mind/progress/route.ts',
    'app/api/mind/progress/xp/route.ts',
    'app/api/mind/progress/introduce/route.ts',
    'app/api/mind/content/daily/route.ts',
    'app/api/mind/identity/route.ts',
    'app/api/mind/mission/route.ts',
    'app/api/mind/discipline/route.ts',
    'app/api/mind/non-negotiables/route.ts',
    // Coaching and the arsenal picker are ceilinged, never priced.
    'app/api/ai/mind/coach/route.ts',
    'app/api/ai/mind/suggestions/route.ts',
  ]
  for (const rel of OPEN) {
    const src = read(rel)
    assert.doesNotMatch(src, /requireFeature\(/, `${rel} must not be tier-gated`)
    assert.doesNotMatch(src, /requireQuota\w*\(/, `${rel} must not be quota-gated`)
    assert.doesNotMatch(src, /requireAiFeature\(/, `${rel} must not be tier-gated`)
  }
})

test('the deterministic composers stay open — they are what a capped member falls back to', () => {
  // Every AI Mind surface degrades to an authored/deterministic path. Gating
  // those would turn a soft paywall into a dead end for exactly the people who
  // hit it, and /api/generate/* is pinned permanently unmetered elsewhere.
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, out)
      else if (entry.name === 'route.ts') out.push(full)
    }
    return out
  }
  for (const file of walk(path.join(ROOT, 'app/api/generate'))) {
    const src = fs.readFileSync(file, 'utf8')
    const rel = path.relative(ROOT, file)
    assert.doesNotMatch(src, /requireAiFeature\(/, `${rel} must stay open`)
    assert.doesNotMatch(src, /requireQuota\w*\(/, `${rel} must stay open`)
  }
})

test('journal reads stay open, and only the paid system is gated on write', () => {
  const src = read(JOURNAL)
  const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
  assert.doesNotMatch(get, /requireQuotaForUser\(/, 'reading back what you wrote is never gated')

  // 'session' is what EVERY completed Mind session writes (SessionPlayer), so a
  // gate there would break the free member's own reflection.
  assert.doesNotMatch(src, /session:\s*'/, 'the session reflection must not be a gated system')
  assert.match(read('components/mind/session/SessionPlayer.tsx'), /system: 'session'/)
})

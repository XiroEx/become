// Run with: npx tsx --test tests/unit/nadine-fixes.test.ts
//
// The four remaining items from the Nadine persona run.

import { test, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getXpToNextChapter } from '../../lib/mindXP'
import { calorieAdjustment, MACRO_CALC_VERSION } from '../../lib/nutrition/tdee'

// ── #2 Negative progress percentage ─────────────────────────────────────────

describe('chapter progress never renders negative', () => {
  it('a member sitting above their XP shows 0%, not a negative', () => {
    // Reachable from the Mind intake: "building momentum" -> chapter 2 at 0 XP,
    // "ready for the next level" -> chapter 3 at 0 XP. These rendered as -50%
    // and -100% on The Becoming.
    assert.equal(getXpToNextChapter(2, 0)!.pct, 0)
    assert.equal(getXpToNextChapter(3, 0)!.pct, 0)
  })

  it('clamps at both ends across every chapter and XP value', () => {
    for (let chapter = 1; chapter <= 5; chapter++) {
      for (const xp of [-500, 0, 10, 75, 200, 499, 5000]) {
        const r = getXpToNextChapter(chapter, xp)
        if (!r) continue
        assert.ok(r.pct >= 0 && r.pct <= 100, `ch${chapter}/${xp}xp -> ${r.pct}%`)
        assert.ok(r.current >= 0, `ch${chapter}/${xp}xp -> current ${r.current}`)
      }
    }
  })

  it('still reports real progress in between', () => {
    // Chapter 1 spans 0->50 XP, so 25 XP is genuinely half way.
    assert.equal(getXpToNextChapter(1, 25)!.pct, 50)
  })
})

// ── #4 The calorie-direction label must match what is applied ───────────────

describe('direction card states the adjustment actually applied', () => {
  const ONBOARDING = readFileSync(join(process.cwd(), 'app/onboarding/page.tsx'), 'utf8')

  it('renders a computed sub-label, not the static one', () => {
    assert.match(ONBOARDING, /const applied = targets \? calorieAdjustment\(targets\.tdee, value\) : null/)
    assert.match(ONBOARDING, /\{subLabel\}/)
  })

  it('Nadine is told −412, which is what she gets', () => {
    // Her TDEE is 2060; the flat 500 would be a 24% cut so the 20% cap binds.
    assert.equal(calorieAdjustment(2060, 'lose'), -412)
  })

  it('a large member still sees the flat cap, because it is what applies', () => {
    assert.equal(calorieAdjustment(3400, 'lose'), -500)
    assert.equal(calorieAdjustment(3400, 'gain'), 300)
    assert.equal(calorieAdjustment(2060, 'maintain'), 0)
  })
})

// ── #5 Enrolling from the recommendation is offered, not forced ────────────

describe('program recommendation can be acted on', () => {
  const ONBOARDING = readFileSync(join(process.cwd(), 'app/onboarding/page.tsx'), 'utf8')

  it('the review step offers an enrol action', () => {
    assert.match(ONBOARDING, /data-testid="recommended-program-enroll"/)
    assert.match(ONBOARDING, /onEnroll=\{enrolInRecommended\}/)
    assert.match(ONBOARDING, /'\/api\/programs\/enroll'/)
  })

  it('enrolling is optional and a failure never blocks finishing', () => {
    // The enrol call swallows its own errors rather than failing onboarding.
    assert.match(ONBOARDING, /if \(res\.ok\) setEnrolled\(true\)/)
  })

  it('the card stays read-only where no handler is supplied', () => {
    // Step 1 shows it purely as information; only the review step can act.
    assert.match(ONBOARDING, /\{onEnroll && \(/)
  })
})

// ── #6 Dashboard read paths must not 500 on unrelated bad history ──────────

describe('dashboard reads survive invalid legacy data', () => {
  const TILES = readFileSync(join(process.cwd(), 'app/api/dashboard/tiles/route.ts'), 'utf8')
  const LAYOUT = readFileSync(join(process.cwd(), 'app/api/dashboard/layout/route.ts'), 'utf8')

  it('tiles writes its own field instead of saving the whole document', () => {
    assert.doesNotMatch(TILES, /await progress\.save\(\)/, 'save() validates unrelated history')
    assert.match(TILES, /UserProgress\.updateOne\(/)
    assert.match(TILES, /tileLastShownAt write failed \(non-fatal\)/)
  })

  it('the layout migration is non-fatal too', () => {
    assert.doesNotMatch(LAYOUT, /await progress\.save\(\)/)
    assert.doesNotMatch(LAYOUT, /await existing\.save\(\)/)
    assert.match(LAYOUT, /dashboardLayout migration write failed \(non-fatal\)/)
  })
})

// ── #7 Pre-fix targets self-heal ───────────────────────────────────────────

describe('stale targets are brought up to date on read', () => {
  const GOALS = readFileSync(join(process.cwd(), 'app/api/nutrition/goals/route.ts'), 'utf8')

  it('the macro maths carries a version', () => {
    // Bumped to 3 when the calorie adjustment started following the member's
    // chosen pace instead of the flat -500/+300 default — see tdee.ts.
    assert.equal(MACRO_CALC_VERSION, 3)
  })

  it('a row from an older version is recomputed', () => {
    // The version check is gated on `!broken` (and, since the adaptive-targets
    // change, `!weightDrifted` too). A row whose calories and macros contradict
    // each other is repaired on read EVEN at the current version — the stamp
    // records which formula produced a row, not whether that row adds up. A
    // real member's row read 2,214 cal against 2,317 cal of macros while
    // carrying the current version, so the old early-return skipped it forever.
    assert.match(GOALS, /const versionStale = \(goals\.calcVersion as number \| undefined\) !== MACRO_CALC_VERSION/)
    assert.match(GOALS, /if \(!broken && !versionStale && !weightDrifted\) return null/)
    assert.match(GOALS, /computeNutritionTargets\(/)
  })

  it('logged weight drifting from the rolling average also triggers a recompute', () => {
    // The adaptive part: targets no longer sit frozen at the onboarding weight
    // forever just because the macro formula hasn't changed and the row is
    // internally coherent — a real move in the trend weight is a third reason
    // to recompute, alongside a version bump and a broken row.
    assert.match(GOALS, /const weightDrifted = needsWeightRecalc\(goals\.calcWeightKg as number \| undefined, trendKg\)/)
    assert.match(GOALS, /trendWeightKg\(series, new Date\(\)\)/)
    assert.match(GOALS, /calcWeightKg: trendKg/)
  })

  it('an incoherent row is repaired on read regardless of version', () => {
    assert.match(GOALS, /const broken = stored\.calories > 0 && !isCoherent\(stored\)/)
    assert.match(GOALS, /reconcileGoals\(stored, true\)/)
  })

  it("hand-typed numbers are never recomputed", () => {
    assert.match(GOALS, /if \(goals\.macroPreset === 'custom'\) return null/)
  })

  it('missing body stats leave the old row alone rather than guessing', () => {
    assert.match(GOALS, /if \(!p\?\.currentWeightKg \|\| !p\.heightCm \|\| !p\.age \|\| !p\.biologicalSex\) return null/)
  })

  it('a refresh failure serves what was already there', () => {
    assert.match(GOALS, /nutrition target refresh failed \(non-fatal\)/)
    assert.match(GOALS, /NextResponse\.json\(refreshed \?\? goals\)/)
  })

  it('writes stamp the version so the refresh runs once, not every read', () => {
    assert.match(GOALS, /updateData\.calcVersion = MACRO_CALC_VERSION/)
  })
})

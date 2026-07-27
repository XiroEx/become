import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  activityFromTrainingDays,
  calcTdee,
  computeNutritionTargets,
  directionForGoal,
  waterGoalOz,
} from '@/lib/nutrition/tdee'
import { rankPrograms, scoreProgram } from '@/lib/programMatch'
import type { ProgramLike } from '@/lib/programMatch'

// A 30 y/o male, 5'10" (178 cm), 185 lb (83.9 kg), training 4 days a week.
// Worked by hand so this test cross-checks the formula rather than mirroring it:
//   BMR  = 10(83.9) + 6.25(178) − 5(30) + 5 = 1806.5
//   TDEE = 1806.5 × 1.55 (moderate, 3-4 days) = 2800.075 → 2800
const REFERENCE = {
  currentWeightKg: 83.9,
  heightCm: 178,
  age: 30,
  biologicalSex: 'male' as const,
  weeklyAvailability: 4,
}

describe('tdee', () => {
  it('computes Mifflin-St Jeor TDEE from body stats + training days', () => {
    assert.equal(activityFromTrainingDays(4), 'moderate')
    assert.equal(calcTdee(REFERENCE, 'moderate'), 2800)
  })

  it('buckets training days onto activity multipliers', () => {
    assert.equal(activityFromTrainingDays(0), 'sedentary')
    assert.equal(activityFromTrainingDays(2), 'light')
    assert.equal(activityFromTrainingDays(3), 'moderate')
    assert.equal(activityFromTrainingDays(5), 'active')
    assert.equal(activityFromTrainingDays(6), 'very_active')
    assert.equal(activityFromTrainingDays(undefined), 'moderate')
  })

  it('returns null rather than guessing when body stats are incomplete', () => {
    assert.equal(computeNutritionTargets({ ...REFERENCE, age: undefined }), null)
    assert.equal(computeNutritionTargets({ ...REFERENCE, heightCm: undefined }), null)
    assert.equal(computeNutritionTargets({ ...REFERENCE, currentWeightKg: undefined }), null)
    // "Prefer not to say" has no Mifflin-St Jeor constant — we must not invent one.
    assert.equal(
      computeNutritionTargets({ ...REFERENCE, biologicalSex: 'prefer_not_to_say' }),
      null
    )
  })

  it('applies the deficit for a lose-weight member', () => {
    const t = computeNutritionTargets({ ...REFERENCE, goals: ['lose_weight'] })
    assert.ok(t)
    assert.equal(t.tdee, 2800)
    assert.equal(t.direction, 'lose')
    assert.equal(t.calories, 2300)          // 2800 − 500
    assert.equal(t.protein, 185)            // 184.97 lb × 1.0 g/lb
    assert.equal(t.fats, 64)                // 2300 × 0.25 / 9
    assert.equal(t.carbs, 246)              // (2300 − 740 − 576) / 4
    // Macros must actually reconstruct the calorie target.
    assert.ok(Math.abs(t.protein * 4 + t.carbs * 4 + t.fats * 9 - t.calories) <= 6)
  })

  it('applies the surplus for a gain-muscle member', () => {
    const t = computeNutritionTargets({ ...REFERENCE, goals: ['gain_muscle'] })
    assert.ok(t)
    assert.equal(t.direction, 'gain')
    assert.equal(t.calories, 3100)          // 2800 + 300
    assert.equal(t.protein, 166)            // 184.97 × 0.9
  })

  it('holds at maintenance for maintain / general health / performance', () => {
    for (const goal of ['maintain', 'general_health', 'improve_performance'] as const) {
      const t = computeNutritionTargets({ ...REFERENCE, goals: [goal] })
      assert.ok(t, `${goal} should produce targets`)
      assert.equal(t.direction, 'maintain')
      assert.equal(t.calories, 2800)
    }
  })

  it('lets an explicit direction override the goal-derived default', () => {
    // "Build muscle" does not have to mean a surplus — recomp is a real choice,
    // and the onboarding step lets the member say so.
    const t = computeNutritionTargets({ ...REFERENCE, goals: ['gain_muscle'], direction: 'maintain' })
    assert.ok(t)
    assert.equal(t.calories, 2800)
    assert.equal(t.protein, 166) // still the higher muscle-seeking protein target
  })

  it('raises protein when muscle gain is a SECONDARY goal', () => {
    const single = computeNutritionTargets({ ...REFERENCE, goals: ['maintain'] })
    const paired = computeNutritionTargets({ ...REFERENCE, goals: ['maintain', 'gain_muscle'] })
    assert.ok(single && paired)
    assert.equal(single.calories, paired.calories)
    assert.ok(paired.protein > single.protein, 'secondary goal should move the protein target')
  })

  it('never recommends below a 1200 calorie floor', () => {
    const t = computeNutritionTargets({
      currentWeightKg: 45,
      heightCm: 150,
      age: 70,
      biologicalSex: 'female',
      goals: ['lose_weight'],
      weeklyAvailability: 1,
    })
    assert.ok(t)
    assert.equal(t.calories, 1200)
  })

  it('maps goals to their default calorie direction', () => {
    assert.equal(directionForGoal('lose_weight'), 'lose')
    assert.equal(directionForGoal('gain_muscle'), 'gain')
    assert.equal(directionForGoal('maintain'), 'maintain')
    assert.equal(directionForGoal(undefined), 'maintain')
  })

  it('scales the water goal to bodyweight', () => {
    assert.equal(waterGoalOz(83.9), 92) // 185 lb / 2
    assert.equal(waterGoalOz(undefined), 96)
  })

  it('produces a goalType the NutritionGoal schema accepts', () => {
    // The onboarding seed used to post the raw fitnessGoal ('lose_weight'),
    // which failed the enum validator on upsert — so the doc was never written
    // and members saw the 2000/150/200/65 defaults until they hit Save.
    const allowed = ['lose', 'maintain', 'gain']
    for (const goal of ['lose_weight', 'gain_muscle', 'maintain', 'improve_performance', 'general_health'] as const) {
      const t = computeNutritionTargets({ ...REFERENCE, goals: [goal] })
      assert.ok(t)
      assert.ok(allowed.includes(t.direction), `${goal} → ${t.direction} is not a valid goalType`)
    }
  })
})

// ── Program matching ──────────────────────────────────────────────────────────

const CATALOG: ProgramLike[] = [
  {
    program_id: 'fat-loss-foundation',
    name: 'BECOME — 12 Week Fat-Loss Foundation Program',
    goal: 'Build foundational strength, lose fat, improve conditioning.',
    target_user: 'Beginner to Intermediate',
    training_days_per_week: 4,
    duration_weeks: 12,
    tags: ['Fat Loss', 'Strength', 'Conditioning', 'Foundation', 'Full Body'],
  },
  {
    program_id: 'jon-don-split',
    name: 'The Jon Don Split',
    goal: 'Build muscle mass, improve strength through progressive overload.',
    target_user: 'Intermediate',
    training_days_per_week: 5,
    duration_weeks: 4,
    tags: ['Hypertrophy', 'Split Training', '5 Day', 'Muscle Building', 'Push Pull Legs'],
  },
  {
    program_id: 'no-excuses',
    name: 'No Excuses: At-Home Transformation',
    goal: 'Fat loss, conditioning, functional strength, core stability',
    target_user: 'Beginner to Intermediate',
    training_days_per_week: 4,
    duration_weeks: 4,
    tags: ['Home Workout', 'No Equipment', 'Bodyweight', 'Transformation'],
  },
  {
    program_id: 'db-only',
    name: 'DB Only: Total Transformation',
    goal: 'Hypertrophy, fat loss, strength, conditioning',
    target_user: 'Beginner to Intermediate',
    training_days_per_week: 4,
    duration_weeks: 4,
    tags: ['Dumbbells Only', 'Home Workout', 'Minimal Equipment', 'Transformation'],
  },
]

const top = (input: Parameters<typeof rankPrograms>[1]) =>
  rankPrograms(CATALOG, input)[0].program.program_id

describe('programMatch', () => {
  it('recommends a muscle program for a muscle goal', () => {
    assert.equal(
      top({ goals: ['gain_muscle'], experienceLevel: 'intermediate', weeklyAvailability: 5, equipmentAccess: ['full_gym'] }),
      'jon-don-split'
    )
  })

  it('recommends a fat-loss program for a fat-loss goal', () => {
    assert.equal(
      top({ goals: ['lose_weight'], experienceLevel: 'beginner', weeklyAvailability: 4, equipmentAccess: ['full_gym'] }),
      'fat-loss-foundation'
    )
  })

  it('changes the recommendation when equipment changes', () => {
    const base = { goals: ['lose_weight'] as const, experienceLevel: 'beginner' as const, weeklyAvailability: 4 }
    assert.equal(top({ ...base, equipmentAccess: ['full_gym'] }), 'fat-loss-foundation')
    assert.equal(top({ ...base, equipmentAccess: ['none'] }), 'no-excuses')
    assert.equal(top({ ...base, equipmentAccess: ['dumbbells'] }), 'db-only')
  })

  it('penalises programs that need more days than the member has', () => {
    const fits = scoreProgram(CATALOG[1], { goals: ['gain_muscle'], weeklyAvailability: 5 })
    const doesnt = scoreProgram(CATALOG[1], { goals: ['gain_muscle'], weeklyAvailability: 2 })
    assert.ok(fits.score > doesnt.score, 'a 5-day program should rank lower for a 2-day member')
  })

  it('weights the PRIMARY goal above the secondary ones', () => {
    const primaryMuscle = scoreProgram(CATALOG[1], { goals: ['gain_muscle', 'lose_weight'] })
    const secondaryMuscle = scoreProgram(CATALOG[1], { goals: ['lose_weight', 'gain_muscle'] })
    assert.ok(
      primaryMuscle.score > secondaryMuscle.score,
      'the same program should score higher when its goal is primary'
    )
  })

  it('lets a secondary goal break a tie between two programs', () => {
    // With only "lose weight" the foundation program wins on level fit; adding
    // "build muscle" as a second goal must still be visible in the scoring.
    const withoutSecondary = scoreProgram(CATALOG[1], { goals: ['lose_weight'] })
    const withSecondary = scoreProgram(CATALOG[1], { goals: ['lose_weight', 'gain_muscle'] })
    assert.ok(withSecondary.score > withoutSecondary.score)
  })

  it('explains every match in member-facing language', () => {
    const { reasons } = scoreProgram(CATALOG[1], {
      goals: ['gain_muscle'],
      experienceLevel: 'intermediate',
      weeklyAvailability: 5,
      equipmentAccess: ['full_gym'],
    })
    assert.ok(reasons.length >= 3, 'a strong match should justify itself')
    assert.ok(reasons.some(r => r.includes('primary goal')))
    assert.ok(reasons.some(r => r.includes('intermediate')))
    assert.ok(reasons.some(r => r.includes('5 days a week')))
  })

  it('is deterministic — the same answers always yield the same top pick', () => {
    const input = { goals: ['general_health'] as const, weeklyAvailability: 4 }
    const runs = new Set(Array.from({ length: 5 }, () => top(input)))
    assert.equal(runs.size, 1)
  })
})

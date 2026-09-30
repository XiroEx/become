// Run with: npm run test:file tests/unit/nutritionMacros.test.ts
//
// Macro splits used to be: protein from g/lb, fat a flat 25%, carbs whatever was
// left. Carbs absorbed the entire remainder, so a 6'5" member on a surplus was
// handed 453g of carbs (56% of intake) while protein sat at 19%. The bigger the
// calorie target, the worse it got.
//
// Every macro is now an explicit share of calories, with protein bounded by
// bodyweight. These tests exist to stop a number like 453 shipping again.

import { test, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  calorieAdjustment,
  computeNutritionTargets,
  splitForPreset,
  recommendedPresetForGoal,
  recommendPreset,
  gramsFromPercent,
  percentFromGrams,
  splitFromGrams,
  deliveredSplit,
  MACRO_PRESET_LABELS,
  type FitnessGoal,
  MACRO_PRESET_SPLITS,
  RECOMMENDED_SPLITS,
  type MacroPreset,
  type NutritionDirection,
  type TargetsInput,
} from '../../lib/nutrition/tdee'
import { KG_PER_LB } from '../../lib/goals/pace'

/** The member from the bug report: 6'5", 175 lb, gaining. */
const ADRIAN: TargetsInput = {
  currentWeightKg: 79.4,
  heightCm: 195.6,
  age: 25,
  biologicalSex: 'male',
  goals: ['gain_muscle'],
  direction: 'gain',
  activityLevel: 'moderate',
}

const PRESETS: MacroPreset[] = ['recommended', 'balanced', 'high_protein', 'low_carb']
const DIRECTIONS: NutritionDirection[] = ['lose', 'maintain', 'gain']

test('every split adds up to 100%', () => {
  for (const s of [...Object.values(MACRO_PRESET_SPLITS), ...Object.values(RECOMMENDED_SPLITS)]) {
    assert.equal(s.protein + s.carbs + s.fats, 100, `${JSON.stringify(s)} does not total 100`)
  }
})

test('REGRESSION: the 453g carb case is gone', () => {
  const t = computeNutritionTargets({ ...ADRIAN })!
  assert.ok(t.carbs < 400, `carbs still ${t.carbs}g`)
  assert.ok(t.split.carbs <= 50, `carbs still ${t.split.carbs}% of intake`)
  assert.ok(t.split.protein >= 25, `protein only ${t.split.protein}% of intake`)
})

test('a lower-carb option genuinely exists for someone who wants it', () => {
  const rec = computeNutritionTargets({ ...ADRIAN, macroPreset: 'recommended' })!
  const low = computeNutritionTargets({ ...ADRIAN, macroPreset: 'low_carb' })!
  assert.ok(low.carbs < rec.carbs * 0.7, `low_carb ${low.carbs}g vs recommended ${rec.carbs}g`)
})

test('macros always reconstruct the calorie target', () => {
  for (const preset of PRESETS) {
    for (const direction of DIRECTIONS) {
      const t = computeNutritionTargets({ ...ADRIAN, direction, macroPreset: preset })!
      const fromMacros = t.protein * 4 + t.carbs * 4 + t.fats * 9
      const drift = Math.abs(fromMacros - t.calories)
      assert.ok(drift <= 12, `${preset}/${direction} drifts ${drift} cal from the target`)
    }
  }
})

test('no body type produces an absurd macro anywhere in the grid', () => {
  const bodies: (TargetsInput & { label: string; currentWeightKg: number })[] = [
    { label: 'tall lean male', currentWeightKg: 79.4, heightCm: 195.6, age: 25, biologicalSex: 'male' },
    { label: 'short female', currentWeightKg: 54, heightCm: 152, age: 40, biologicalSex: 'female' },
    { label: 'heavy male', currentWeightKg: 145, heightCm: 183, age: 35, biologicalSex: 'male' },
    { label: 'older male', currentWeightKg: 82, heightCm: 178, age: 68, biologicalSex: 'male' },
    { label: 'undisclosed', currentWeightKg: 70, heightCm: 170, age: 30, biologicalSex: 'prefer_not_to_say' },
  ]

  for (const b of bodies) {
    for (const preset of PRESETS) {
      for (const direction of DIRECTIONS) {
        for (const activityLevel of ['sedentary', 'moderate', 'very_active'] as const) {
          const t = computeNutritionTargets({ ...b, direction, macroPreset: preset, activityLevel })
          assert.ok(t, `${b.label} produced no targets`)
          const where = `${b.label}/${preset}/${direction}/${activityLevel}`
          const lbs = b.currentWeightKg * 2.20462

          // Nothing unphysiological, and nothing that reads as a typo. Carbs are
          // bounded PROPORTIONALLY — at 4,900 cal every macro is large and that
          // is arithmetic, not a bug.
          assert.ok(t.carbs > 0, `${where}: ${t.carbs}g carbs`)
          assert.ok(t.carbs * 4 <= t.calories * 0.55, `${where}: carbs are ${t.split.carbs}% of intake`)
          // Protein is bounded as a SHARE, never as a gram figure. The old hard
          // 250 g ceiling silently overrode the member's chosen split — at
          // 3,384 cal both High Protein (40%) and Lower Carb (35%) came out at
          // exactly 250 g, so picking a ratio did nothing. 40% is the highest
          // share any preset asks for; grams follow from calories.
          assert.ok(t.protein > 0, `${where}: ${t.protein}g protein`)
          assert.ok(t.protein * 4 <= t.calories * 0.41, `${where}: protein is ${t.split.protein}% of intake`)
          assert.ok(t.fats >= 20, `${where}: ${t.fats}g fat`)
          assert.ok(t.fats * 9 <= t.calories * 0.5, `${where}: fat is ${t.split.fats}% of intake`)
          // The calorie target itself must be sane — every macro scales with it,
          // so a bad TDEE would show up here rather than as an odd gram figure.
          assert.ok(t.calories >= 1200 && t.calories <= 6000, `${where}: ${t.calories} cal`)

          // g/lb is the contract for RECOMMENDED — that one is ours to defend,
          // and it is anchored to bodyweight by construction.
          //
          // It is NOT the contract for the explicit presets. Those are a share of
          // calories the member chose, and at 4,100 cal a 40% pick is legitimately
          // ~2.2 g/lb for a light, very tall, very active member. Asserting a g/lb
          // band on them would only be satisfiable by silently clamping grams —
          // which is exactly the bug that made the picker look dead. What must
          // hold instead is that the grams ARE the advertised share.
          if (preset === 'recommended') {
            const perLb = t.protein / lbs
            assert.ok(perLb >= 0.6 && perLb <= 1.4, `${where}: ${perLb.toFixed(2)} g/lb protein`)
          } else {
            assert.deepEqual(
              t.split,
              splitForPreset(preset, direction),
              `${where}: delivered a different split than it advertised`,
            )
          }

          // Carbs can never dominate the plate again.
          assert.ok(t.split.carbs <= 55, `${where}: carbs ${t.split.carbs}%`)
        }
      }
    }
  }
})

test('a bigger calorie target no longer dilutes protein', () => {
  // The old model kept protein in absolute grams, so its SHARE fell as calories
  // rose — the root cause of the carb blowout.
  const low = computeNutritionTargets({ ...ADRIAN, activityLevel: 'sedentary' })!
  const high = computeNutritionTargets({ ...ADRIAN, activityLevel: 'very_active' })!
  assert.ok(high.calories > low.calories + 500, 'test needs a real calorie gap')
  assert.ok(
    Math.abs(high.split.protein - low.split.protein) <= 6,
    `protein share moved ${low.split.protein}% -> ${high.split.protein}% with calories`,
  )
})

test('the suggested preset follows the goal', () => {
  assert.equal(recommendedPresetForGoal('gain', ['gain_muscle']), 'high_protein')
  assert.equal(recommendedPresetForGoal('lose', ['lose_weight']), 'high_protein')
  assert.equal(recommendedPresetForGoal('maintain', ['general_health']), 'recommended')
})

test('"prefer not to say" still gets real targets', () => {
  // Declining to state used to return null, which seeded nothing and left the
  // member on the hardcoded 2000/150/200/65 defaults.
  const t = computeNutritionTargets({
    currentWeightKg: 70, heightCm: 170, age: 30, biologicalSex: 'prefer_not_to_say',
    direction: 'maintain', activityLevel: 'moderate',
  })
  assert.ok(t, 'undisclosed sex must still produce targets')
  const male = computeNutritionTargets({ currentWeightKg: 70, heightCm: 170, age: 30, biologicalSex: 'male', direction: 'maintain', activityLevel: 'moderate' })!
  const female = computeNutritionTargets({ currentWeightKg: 70, heightCm: 170, age: 30, biologicalSex: 'female', direction: 'maintain', activityLevel: 'moderate' })!
  assert.ok(t!.calories < male.calories && t!.calories > female.calories, 'should sit between the two')
})

test('missing body stats still refuse to invent a number', () => {
  for (const partial of [
    { heightCm: 180, age: 30, biologicalSex: 'male' },
    { currentWeightKg: 80, age: 30, biologicalSex: 'male' },
    { currentWeightKg: 80, heightCm: 180, biologicalSex: 'male' },
  ] as TargetsInput[]) {
    assert.equal(computeNutritionTargets(partial), null, 'sparse stats must return null, not a guess')
  }
})

test('splitForPreset is the single source of truth for both screens', () => {
  assert.deepEqual(splitForPreset('balanced', 'gain'), MACRO_PRESET_SPLITS.balanced)
  assert.deepEqual(splitForPreset('recommended', 'lose'), RECOMMENDED_SPLITS.lose)
  assert.deepEqual(splitForPreset('custom', 'gain'), RECOMMENDED_SPLITS.gain)
})

test('the deficit scales with the member instead of being a flat 500', () => {
  // A flat 500 is ~17% of a 2,940 TDEE but ~30% of a 1,667 one. The small member
  // was driven straight into the 1,200 calorie floor by a cut nobody would
  // prescribe; the large member should be completely unaffected.
  const small = computeNutritionTargets({
    currentWeightKg: 59.87, heightCm: 157.5, age: 42, biologicalSex: 'female',
    direction: 'lose', activityLevel: 'light',
  })!
  assert.ok(small.calories > 1200, 'a small member must not be floored by her own deficit')
  const smallPct = (small.tdee - small.calories) / small.tdee
  assert.ok(smallPct <= 0.21, `deficit is ${Math.round(smallPct * 100)}% of TDEE`)

  // Unchanged for anyone big enough that 500 was already proportionate.
  const large = computeNutritionTargets({
    currentWeightKg: 95.25, heightCm: 182.88, age: 25, biologicalSex: 'male',
    direction: 'lose', activityLevel: 'active',
  })!
  assert.equal(large.tdee - large.calories, 500)
})

test('no direction ever pushes anyone below the calorie floor by design', () => {
  for (const direction of DIRECTIONS) {
    for (const activityLevel of ['sedentary', 'light'] as const) {
      const t = computeNutritionTargets({
        currentWeightKg: 45, heightCm: 145, age: 70, biologicalSex: 'female',
        direction, activityLevel,
      })!
      assert.ok(t.calories >= 1200, `${direction}/${activityLevel}: ${t.calories} cal`)
    }
  }
})

// ── The calorie deficit has to follow the chosen pace ────────────────────────
//
// Reported: "1 lb/week is a 500 calorie deficit. If I change to .5 lb/week or
// 1.5 lb/week, nothing changes. 'Lose Weight' still has TDEE - 500." The
// Plan's pace picker (0.5/1/1.5 lb a week) used to only drive the ETA text —
// calorieAdjustment() ignored it and always applied the flat -500/+300.

test('calorieAdjustment scales with the chosen pace, not just direction', () => {
  const tdee = 4427 // big enough that the 20%/15% safety cap never binds below
  assert.equal(calorieAdjustment(tdee, 'lose', 0.5), -250)
  assert.equal(calorieAdjustment(tdee, 'lose', 1), -500)
  assert.equal(calorieAdjustment(tdee, 'lose', 1.5), -750)
  assert.equal(calorieAdjustment(tdee, 'gain', 0.5), 250)
  assert.equal(calorieAdjustment(tdee, 'gain', 1), 500)
})

test('without a pace, calorieAdjustment keeps its historical flat default', () => {
  assert.equal(calorieAdjustment(4427, 'lose'), -500)
  assert.equal(calorieAdjustment(4427, 'gain'), 300)
  assert.equal(calorieAdjustment(4427, 'maintain', 1.5), 0)
})

test('REGRESSION: a chosen pace is no longer watered down by the flat-default safety cap', () => {
  // Reported: TDEE 2,828 at 1.5 lb/week showed "-566" instead of "-750". The
  // 20% cap exists to protect the flat, UNCHOSEN default (see the next test)
  // — it should never touch a pace the member explicitly picked. "1lb of fat
  // = 3500 calories ... the math is the math" (card comment thread).
  const tdee = 2828
  assert.equal(calorieAdjustment(tdee, 'lose', 0.5), -250)
  assert.equal(calorieAdjustment(tdee, 'lose', 1), -500)
  assert.equal(calorieAdjustment(tdee, 'lose', 1.5), -750)

  // Even for a small member, the chosen pace is taken at face value here —
  // it is the 1,200 cal FLOOR in computeNutritionTargets() that protects
  // them, not a percentage cap that would hand back a number unrelated to
  // the pace they picked.
  assert.equal(calorieAdjustment(1667, 'lose', 1.5), -750)
})

test('the calorie floor, not the percentage cap, protects a small member on an aggressive pace', () => {
  const t = computeNutritionTargets({
    currentWeightKg: 59.87, heightCm: 157.5, age: 42, biologicalSex: 'female',
    direction: 'lose', activityLevel: 'light',
    paceKgPerWeek: 1.5 * KG_PER_LB,
  })!
  assert.equal(t.calories, 1200, 'a small member on the fastest pace must still be floored, not just capped')
})

test('computeNutritionTargets actually moves when the Plan pace changes', () => {
  // Big enough (TDEE ~4,427) that none of the three paces hit the safety cap.
  const base = {
    currentWeightKg: 120, heightCm: 200, age: 25, biologicalSex: 'male' as const,
    direction: 'lose' as const, activityLevel: 'very_active' as const,
  }
  const half = computeNutritionTargets({ ...base, paceKgPerWeek: 0.5 * KG_PER_LB })!
  const one = computeNutritionTargets({ ...base, paceKgPerWeek: 1 * KG_PER_LB })!
  const oneHalf = computeNutritionTargets({ ...base, paceKgPerWeek: 1.5 * KG_PER_LB })!

  assert.ok(half.calories > one.calories, 'a slower pace must leave more calories')
  assert.ok(one.calories > oneHalf.calories, 'a faster pace must leave fewer calories')
  assert.equal(one.tdee - one.calories, 500, '1 lb/week matches the historical default exactly')
  assert.equal(one.tdee - half.calories, 250)
  assert.equal(one.tdee - oneHalf.calories, 750)

  // Macros must follow the new calorie target too, not just the headline number.
  assert.notEqual(half.protein, oneHalf.protein)
  assert.notEqual(half.carbs, oneHalf.carbs)
})

// ── The picker has to actually change the numbers ────────────────────────────
//
// Reported from a live JonDon onboarding at 3,384 cal: "high protein goes up in
// protein but doesn't change our protein, and low-carb also doesn't change our
// percentage of protein." Both landed on exactly 250 g because a hard gram
// ceiling was applied AFTER the split, then the leftover was redistributed —
// silently rewriting the ratio the member had chosen.

describe('macro preset picker', () => {
  const MEMBER = {
    currentWeightKg: 93,        // ~205 lb
    heightCm: 183,
    age: 30,
    biologicalSex: 'male' as const,
    activityLevel: 'active' as const,
    direction: 'maintain' as const,
  }

  it('every preset delivers exactly the split it advertises', () => {
    for (const preset of ['balanced', 'high_protein', 'low_carb'] as const) {
      const t = computeNutritionTargets({ ...MEMBER, macroPreset: preset })
      assert.ok(t)
      const advertised = splitForPreset(preset, 'maintain')
      assert.deepEqual(
        t.split,
        advertised,
        `${preset} advertised ${advertised.protein}/${advertised.carbs}/${advertised.fats} but delivered ${t.split.protein}/${t.split.carbs}/${t.split.fats}`,
      )
    }
  })

  it('choosing High Protein raises protein in GRAMS, not just on the label', () => {
    const balanced = computeNutritionTargets({ ...MEMBER, macroPreset: 'balanced' })
    const high = computeNutritionTargets({ ...MEMBER, macroPreset: 'high_protein' })
    assert.ok(balanced && high)
    assert.ok(
      high.protein > balanced.protein,
      `high protein ${high.protein}g must exceed balanced ${balanced.protein}g`,
    )
    // 40% vs 30% of the same calories — a full third more, not a rounding nudge.
    assert.ok(high.protein - balanced.protein > 50, `only +${high.protein - balanced.protein}g`)
  })

  it('choosing Lower Carb lowers carbs and raises BOTH protein and fat', () => {
    const balanced = computeNutritionTargets({ ...MEMBER, macroPreset: 'balanced' })
    const low = computeNutritionTargets({ ...MEMBER, macroPreset: 'low_carb' })
    assert.ok(balanced && low)
    assert.ok(low.carbs < balanced.carbs, 'carbs must come down')
    assert.ok(low.protein > balanced.protein, 'protein must follow its 35% share up')
    assert.ok(low.fats > balanced.fats, 'fat must follow its 40% share up')
  })

  it('no preset is pinned to the same protein as another', () => {
    // The exact reported symptom: three different ratios, one protein number.
    const grams = (['balanced', 'high_protein', 'low_carb'] as const).map(
      (p) => computeNutritionTargets({ ...MEMBER, macroPreset: p })!.protein,
    )
    assert.equal(new Set(grams).size, grams.length, `protein was ${grams.join(' / ')} across three presets`)
  })

  it('Recommended is personalised, so it is not just a copy of Balanced', () => {
    // At maintain these used to be the same fixed 30/40/30 — two of the four
    // options were the same option under different names.
    const rec = computeNutritionTargets({ ...MEMBER, macroPreset: 'recommended' })
    const bal = computeNutritionTargets({ ...MEMBER, macroPreset: 'balanced' })
    assert.ok(rec && bal)
    assert.notDeepEqual(rec.split, bal.split)
  })

  it('Recommended tracks the member, not a table', () => {
    // Bodyweight alone is not the lever to test with — calories scale with weight,
    // so the protein SHARE is roughly weight-invariant, which is correct. What
    // must move it is what the member is actually doing: a cut asks for more
    // protein per lb than maintenance, so the recommended share has to rise.
    const cutting = computeNutritionTargets({ ...MEMBER, direction: 'lose', macroPreset: 'recommended' })
    const holding = computeNutritionTargets({ ...MEMBER, direction: 'maintain', macroPreset: 'recommended' })
    assert.ok(cutting && holding)
    assert.ok(
      cutting.split.protein > holding.split.protein,
      `a cut should be recommended a bigger protein share (${holding.split.protein}% holding vs ${cutting.split.protein}% cutting)`,
    )
  })

  it('a heavy member is still protected without a hard gram ceiling', () => {
    // 320 lb cutting at 1.0 g/lb would be 320 g. The percentage band holds it to
    // a sane share of intake instead of a magic number.
    const t = computeNutritionTargets({
      currentWeightKg: 145, heightCm: 183, age: 35, biologicalSex: 'male',
      direction: 'lose', activityLevel: 'moderate', macroPreset: 'recommended',
    })
    assert.ok(t)
    assert.ok(t.split.protein <= 40, `${t.split.protein}% protein`)
    assert.ok(t.protein * 4 <= t.calories * 0.41)
  })

  it('grams always reconstruct the calorie target', () => {
    for (const preset of ['recommended', 'balanced', 'high_protein', 'low_carb'] as const) {
      const t = computeNutritionTargets({ ...MEMBER, macroPreset: preset })!
      const fromMacros = t.protein * 4 + t.carbs * 4 + t.fats * 9
      assert.ok(Math.abs(fromMacros - t.calories) <= 8, `${preset}: ${fromMacros} vs ${t.calories}`)
    }
  })
})

// ── Naming + who gets recommended what ───────────────────────────────────────
//
// "Recommended" was a preset NAME, which made it the obvious pick for anyone who
// didn't have an opinion — including beginners, for whom the computed split can
// be an accurate-but-unreachable 400 g of protein. It is now a BADGE that moves,
// and the computed split is called what it is: Custom.

describe('macro preset naming and recommendation', () => {
  it('the computed split is called "Custom", not "Recommended"', () => {
    assert.equal(MACRO_PRESET_LABELS.recommended, 'Custom')
    // Nothing in the picker is named "Recommended" any more.
    for (const label of Object.values(MACRO_PRESET_LABELS)) {
      assert.notEqual(label, 'Recommended')
    }
  })

  it('hand-typed numbers are called "Manual" so there is only one "Custom"', () => {
    assert.equal(MACRO_PRESET_LABELS.custom, 'Manual')
    const names = Object.values(MACRO_PRESET_LABELS)
    assert.equal(new Set(names).size, names.length, `duplicate labels: ${names.join(', ')}`)
  })

  it('a beginner is pointed at Balanced whatever their goal', () => {
    // The reported case: new to the gym, very overweight, custom split is
    // technically right and practically unreachable.
    for (const [dir, goals] of [
      ['lose', ['lose_weight']],
      ['gain', ['gain_muscle']],
      ['maintain', ['general_health']],
    ] as [NutritionDirection, FitnessGoal[]][]) {
      const r = recommendPreset(dir, goals, 'beginner')
      assert.equal(r.preset, 'balanced', `${dir}/${goals[0]} sent a beginner to ${r.preset}`)
      assert.ok(r.why.length > 20, 'a recommendation must explain itself')
    }
  })

  it('unknown experience is treated as beginner, not as advanced', () => {
    assert.equal(recommendPreset('lose', ['lose_weight'], undefined).preset, 'balanced')
  })

  it('experience unlocks the sharper recommendations', () => {
    // Same goal, three experience levels — the recommendation has to move.
    const beginner = recommendPreset('lose', ['lose_weight'], 'beginner')
    const intermediate = recommendPreset('lose', ['lose_weight'], 'intermediate')
    const advanced = recommendPreset('lose', ['lose_weight'], 'advanced')
    assert.equal(beginner.preset, 'balanced')
    assert.equal(intermediate.preset, 'recommended')  // "Custom"
    assert.equal(advanced.preset, 'high_protein')
  })

  it('goal picks between the sharper options once experience allows', () => {
    assert.equal(recommendPreset('gain', ['gain_muscle'], 'advanced').preset, 'high_protein')
    assert.equal(recommendPreset('maintain', ['general_health'], 'advanced').preset, 'recommended')
  })

  it('every recommendation names a real, selectable option', () => {
    const selectable: MacroPreset[] = ['recommended', 'balanced', 'high_protein', 'low_carb']
    for (const exp of [undefined, 'beginner', 'intermediate', 'advanced'] as const) {
      for (const dir of DIRECTIONS) {
        const r = recommendPreset(dir, ['lose_weight'], exp)
        assert.ok(selectable.includes(r.preset), `${exp}/${dir} badged ${r.preset}`)
        assert.ok(r.badge.length > 0 && r.badge.length <= 16, `badge "${r.badge}" is not card-sized`)
      }
    }
  })
})

// ── Manual split entered as a percent, not just grams ────────────────────────
//
// The Manual (macroPreset 'custom') screen used to only accept grams — the
// percent shown next to each field was read-only, computed from whatever
// grams were typed. gramsFromPercent/percentFromGrams are the conversion the
// Nutrition Goals page now uses to let Manual accept a typed percentage too,
// using the same calories*pct/100/kcalPerGram math as a preset's split.

describe('gramsFromPercent / percentFromGrams', () => {
  it('matches the split math computeNutritionTargets already applies to presets', () => {
    // 2328 cal at 40/30/30 (the reported screenshot) is 233/175/78.
    assert.equal(gramsFromPercent(2328, 40, 4), 233)
    assert.equal(gramsFromPercent(2328, 30, 4), 175)
    assert.equal(gramsFromPercent(2328, 30, 9), 78)
  })

  it('round-trips grams -> percent -> grams for a real split', () => {
    // Chosen so grams/calories divides evenly and rounding never has to bite,
    // so this proves the two functions are true inverses, not just "close".
    assert.equal(gramsFromPercent(2000, percentFromGrams(2000, 200, 4), 4), 200)
    assert.equal(gramsFromPercent(1800, percentFromGrams(1800, 72, 9), 9), 72)

    // A percentage that doesn't divide evenly is still stable within rounding.
    const pct = percentFromGrams(2400, 220, 4)
    const backToGrams = gramsFromPercent(2400, pct, 4)
    assert.ok(Math.abs(backToGrams - 220) <= 3, `220g -> ${pct}% -> ${backToGrams}g drifted too far`)
  })

  it('refuses to invent a number when calories is not set yet', () => {
    assert.equal(gramsFromPercent(0, 40, 4), 0)
    assert.equal(percentFromGrams(0, 233, 4), 0)
  })

  it('0% is 0g and 100% of calories from one macro is the whole target', () => {
    assert.equal(gramsFromPercent(2000, 0, 4), 0)
    assert.equal(gramsFromPercent(2000, 100, 4), 500)
    assert.equal(percentFromGrams(2000, 0, 4), 0)
    assert.equal(percentFromGrams(2000, 500, 4), 100)
  })
})

// ── The picker's label vs the targets underneath it ───────────────────────────
//
// Reported with two screenshots of the same screen, seconds apart: the Macro
// Split picker read "Custom (from your stats) — 35/35/30" while the Daily
// Targets card directly below it read Protein 29% / Carbs 41% / Fats 30%, over
// 210g / 297g / 96g of a 2894 cal target. Both numbers were "right" — they were
// simply two different numbers. The label looked up the static per-direction
// RECOMMENDED_SPLITS row (lose = 35/35/30), which is the fallback for screens
// that don't know the member's body; the targets came from the member's own
// bodyweight and calorie target, which is the entire point of the option being
// called "from your stats".
//
// A split a member is told they are on, and is not on, is worse than no number
// at all: it is what they will plan a day of eating against.

describe('the picker advertises the split the targets actually show', () => {
  /** The member in the screenshots: ~205 lb, holding, in a deficit. */
  const SCREENSHOT_MEMBER: TargetsInput = {
    currentWeightKg: 205 * KG_PER_LB,
    heightCm: 183,
    age: 30,
    biologicalSex: 'male',
    activityLevel: 'active',
    direction: 'lose',
  }

  /** What the Daily Targets card renders, from the grams it is showing. */
  const asShownOnTargets = (input: TargetsInput, preset: MacroPreset) => {
    const t = computeNutritionTargets({ ...input, macroPreset: preset })!
    return splitFromGrams(t.protein, t.carbs, t.fats)
  }

  it('the reported screen no longer contradicts itself', () => {
    const advertised = deliveredSplit('recommended', SCREENSHOT_MEMBER)
    assert.deepEqual(advertised, { protein: 29, carbs: 41, fats: 30 })
    // ...which is exactly what the card below it shows.
    assert.deepEqual(advertised, asShownOnTargets(SCREENSHOT_MEMBER, 'recommended'))
    // And is NOT the static row the label used to read.
    assert.notDeepEqual(advertised, RECOMMENDED_SPLITS.lose)
    assert.deepEqual(RECOMMENDED_SPLITS.lose, { protein: 35, carbs: 35, fats: 30 })
  })

  it('label and targets agree for every preset, direction and body', () => {
    const BODIES: TargetsInput[] = [
      SCREENSHOT_MEMBER,
      ADRIAN,
      // Small, light, sedentary — the end of the range where the calorie floor
      // and the carb guard rail bite and a percentage table goes stale.
      { currentWeightKg: 48, heightCm: 152, age: 62, biologicalSex: 'female', activityLevel: 'sedentary' },
      // Heavy, very active — the other end.
      { currentWeightKg: 130, heightCm: 196, age: 24, biologicalSex: 'male', activityLevel: 'very_active' },
    ]
    for (const body of BODIES) {
      for (const direction of DIRECTIONS) {
        for (const preset of PRESETS) {
          const input = { ...body, direction }
          assert.deepEqual(
            deliveredSplit(preset, input),
            asShownOnTargets(input, preset),
            `${preset}/${direction} at ${Math.round(body.currentWeightKg! / KG_PER_LB)}lb`,
          )
        }
      }
    }
  })

  it('catches a split the pipeline moves after the preset is applied', () => {
    // The carb floor rewrites the ratio on a very low target, so even a fixed
    // preset can deliver something other than the percentages it is named for.
    // Whatever comes out, the label has to say it.
    const tiny: TargetsInput = {
      currentWeightKg: 40,
      heightCm: 145,
      age: 70,
      biologicalSex: 'female',
      activityLevel: 'sedentary',
      direction: 'lose',
    }
    for (const preset of PRESETS) {
      const advertised = deliveredSplit(preset, tiny)!
      assert.deepEqual(advertised, asShownOnTargets(tiny, preset), preset)
      const total = advertised.protein + advertised.carbs + advertised.fats
      assert.ok(Math.abs(total - 100) <= 1, `${preset} adds up to ${total}%`)
    }
  })

  it('Manual promises nothing, because nothing has been typed yet', () => {
    assert.equal(deliveredSplit('custom', SCREENSHOT_MEMBER), null)
  })

  it('falls back to the preset split when the body stats are too sparse', () => {
    // No weight, so there are no targets to read percentages off. An
    // approximate ratio still describes the choice; a blank does not.
    const sparse: TargetsInput = { direction: 'gain' }
    assert.deepEqual(deliveredSplit('balanced', sparse), MACRO_PRESET_SPLITS.balanced)
    assert.deepEqual(deliveredSplit('recommended', sparse), RECOMMENDED_SPLITS.gain)
  })
})

describe('splitFromGrams — the one definition of "what percentages am I on"', () => {
  it('reports each macro as its share of the calories the grams add up to', () => {
    // The exact figures on the reported screen.
    assert.deepEqual(splitFromGrams(210, 297, 96), { protein: 29, carbs: 41, fats: 30 })
  })

  it('an even split reads as an even split', () => {
    // 200g protein and 200g carbs are 800 cal each; so is 88.9g of fat.
    assert.deepEqual(splitFromGrams(200, 200, 88.888), { protein: 33, carbs: 33, fats: 33 })
  })

  it('does not divide by zero before anything is set', () => {
    assert.deepEqual(splitFromGrams(0, 0, 0), { protein: 0, carbs: 0, fats: 0 })
  })
})

// The wiring above is only worth anything if the screen actually uses it. This
// is the structural half (the house pattern — see entitlements/uiSurfaces):
// the picker's label and the card's percentages must come from the same two
// functions, because the bug was precisely that they came from different ones.
describe('the nutrition goals screen is wired to those two functions', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../app/dashboard/nutrition/goals/page.tsx'),
    'utf8',
  )
  // Comments explain the old behaviour by name, so they have to come out
  // before asserting the old behaviour is gone from the code.
  const page = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('every option is labelled from the split it will deliver', () => {
    assert.match(page, /presetLabel\(key, presetSplits\[key\]\)/)
    assert.match(page, /deliveredSplit\(key, \{/)
  })

  it('the Daily Targets percentages come from splitFromGrams', () => {
    assert.match(page, /splitFromGrams\(goals\.protein, goals\.carbs, goals\.fats\)/)
  })

  it('does not reach for the static table behind the picker', () => {
    // splitForPreset() ignores the member's body — deliveredSplit() falls back
    // to it when there is nothing to personalise from, and that is the only
    // route to it this screen may have.
    assert.doesNotMatch(page, /\bsplitForPreset\s*\(/)
  })
})

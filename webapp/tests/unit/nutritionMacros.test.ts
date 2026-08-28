// Run with: npx tsx --test tests/unit/nutritionMacros.test.ts
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
import {
  calorieAdjustment,
  computeNutritionTargets,
  splitForPreset,
  recommendedPresetForGoal,
  recommendPreset,
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

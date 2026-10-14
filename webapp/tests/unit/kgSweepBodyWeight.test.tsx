// Run with: npm run test:file tests/unit/kgSweepBodyWeight.test.tsx
//
// The second half of Jon's rule on NP-028 — "kg members should be able to use
// KG throughout the whole app". NP-209 (#1977) delivered it for LIFTING LOADS
// and said so, leaving body-weight displays explicitly out of scope. This is
// the audit of what that left behind, pinned.
//
// What is under test here, and what it must never become again:
//
//   • a stored weigh-in is read through its OWN unit, and an entry with no
//     unit is grandfathered to the member's display unit — never converted,
//     normalised or backfilled in the database (George's DECIDED comment on
//     NP-209 forbids a migration, and still does);
//   • `weightData` / `leanMassData` come out of GET /api/progress in the unit
//     every consumer already labels them with (`profile.weightUnit ?? 'lbs'`);
//   • BMI keeps its imperial formula and gets POUNDS fed to it, which is the
//     one place a kg weigh-in produced a flatly wrong number (~45% of real);
//   • the four surfaces that hardcoded "lbs" — the weigh-in sheet, the
//     journey recap's weight-change stat, the Training Log's Lean Mass tab and
//     the Nutrition → Weight chart's goal line — read the member's unit.
//
// No jsdom in this repo (see weightLogSheet.test.tsx), so component coverage
// is renderToStaticMarkup plus source scans for the surfaces whose data comes
// from a fetch.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  convertWeight,
  journeyWeightChange,
  memberDisplayUnit,
  weighInPounds,
  weighInUnit,
  weighInValue,
} from '@/lib/weighInUnits'
import { calculateBMI, formatProgressData, type ProgressInput } from '@/lib/data/userProgress'
import WeightLogSheet from '../../components/WeightLogSheet'

const ROOT = path.join(__dirname, '../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ── The reading rule ────────────────────────────────────────────────────────

test('the member display unit is weightUnit ?? lbs, and only lbs/kg count', () => {
  assert.equal(memberDisplayUnit('kg'), 'kg')
  assert.equal(memberDisplayUnit('lbs'), 'lbs')
  // Never asked, or asked and dismissed (WeightUnitGate owns the one ask).
  assert.equal(memberDisplayUnit(undefined), 'lbs')
  assert.equal(memberDisplayUnit(null), 'lbs')
  assert.equal(memberDisplayUnit('stone'), 'lbs')
})

test("a weigh-in's own unit wins over the member's current preference", () => {
  // Logged in kg, member has since switched to pounds: the entry is still kg,
  // and is CONVERTED FOR DISPLAY ONLY.
  assert.equal(weighInUnit({ weight: 82, unit: 'kg' }, 'lbs'), 'kg')
  assert.equal(weighInValue({ weight: 82, unit: 'kg' }, 'lbs'), 180.8)
  // And the other way round.
  assert.equal(weighInUnit({ weight: 185, unit: 'lbs' }, 'kg'), 'lbs')
  assert.equal(weighInValue({ weight: 185, unit: 'lbs' }, 'kg'), 83.9)
})

test('an entry with no unit is grandfathered to the display unit, untouched', () => {
  // The 46 accounts that logged before IWeightEntry.unit existed.
  assert.equal(weighInUnit({ weight: 185 }, 'lbs'), 'lbs')
  assert.equal(weighInValue({ weight: 185 }, 'lbs'), 185)
  assert.equal(weighInUnit({ weight: 82 }, 'kg'), 'kg')
  assert.equal(weighInValue({ weight: 82 }, 'kg'), 82)
})

test('a same-unit read returns the stored number byte for byte (no round-trip rounding)', () => {
  assert.equal(weighInValue({ weight: 185.47, unit: 'lbs' }, 'lbs'), 185.47)
  assert.equal(weighInValue({ weight: 82.34, unit: 'kg' }, 'kg'), 82.34)
  assert.equal(convertWeight(123.456, 'kg', 'kg'), 123.456)
})

// ── GET /api/progress series ────────────────────────────────────────────────

function progressInput(
  weightHistory: ProgressInput['weightHistory'],
): ProgressInput {
  return {
    height: 70, // INCHES — UserProgress.height, the third convention
    weightHistory,
    moodHistory: [],
    workoutLogs: [],
    currentProgram: null,
    streakDays: 0,
    totalWorkouts: 0,
  }
}

test('a lbs member sees exactly what they saw before the sweep', () => {
  const out = formatProgressData(
    progressInput([{ date: new Date('2026-10-01'), weight: 185, unit: 'lbs', bodyFat: 20 }]),
    'P', 'W', { weightUnit: 'lbs' },
  )
  assert.equal(out.weightData[0].value, 185)
  assert.equal(out.leanMassData[0].value, 148)
  assert.equal(out.bmiData[0].value, Number(calculateBMI(185, 70).toFixed(1)))
})

test('an unset preference is still lbs — nothing is defaulted into the data', () => {
  const out = formatProgressData(
    progressInput([{ date: new Date('2026-10-01'), weight: 185 }]),
    'P', 'W', {},
  )
  assert.equal(out.weightData[0].value, 185)
})

test('a kg member keeps kilograms in weightData and leanMassData', () => {
  const out = formatProgressData(
    progressInput([{ date: new Date('2026-10-01'), weight: 82, unit: 'kg', bodyFat: 25 }]),
    'P', 'W', { weightUnit: 'kg' },
  )
  assert.equal(out.weightData[0].value, 82, 'the number the member typed, unconverted')
  assert.equal(out.leanMassData[0].value, 61.5, '82 kg at 25% fat = 61.5 kg lean')
})

test('a mixed history is presented in one unit — the one the labels claim', () => {
  // Logged in pounds, switched to kilograms, kept logging. The tile and the
  // chart label every point "kg", so every point has to BE kg.
  const out = formatProgressData(
    progressInput([
      { date: new Date('2026-09-01'), weight: 185, unit: 'lbs' },
      { date: new Date('2026-10-01'), weight: 82, unit: 'kg' },
    ]),
    'P', 'W', { weightUnit: 'kg' },
  )
  assert.deepEqual(out.weightData.map(d => d.value), [83.9, 82])
})

test('BMI is computed from POUNDS whatever the member logs in', () => {
  // The imperial formula is untouched (weight(lb) × 703 / height(in)²); what
  // changed is that it is no longer fed kilograms.
  const kg = formatProgressData(
    progressInput([{ date: new Date('2026-10-01'), weight: 84, unit: 'kg' }]),
    'P', 'W', { weightUnit: 'kg' },
  )
  const lbs = formatProgressData(
    progressInput([{ date: new Date('2026-10-01'), weight: 185.19, unit: 'lbs' }]),
    'P', 'W', { weightUnit: 'lbs' },
  )
  // 84 kg IS 185.19 lb, so the same body must get the same BMI either way.
  assert.equal(kg.bmiData[0].value, lbs.bmiData[0].value)
  assert.equal(kg.bmiData[0].value, 26.6)
  // And the old behaviour (84 treated as pounds) was the wrong number.
  assert.notEqual(kg.bmiData[0].value, Number(calculateBMI(84, 70).toFixed(1)))
  assert.equal(weighInPounds({ weight: 84, unit: 'kg' }, 'kg'), 84 * 2.20462)
})

test('body fat % is a percentage and is never unit-converted', () => {
  const out = formatProgressData(
    progressInput([{ date: new Date('2026-10-01'), weight: 82, unit: 'kg', bodyFat: 22.5 }]),
    'P', 'W', { weightUnit: 'kg' },
  )
  assert.equal(out.bodyFatData[0].value, 22.5)
})

// ── The journey recap's weight-change stat ──────────────────────────────────

test('journey weight change keeps the pounds trio AND adds the member unit', () => {
  const change = journeyWeightChange(
    { weight: 85, unit: 'kg' },
    { weight: 82, unit: 'kg' },
    'kg',
  )
  // Pounds: what the native recap and ProgramJourneyWeightChangeSchema read.
  assert.equal(change.startLbs, 187.4)
  assert.equal(change.endLbs, 180.8)
  assert.equal(change.change, -6.6)
  // The member's own unit: what the web recap renders, computed from the
  // entries rather than by converting the pounds back.
  assert.equal(change.unit, 'kg')
  assert.equal(change.startInUnit, 85)
  assert.equal(change.endInUnit, 82)
  assert.equal(change.changeInUnit, -3)
})

test('journey weight change for a lbs member is unchanged by the sweep', () => {
  const change = journeyWeightChange(
    { weight: 190.4, unit: 'lbs' },
    { weight: 185.2, unit: 'lbs' },
    'lbs',
  )
  assert.equal(change.startLbs, 190.4)
  assert.equal(change.endLbs, 185.2)
  assert.equal(change.change, -5.2)
  assert.equal(change.unit, 'lbs')
  assert.equal(change.startInUnit, 190.4)
  assert.equal(change.changeInUnit, -5.2)
})

test('the recap renders weightChange.unit, not a hardcoded lbs', () => {
  const src = readSource('app/dashboard/workout/[programId]/journey/page.tsx')
  assert.doesNotMatch(src, /\{data\.weightChange\.change\} lbs/)
  assert.doesNotMatch(src, /weightChange\.endLbs\} lbs/)
  assert.match(src, /bodyWeightUnit = wc\?\.unit \?\? 'lbs'/)
  assert.match(src, /\{weightStart\} → \{weightEnd\} \{bodyWeightUnit\}/)
})

// ── The weigh-in sheet (the one place body weight is typed) ─────────────────

test('the weigh-in sheet asks in the member unit and keeps lbs as the default', () => {
  const lbs = renderToStaticMarkup(
    <WeightLogSheet isOpen={true} onClose={() => {}} onLogged={() => {}} targetWeight={175} />,
  )
  assert.match(lbs, /Weight \(lbs\)/)
  assert.match(lbs, /Goal: 175 lbs/)

  const kg = renderToStaticMarkup(
    <WeightLogSheet
      isOpen={true}
      onClose={() => {}}
      onLogged={() => {}}
      targetWeight={79}
      weightUnit="kg"
    />,
  )
  assert.match(kg, /Weight \(kg\)/)
  assert.match(kg, /Goal: 79 kg/)
  assert.doesNotMatch(kg, /lbs/)
})

test('the sheet\'s sanity rails are in the unit being typed', () => {
  // 50–700 lb refuses a perfectly ordinary kilogram weigh-in: a 45 kg member
  // could not submit the form at all.
  const kg = renderToStaticMarkup(
    <WeightLogSheet isOpen={true} onClose={() => {}} onLogged={() => {}} weightUnit="kg" />,
  )
  assert.match(kg, /min="23"/)
  assert.match(kg, /max="318"/)

  const lbs = renderToStaticMarkup(
    <WeightLogSheet isOpen={true} onClose={() => {}} onLogged={() => {}} />,
  )
  assert.match(lbs, /min="50"/)
  assert.match(lbs, /max="700"/)
})

test('both sheet call sites pass the member unit through', () => {
  const dashboard = readSource('app/dashboard/DashboardClient.tsx')
  assert.match(dashboard, /<WeightLogSheet[\s\S]*?weightUnit=\{data\.goal\?\.weightUnit \?\? weightUnit\}/)
  const goals = readSource('app/dashboard/nutrition/goals/page.tsx')
  assert.match(goals, /<WeightLogSheet[\s\S]*?weightUnit=\{weightUnit\}/)
})

// ── The remaining labelled surfaces ─────────────────────────────────────────

test('the Training Log Lean Mass tab is labelled with the member unit', () => {
  const src = readSource('app/dashboard/progress/ProgressClient.tsx')
  assert.doesNotMatch(src, /tab === 'body_fat' \? '%' : 'lbs'/)
  assert.match(src, /tab === 'body_fat' \? '%' : weightUnit/)
  assert.match(src, /<BodyCompChart[\s\S]*?weightUnit=\{data\?\.weightUnit \?\? 'lbs'\}/)
})

test('the Nutrition → Weight chart draws its goal line in the member unit', () => {
  const src = readSource('app/dashboard/nutrition/goals/page.tsx')
  // The goal used to be forced to pounds and labelled "lbs" on a chart whose
  // series is in the member's unit.
  assert.doesNotMatch(src, /targetWeightLbs/)
  assert.match(src, /targetWeightShown = targetWeightKg \? displayWeight\(targetWeightKg, weightUnit\)/)
  assert.match(src, /Goal: \{targetWeightShown\} \{weightUnit\}/)
  assert.match(src, /formatter=\{\(v\) => \[`\$\{v\} \$\{weightUnit\}`, 'Weight'\]\}/)
})

test('the daily check-in prefills in the unit its label claims', () => {
  const api = readSource('app/api/checkin/route.ts')
  assert.match(api, /lastWeightUnit/)
  const dashboard = readSource('app/dashboard/DashboardClient.tsx')
  assert.match(
    dashboard,
    /lastWeight=\{checkInInfo\.lastWeight != null[\s\S]*?weighInValue\(\{ weight: checkInInfo\.lastWeight, unit: checkInInfo\.lastWeightUnit \}, weightUnit\)/,
  )
})

test('the AI coach is told the unit the member logged in', () => {
  const src = readSource('lib/ai/userContext.ts')
  assert.doesNotMatch(src, /\$\{c\.latestWeight\.lbs\} lbs/)
  assert.match(src, /\$\{c\.latestWeight\.value\} \$\{c\.latestWeight\.unit\}/)
})

test('onboarding opens on the unit the member already chose', () => {
  const src = readSource('app/onboarding/page.tsx')
  assert.doesNotMatch(src, /useState\(true\)\s*\n\s*\n\s*\/\/ Which figure/)
  assert.match(src, /useState\(\(profile\.weightUnit \?\? 'lbs'\) === 'lbs'\)/)
  // Reading the stored answer, not asking again (WeightUnitGate owns the ask).
  assert.match(src, /const storedUnit = data\.profile\?\.weightUnit/)
})

// ── The prohibitions ───────────────────────────────────────────────────────

test('nothing in the sweep writes, converts or backfills a stored weight', () => {
  const touched = [
    'lib/weighInUnits.ts',
    'lib/data/userProgress.ts',
    'app/api/programs/[programId]/journey/route.ts',
    'app/api/checkin/route.ts',
  ]
  for (const rel of touched) {
    const src = readSource(rel)
    assert.doesNotMatch(src, /updateMany|bulkWrite|\$set:\s*\{\s*['"]?weightHistory/, rel)
  }
  // The weigh-in writer is untouched by this card: /api/weight still stores
  // the raw number plus the unit it was typed in.
  const weightRoute = readSource('app/api/weight/route.ts')
  assert.match(weightRoute, /weight, unit, \.\.\.importFields/)
})

test('the one unit ask is still the only unit ask', () => {
  const gate = readSource('components/WeightUnitGate.tsx')
  assert.match(gate, /choose\('lbs'\)/)
  assert.match(gate, /choose\('kg'\)/)
  // Nothing added a second prompt: `choose(` (the writer in
  // lib/useMemberWeightUnit.ts) is called from the gate and from Settings'
  // explicit unit switch, nowhere else.
  const callers = ['components/WeightUnitGate.tsx']
  for (const rel of callers) assert.ok(readSource(rel).includes('choose('), rel)
})

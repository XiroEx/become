// Run with: npx tsx --test tests/unit/dayMarkerConvention.test.ts
//
// Become stores two kinds of date and they must never be compared to each other:
//
//   DAY MARKERS  - pegged to 00:00Z, meaning a calendar day.
//                  Schedule slot dates, weightHistory/moodHistory dates,
//                  NutritionLog.date, DailyWin.date, DisciplineChallenge.date.
//   INSTANTS     - a real moment. loggedAt, completedAt, workoutLogs.date.
//
// Comparing a marker to an instant is silent, timezone-dependent, and has now
// shipped three times:
//
//   - mood/weight read back as "1 day ago" the moment they were logged
//   - the morning push named TOMORROW's workout (west of UTC only)
//   - the Mind coach said "your Chest and Back workout today" when the calendar
//     said Legs (every timezone, once past midday UTC)
//
// This scans the source for the pattern rather than trusting review to catch a
// fourth. It is a heuristic, so every exemption below carries its reason — an
// unexplained entry in the allowlist is the thing to be suspicious of.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')
const SCAN_DIRS = ['app', 'lib', 'components']

/** Reading a slot date and comparing it to something. */
const SLOT_COMPARE = /(?:new Date\((\w+)\.date\)|(\w*[dD]ate)\s*)\s*[<>]=?\s*(now|new Date\(\)|Date\.now\(\))/

/**
 * Anchoring a comparison correctly. Any ONE of these makes a slot comparison
 * safe, because each keeps both sides on the same footing:
 *   utcMidnightDateKey(localDateKey(...))  -> local day AS a marker
 *   slotDateKey / slotDayKey               -> marker read as a plain date
 *   .toISOString().slice(0,10) / split('T')-> ditto
 */
const ANCHORS = [
  'utcMidnightDateKey',
  'slotDateKey',
  'slotDayKey',
  'entryDayKeys',
  'isEntryOnDay',
  'daysSinceEntry',
]

/**
 * Verified safe by hand on 2026-08-12. Each entry says WHY, so a future reader
 * can re-check the claim instead of trusting the list.
 */
const EXEMPT: Record<string, string> = {
  'app/api/workouts/route.ts':
    'compares workoutLogs.date (an INSTANT) against localDayWindowForKey().start (also an instant). Instant vs instant.',
  'app/api/workouts/resolve-incomplete/route.ts':
    'same: workoutLogs.date vs localDayWindowForKey().start, both instants.',
  'lib/dashboardTiles/buildRotatorInput.ts':
    'a 30-day recency cutoff. A few hours of skew inside a 30-day window changes nothing member-visible.',
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

test('no file compares a schedule day-marker against a raw instant', () => {
  const offenders: string[] = []

  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) continue

    for (const file of walk(abs)) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/')
      // Strip comments first. The scanner flagged its own explanation of the
      // bug, and a guard that fires on documentation gets muted.
      const src = stripComments(fs.readFileSync(file, 'utf8'))

      // Only files that actually read schedule slots can have this bug.
      if (!src.includes('scheduledWorkouts')) continue
      if (EXEMPT[rel]) continue
      if (ANCHORS.some(a => src.includes(a))) continue
      if (!SLOT_COMPARE.test(src)) continue

      const line = src.split('\n').findIndex(l => SLOT_COMPARE.test(l)) + 1
      offenders.push(`${rel}:${line}`)
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'These compare a slot date to a raw instant. A slot date means a calendar\n' +
    'day, so from 00:00Z onward "today" reads as past and "tomorrow" reads as\n' +
    'today. Anchor it: utcMidnightDateKey(localDateKey(null, tzOffset)) for a\n' +
    'local-day marker, or slotDateKey() to read the marker as a plain date.\n' +
    `Offenders:\n  ${offenders.join('\n  ')}`,
  )
})

test('the day-safe helpers are still exported where callers expect them', () => {
  // A rename that silently drops one of these would make the scan above pass
  // while every caller falls back to raw date math.
  const dayWindow = fs.readFileSync(path.join(ROOT, 'lib/dayWindow.ts'), 'utf8')
  for (const fn of ['utcMidnightDateKey', 'entryDayKeys', 'isEntryOnDay', 'daysSinceEntry']) {
    assert.ok(dayWindow.includes(`export function ${fn}`), `lib/dayWindow.ts must export ${fn}`)
  }
  const cron = fs.readFileSync(path.join(ROOT, 'lib/notifications/cronNotify.ts'), 'utf8')
  assert.ok(cron.includes('export function slotDateKey'), 'cronNotify.ts must export slotDateKey')
})

/**
 * The other half of the same mistake: RENDERING a marker with a local-time
 * formatter. `new Date('2026-08-12T00:00:00Z').getDate()` is 11 in Eastern, so
 * a Wednesday slot printed as "Tuesday, Aug 11" on the schedule screen. Markers
 * must be formatted in UTC, because UTC is the calendar day they encode.
 */
test('no file renders a schedule day-marker with a local-time formatter', () => {
  const LOCAL_RENDER = /new Date\((?:w|workout|slot|sw)\.date\)\.(getDate|getDay|getMonth|getFullYear|toLocaleDateString|toLocaleString)\(/
  const offenders: string[] = []

  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) continue
    for (const file of walk(abs)) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/')
      const src = stripComments(fs.readFileSync(file, 'utf8'))
      if (!src.includes('scheduledWorkouts') && !/\bupcoming\b/.test(src)) continue

      for (const [i, line] of src.split('\n').entries()) {
        if (!LOCAL_RENDER.test(line)) continue
        // getUTC*/timeZone:'UTC' on the same line is the correct form.
        if (/getUTC|timeZone:\s*'UTC'/.test(line)) continue
        offenders.push(`${rel}:${i + 1}`)
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'These format a day-marker in local time, which shows the PREVIOUS day west\n' +
    "of UTC. Use getUTCDate() or pass { timeZone: 'UTC' }.\n" +
    `Offenders:\n  ${offenders.join('\n  ')}`,
  )
})

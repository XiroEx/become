// Run with: npm run test:file tests/unit/dayMarkerConvention.test.ts
//
// Become stores two kinds of date and they must never be compared to each other:
//
//   DAY MARKERS  - pegged to 00:00Z, meaning a calendar day.
//                  Schedule slot dates, weightHistory/moodHistory dates,
//                  NutritionLog.date, DailyWin.date, DisciplineChallenge.date.
//   INSTANTS     - a real moment. loggedAt, completedAt, workoutLogs.date.
//
// Comparing a marker to an instant — or reading a marker through an offset —
// is silent, timezone-dependent, and has now shipped four times:
//
//   - mood/weight read back as "1 day ago" the moment they were logged
//   - the morning push named TOMORROW's workout (west of UTC only)
//   - the Mind coach said "your Chest and Back workout today" when the calendar
//     said Legs (every timezone, once past midday UTC)
//   - finishing today's workout marked an OLDER slot "made up" and left today's
//     Scheduled (west of UTC only) — POST /api/workouts, which every native
//     save also goes through
//
// This scans the source for those patterns rather than trusting review to catch
// a fifth. It is a heuristic, so every exemption below carries its reason AND
// the lines it covers — an unexplained entry in the allowlist, or one broad
// enough to hide a comparison nobody has looked at, is the thing to be
// suspicious of.

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
 * Verified safe by hand on 2026-08-12, re-scoped on 2026-09-29. Each entry
 * says WHY, so a future reader can re-check the claim instead of trusting the
 * list — and `only` says WHICH comparisons the claim covers.
 *
 * An exemption is a statement about specific lines, never a licence for the
 * file. `app/api/workouts/route.ts` is why: it was exempted for its
 * workoutLogs.date reads, which took its SCHEDULE-SLOT reads out of every scan
 * here with them. Those read a 00:00Z day marker through the member's offset,
 * so west of UTC today's slot keyed as yesterday, dropped into the overdue
 * backlog and lost the completion to an older slot with the same day label.
 */
const EXEMPT: Record<string, { why: string; only: RegExp }> = {
  'app/api/workouts/route.ts': {
    why: 'compares workoutLogs.date (an INSTANT) against localDayWindowForKey().start / the rolling in-progress cutoff (also instants). Instant vs instant.',
    only: /\b(?:log|todayLog|staleLog)\.date\b/,
  },
  'app/api/workouts/resolve-incomplete/route.ts': {
    why: 'same: workoutLogs.date vs localDayWindowForKey().start, both instants.',
    only: /\b(?:l|log|staleLog|skipLog)\.date\b/,
  },
  'lib/dashboardTiles/buildRotatorInput.ts': {
    why: 'a 30-day recency cutoff. A few hours of skew inside a 30-day window changes nothing member-visible.',
    only: /\bcutoff\b/,
  },
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
      if (ANCHORS.some(a => src.includes(a))) continue

      // Line by line, so an exemption covers the comparison it describes and
      // nothing else. The regex's `\s*` spans newlines, so a comparison split
      // across two lines is still one comparison: it is attributed to the line
      // it starts on, and not reported twice.
      const lines = src.split('\n')
      for (const [i, line] of lines.entries()) {
        const next = lines[i + 1] ?? ''
        const startsHere =
          SLOT_COMPARE.test(line) ||
          (SLOT_COMPARE.test(`${line}\n${next}`) && !SLOT_COMPARE.test(next))
        if (!startsHere) continue
        if (EXEMPT[rel]?.only.test(`${line}\n${next}`)) continue
        offenders.push(`${rel}:${i + 1}`)
      }
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

/**
 * The same mistake wearing a day key.
 *
 * SLOT_COMPARE only sees a marker weighed against a raw instant. The other way
 * to lose a day is to read the marker THROUGH the member's offset and compare
 * the result to a local day key — both sides then LOOK like day keys, so it
 * reads as careful code and stays silent. POST /api/workouts did it for the
 * three comparisons that decide which schedule slot a finished workout
 * credits:
 *
 *     dateKey(new Date(w.date), tzOffset) === todayKey     // todaySlot
 *     dateKey(new Date(w.date), tzOffset) <  todayKey      // overdue
 *     dateKey(new Date(w.date), tzOffset) >  todayKey      // upcoming
 *
 * For anyone west of UTC that keys today's 00:00Z slot as YESTERDAY, so
 * today's slot joined the overdue backlog and lost to an older slot with the
 * same day label: the old one was marked "made up" and today's stayed
 * Scheduled. Offset helpers are for INSTANTS — workoutLogs.date, completedAt,
 * loggedAt. A slot date is read with slotDateKey (or an explicit 0).
 */
const SLOT_THROUGH_OFFSET =
  /(?:dateKey|localDateKey|localDateKeyForUser|localDayWindowForKey)\s*\(\s*(?:new Date\(\s*)?(?:w|s|sw|slot|scheduled|scheduledWorkout)\.date\s*\)?\s*,\s*([^),]+)/

/**
 * True when `line` puts a slot marker through an offset. A literal `0` is the
 * one safe second argument — it reads the UTC day, which is what the marker
 * already means — so it is not an offender.
 */
function readsSlotThroughOffset(line: string): boolean {
  const m = SLOT_THROUGH_OFFSET.exec(line)
  return m ? m[1].trim() !== '0' : false
}

test('no file reads a schedule slot date through a timezone offset', () => {
  const offenders: string[] = []

  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) continue

    for (const file of walk(abs)) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/')
      const src = stripComments(fs.readFileSync(file, 'utf8'))
      // No file-level escape hatch here — not an anchor elsewhere in the file,
      // not an exemption. Either the line reads the marker as a marker or it
      // does not, and app/api/workouts/route.ts is scanned like everything
      // else: a whole-file exemption is exactly what hid this for so long.
      for (const [i, line] of src.split('\n').entries()) {
        if (readsSlotThroughOffset(line)) offenders.push(`${rel}:${i + 1}`)
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'These read a schedule slot date (a day MARKER at 00:00Z) through a\n' +
    'timezone offset, which names the PREVIOUS day for every member west of\n' +
    'UTC. Use slotDateKey(w.date) — the offset belongs to instants only.\n' +
    `Offenders:\n  ${offenders.join('\n  ')}`,
  )
})

test('the slot-through-offset scan catches the form that shipped, and only that form', () => {
  // A guard nobody has seen bite is a guard nobody knows is dead.
  assert.ok(
    readsSlotThroughOffset('const todaySlot = candidates.find((w) => dateKey(new Date(w.date), tzOffset) === todayKey)'),
    'must catch the comparison that credited an older slot west of UTC',
  )
  assert.ok(
    readsSlotThroughOffset('candidates.filter((w) => dateKey(w.date, tz) < todayKey)'),
    'must catch it without the new Date() wrapper too',
  )

  // The fix, and the reads that are RIGHT to put through an offset.
  for (const safe of [
    'const todaySlot = candidates.find((w) => slotDateKey(w.date) === todayKey)',
    'const k = dateKey(new Date(w.date), 0)',
    'w.completedAt && dateKey(new Date(w.completedAt), tzOffset) === todayKey',
    'const day = dateKey(new Date(log.date), tzOffset)',
  ]) {
    assert.equal(readsSlotThroughOffset(safe), false, `must not flag: ${safe}`)
  }
})

test('the workouts route\'s slot comparisons are covered, not exempted', () => {
  const rel = 'app/api/workouts/route.ts'
  const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'))

  // Every native save and most web ones come through here without a
  // `scheduledDate`, so this ordering is what picks the slot.
  const markerReads = src.match(/slotDateKey\(w\.date\)/g) ?? []
  assert.ok(
    markerReads.length >= 3,
    `todaySlot, overdue and upcoming must each read the slot date as a marker; found ${markerReads.length}`,
  )

  // The file's exemption covers its workoutLogs.date instants and must not
  // reach the slot comparisons — otherwise the scans above go blind here again.
  const exemption = EXEMPT[rel]
  assert.ok(exemption, 'the entry documents WHY the instant comparisons are safe')
  assert.equal(
    exemption.only.test('const overdue = candidates.filter((w) => slotDateKey(w.date) < todayKey)'),
    false,
    'the exemption must not cover the schedule-slot comparisons',
  )
  assert.ok(
    exemption.only.test('new Date(log.date) < today'),
    'the exemption must still cover the workoutLogs.date instant comparisons it describes',
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

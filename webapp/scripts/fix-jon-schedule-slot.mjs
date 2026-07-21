import { createRequire } from 'module'; import { readFileSync } from 'fs'
const require = createRequire(import.meta.url); const mongoose = require('mongoose')

// Repair the slot the "overdue backlog" bug mis-credited.
//
// Jon trained Day 1 on Mon Jul 13 (workout log exists, completed=true). Because
// the completion resolver treated today's own slot as part of the overdue backlog
// and took the OLDEST first, it marked the Jul 6 Day-1 slot completed (rendering
// as "Made up on Jul 13") and left Jul 13 itself "Scheduled" with nothing done.
//
//   Jul 13 → completed (completedAt = the real log time)
//   Jul 6  → skipped   (he was prompted about the missed week and chose
//                       "don't count them"; Jul 7 and Jul 11 are already 'skipped')
//
// Net completed count is unchanged (1), so UserProgress/currentDay stay correct.
// Read-only unless --apply.

const APPLY = process.argv.includes('--apply')
const EMAIL = 'jondon27500@gmail.com'
const PROGRAM = 'program_jon_don_split'
const LOG_TIME = new Date('2026-07-13T16:00:44.285Z') // the actual workout log

await mongoose.connect(readFileSync('/tmp/prod_uri.txt', 'utf8').trim(), { serverSelectionTimeoutMS: 15000 })
const db = mongoose.connection.db

const u = await db.collection('users').findOne({ email: EMAIL }, { projection: { _id: 1 } })
const s = await db.collection('schedules').findOne({ userId: u._id, programId: PROGRAM })

const key = (d) => new Date(d).toISOString().split('T')[0]
const idx6 = s.scheduledWorkouts.findIndex(w => key(w.date) === '2026-07-06' && w.dayLabel === 'Day 1')
const idx13 = s.scheduledWorkouts.findIndex(w => key(w.date) === '2026-07-13' && w.dayLabel === 'Day 1')

if (idx6 < 0 || idx13 < 0) { console.log('slots not found — aborting'); await mongoose.disconnect(); process.exit(1) }

const before6 = s.scheduledWorkouts[idx6], before13 = s.scheduledWorkouts[idx13]
console.log('BEFORE:')
console.log(`  Jul 6  ${before6.dayLabel} status=${before6.status} completedAt=${before6.completedAt ? key(before6.completedAt) : '-'}`)
console.log(`  Jul 13 ${before13.dayLabel} status=${before13.status} completedAt=${before13.completedAt ? key(before13.completedAt) : '-'}`)

// Safety: only act on the exact corrupt shape we diagnosed.
if (before6.status !== 'completed' || key(before6.completedAt || 0) !== '2026-07-13' || before13.status !== 'scheduled') {
  console.log('\nstate does not match the diagnosed bug — aborting (nothing changed)')
  await mongoose.disconnect(); process.exit(0)
}

console.log('\nAFTER:')
console.log('  Jul 6  Day 1 status=skipped   completedAt=(cleared)')
console.log(`  Jul 13 Day 1 status=completed completedAt=${LOG_TIME.toISOString()}`)

if (APPLY) {
  await db.collection('schedules').updateOne(
    { _id: s._id },
    {
      $set: {
        [`scheduledWorkouts.${idx6}.status`]: 'skipped',
        [`scheduledWorkouts.${idx13}.status`]: 'completed',
        [`scheduledWorkouts.${idx13}.completedAt`]: LOG_TIME,
      },
      $unset: { [`scheduledWorkouts.${idx6}.completedAt`]: '' },
    },
  )
  console.log('\nAPPLIED')
} else console.log('\n(dry-run — re-run with --apply)')

await mongoose.disconnect()

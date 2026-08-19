import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const { ObjectId } = mongoose.Types

// Usage: node scripts/inspect-user-progress.mjs <userIdOrEmail> [programNameFilter]
const arg = process.argv[2] || '693adca9073978ec812b601a'
const nameFilter = (process.argv[3] || '').toLowerCase()

const uri = readFileSync('/tmp/prod_uri.txt', 'utf8').trim()
await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
const db = mongoose.connection.db

// Resolve user by id or email
let userOid = null
if (/^[a-f0-9]{24}$/i.test(arg)) {
  userOid = new ObjectId(arg)
} else {
  const u = await db.collection('users').findOne({ email: arg })
  if (!u) { console.log('No user for ' + arg); process.exit(0) }
  userOid = u._id
  console.log('Resolved ' + arg + ' -> ' + userOid)
}

const progress = await db.collection('userprogresses').findOne({ userId: userOid })
if (!progress) { console.log('No userprogress doc for ' + userOid); process.exit(0) }

console.log('\n=== ACTIVE PROGRAMS ===')
for (const ap of (progress.activePrograms || [])) {
  console.log(JSON.stringify({
    programId: String(ap.programId),
    status: ap.status,
    currentPhase: ap.currentPhase,
    currentWeek: ap.currentWeek,
    currentDay: ap.currentDay,
    completedWorkouts: ap.completedWorkouts,
    totalWorkouts: ap.totalWorkouts,
    progress: ap.progress,
    startDate: ap.startDate,
    lastWorkoutDate: ap.lastWorkoutDate,
  }, null, 2))

  // Pull the program to compute the STRUCTURAL total (phases*weeks*days) vs stored totalWorkouts
  let prog = null
  try { prog = await db.collection('programs').findOne({ _id: new ObjectId(String(ap.programId)) }) } catch {}
  if (prog) {
    if (nameFilter && !String(prog.name || '').toLowerCase().includes(nameFilter)) continue
    console.log('  program.name       = ' + prog.name)
    console.log('  duration_weeks     = ' + prog.duration_weeks)
    console.log('  training_days/week = ' + prog.training_days_per_week)
    let structTotal = 0
    const phases = prog.phases || []
    phases.forEach((ph, i) => {
      const weeks = ph.duration_weeks ?? ph.weeks ?? prog.duration_weeks ?? 0
      const workoutsPerWeek = (ph.workouts || []).length
      structTotal += weeks * workoutsPerWeek
      console.log(`  phase[${i}] "${ph.name||''}" weeks=${weeks} workouts/week=${workoutsPerWeek} -> ${weeks*workoutsPerWeek}`)
    })
    console.log('  STRUCTURAL total (sum phase weeks*workouts) = ' + structTotal)

    // How many distinct completed program logs for THIS program?
    const progLogs = (progress.workoutLogs || []).filter(l => String(l.programId) === String(ap.programId))
    const doneLogs = progLogs.filter(l => l.completed)
    console.log('  workoutLogs for program: total=' + progLogs.length + ' completed=' + doneLogs.length)
  }
}

// Schedules for this user
const schedules = await db.collection('schedules').find({ userId: userOid }).toArray()
console.log('\n=== SCHEDULES (' + schedules.length + ') ===')
const today = new Date(); today.setHours(0,0,0,0)
for (const s of schedules) {
  const slots = s.scheduledWorkouts || []
  const by = {}
  for (const w of slots) by[w.status] = (by[w.status]||0)+1
  const sorted = [...slots].sort((a, b) => new Date(a.date) - new Date(b.date))
  const firstDate = sorted[0] ? new Date(sorted[0].date).toISOString().split('T')[0] : 'none'
  const lastDate = sorted.length ? new Date(sorted[sorted.length-1].date).toISOString().split('T')[0] : 'none'
  const futureScheduled = sorted.filter(w => w.status==='scheduled' && new Date(w.date) >= today)
  console.log('\nProgram: ' + s.programId)
  console.log('  autoAdvance=' + s.autoAdvance + ' startDate=' + (s.startDate? new Date(s.startDate).toISOString().split('T')[0]:'?'))
  console.log('  slots total=' + slots.length + ' by-status=' + JSON.stringify(by))
  console.log('  slot date range: ' + firstDate + ' .. ' + lastDate)
  console.log('  FUTURE scheduled (>= today): ' + futureScheduled.length)
  for (const w of futureScheduled.slice(0,6)) {
    console.log('    NEXT ' + new Date(w.date).toISOString().split('T')[0] + ' "' + w.dayLabel + '" phase:' + w.phase)
  }
  // last 6 slots regardless of status, to see the tail
  console.log('  tail (last 6 slots by date):')
  for (const w of sorted.slice(-6)) {
    console.log('    ' + new Date(w.date).toISOString().split('T')[0] + ' [' + w.status + '] "' + w.dayLabel + '"')
  }
}

await mongoose.disconnect()

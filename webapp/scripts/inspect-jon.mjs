import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const { ObjectId } = mongoose.Types

const uri = readFileSync('/tmp/prod_uri.txt', 'utf8').trim()
await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
const db = mongoose.connection.db

// jondon27500@gmail.com — Jonathan Don
const JON_OID = new ObjectId('69324119a28a8ac3b78750b9')

const progress = await db.collection('userprogresses').findOne({ userId: JON_OID })
if (!progress) { console.log('No progress for Jon'); process.exit(0) }

console.log('=== ACTIVE PROGRAMS ===')
for (const ap of (progress.activePrograms || [])) {
  console.log(JSON.stringify({
    programId: ap.programId,
    status: ap.status,
    currentPhase: ap.currentPhase,
    currentDay: ap.currentDay,
    completedWorkouts: ap.completedWorkouts,
    totalWorkouts: ap.totalWorkouts,
    startDate: ap.startDate,
    lastWorkoutDate: ap.lastWorkoutDate
  }, null, 2))
}

const logs = (progress.workoutLogs || [])
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  .slice(0, 30)

console.log('\n=== RECENT WORKOUT LOGS ===')
for (const log of logs) {
  const dateStr = new Date(log.date).toISOString().split('T')[0]
  console.log(dateStr + ' | "' + log.day + '" | phase:' + log.phase + ' | done:' + log.completed)
}

const schedules = await db.collection('schedules').find({ userId: JON_OID }).toArray()
console.log('\n=== SCHEDULES (' + schedules.length + ') ===')
for (const s of schedules) {
  const slots = s.scheduledWorkouts || []
  const done = slots.filter(w => w.status === 'completed').length
  const sched = slots.filter(w => w.status === 'scheduled').length
  console.log('Program: ' + s.programId + ' | total:' + slots.length + ' done:' + done + ' sched:' + sched)
  const sorted = [...slots].sort((a, b) => new Date(a.date) - new Date(b.date))
  const lastDone = sorted.filter(w => w.status === 'completed').slice(-5)
  const nextUp = sorted.filter(w => w.status === 'scheduled').slice(0, 5)
  for (const w of lastDone) {
    const sd = new Date(w.date).toISOString().split('T')[0]
    const cd = w.completedAt ? new Date(w.completedAt).toISOString().split('T')[0] : 'none'
    console.log('  DONE  sched:' + sd + ' "' + w.dayLabel + '" completedAt:' + cd)
  }
  for (const w of nextUp) {
    console.log('  NEXT  ' + new Date(w.date).toISOString().split('T')[0] + ' "' + w.dayLabel + '"')
  }
}

await mongoose.disconnect()

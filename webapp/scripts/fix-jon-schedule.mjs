import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const { ObjectId } = mongoose.Types

const uri = readFileSync('/tmp/prod_uri.txt', 'utf8').trim()
await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
const db = mongoose.connection.db

const JON_OID = new ObjectId('69324119a28a8ac3b78750b9')
const progress = await db.collection('userprogresses').findOne({ userId: JON_OID })
const schedDoc = await db.collection('schedules').findOne({ userId: JON_OID })

const completedLogs = (progress.workoutLogs || []).filter(l => l.completed)
const logsByDay = {}
for (const log of completedLogs) {
  if (!logsByDay[log.day]) logsByDay[log.day] = []
  logsByDay[log.day].push({ date: new Date(log.date) })
}
for (const key of Object.keys(logsByDay)) {
  logsByDay[key].sort((a, b) => a.date - b.date)
}

// Log counts
for (const [day, logs] of Object.entries(logsByDay)) {
  console.log('Pool "' + day + '": ' + logs.length + ' logs → ' + logs.map(l => l.date.toISOString().split('T')[0]).join(', '))
}

const pool = {}
for (const [day, logs] of Object.entries(logsByDay)) {
  pool[day] = [...logs]
}

const now = new Date(); now.setHours(0,0,0,0)
const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
const WINDOW_MS = 8 * 86400000

const sorted = [...(schedDoc.scheduledWorkouts || [])]
  .sort((a, b) => new Date(a.date) - new Date(b.date))

const updatedSlots = []
for (const slot of sorted) {
  const slotDate = new Date(slot.date); slotDate.setHours(0,0,0,0)
  const available = pool[slot.dayLabel] || []

  // Future (strictly after today) — leave as scheduled
  if (slotDate >= tomorrow) {
    const s = JSON.parse(JSON.stringify(slot))
    s.status = 'scheduled'
    delete s.completedAt
    updatedSlots.push(s)
    continue
  }

  // Find closest available log within 8-day window
  let bestIdx = -1, bestDiff = Infinity
  for (let i = 0; i < available.length; i++) {
    const diff = Math.abs(available[i].date.getTime() - slotDate.getTime())
    if (diff <= WINDOW_MS && diff < bestDiff) {
      bestDiff = diff; bestIdx = i
    }
  }

  if (bestIdx >= 0) {
    const log = available.splice(bestIdx, 1)[0]
    const s = JSON.parse(JSON.stringify(slot))
    s.status = 'completed'
    s.completedAt = log.date
    updatedSlots.push(s)
  } else if (slotDate < now) {
    // Strictly past and no log → missed
    const s = JSON.parse(JSON.stringify(slot))
    s.status = 'missed'
    delete s.completedAt
    updatedSlots.push(s)
  } else {
    // Today, no log yet → keep as scheduled
    const s = JSON.parse(JSON.stringify(slot))
    s.status = 'scheduled'
    delete s.completedAt
    updatedSlots.push(s)
  }
}

console.log('\n=== RESULT ===')
for (let i = 0; i < sorted.length; i++) {
  const neu = updatedSlots[i]
  const sd = new Date(neu.date).toISOString().split('T')[0]
  const ca = neu.completedAt ? new Date(neu.completedAt).toISOString().split('T')[0] : 'none'
  console.log(sd + ' "' + neu.dayLabel + '" → ' + neu.status + ' completedAt:' + ca)
}

const doneCount = updatedSlots.filter(s => s.status === 'completed').length
const futureCount = updatedSlots.filter(s => s.status === 'scheduled').length
console.log('\n' + doneCount + ' done | ' + futureCount + ' remaining to finish the program')

if (process.env.DRY_RUN === '1') {
  console.log('DRY RUN — no changes made')
  await mongoose.disconnect(); process.exit(0)
}

await db.collection('schedules').updateOne(
  { userId: JON_OID },
  { $set: { scheduledWorkouts: updatedSlots } }
)
await db.collection('userprogresses').updateOne(
  { userId: JON_OID, 'activePrograms.programId': schedDoc.programId },
  { $set: { 'activePrograms.$.completedWorkouts': doneCount } }
)
console.log('\n✓ Schedule corrected.')
await mongoose.disconnect()

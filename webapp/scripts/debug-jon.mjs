import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const { ObjectId } = mongoose.Types

const uri = readFileSync('/tmp/prod_uri.txt', 'utf8').trim()
await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
const db = mongoose.connection.db

const JON_OID = new ObjectId('69324119a28a8ac3b78750b9')

// Show schedule slots for April + all their statuses
const schedule = await db.collection('schedules').findOne({ userId: JON_OID })
if (!schedule) { console.log('No schedule'); process.exit(0) }

const slots = (schedule.scheduledWorkouts || [])
  .sort((a, b) => new Date(a.date) - new Date(b.date))

console.log('=== ALL "Day 3" SLOTS ===')
const day3 = slots.filter(w => w.dayLabel === 'Day 3')
for (const w of day3) {
  const d = new Date(w.date).toISOString()
  const ca = w.completedAt ? new Date(w.completedAt).toISOString().split('T')[0] : 'none'
  console.log(`${d} | status:${w.status} | completedAt:${ca}`)
}

console.log('\n=== ALL APRIL SCHEDULE SLOTS ===')
for (const w of slots) {
  const d = new Date(w.date).toISOString().split('T')[0]
  const ca = w.completedAt ? new Date(w.completedAt).toISOString().split('T')[0] : 'none'
  if (d >= '2026-04-10') {
    console.log(`${d} | "${w.dayLabel}" | status:${w.status} | completedAt:${ca}`)
  }
}

// Show recent workout logs
const progress = await db.collection('userprogresses').findOne({ userId: JON_OID })
const logs = (progress?.workoutLogs || [])
  .sort((a, b) => new Date(b.date) - new Date(a.date))
  .slice(0, 20)

console.log('\n=== RECENT WORKOUT LOGS (last 20) ===')
for (const log of logs) {
  const d = new Date(log.date).toISOString().split('T')[0]
  console.log(`${d} | day:"${log.day}" | completed:${log.completed} | pid:${log.programId}`)
}

await mongoose.disconnect()

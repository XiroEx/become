import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const { ObjectId } = mongoose.Types

const uri = readFileSync('/tmp/prod_uri.txt', 'utf8').trim()
await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
const db = mongoose.connection.db

const JON_OID = new ObjectId('69324119a28a8ac3b78750b9')
const apr15 = new Date('2026-04-15T00:00:00.000Z')
const completedAt = new Date('2026-04-16T12:00:00.000Z')

const result = await db.collection('schedules').updateOne(
  { userId: JON_OID },
  { $set: { 'scheduledWorkouts.$[elem].status': 'completed', 'scheduledWorkouts.$[elem].completedAt': completedAt } },
  { arrayFilters: [{ 'elem.dayLabel': 'Day 3', 'elem.status': 'missed' }] }
)
console.log('Patched Apr 15 Day 3:', result.modifiedCount, 'doc(s) modified')
await mongoose.disconnect()

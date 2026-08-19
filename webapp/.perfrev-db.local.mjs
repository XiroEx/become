import mongoose from 'mongoose'
import { readFileSync } from 'fs'
const RAW = readFileSync('/tmp/hb/env','utf8').split('\n').find(l => l.startsWith('MONGODB_URI=')).slice('MONGODB_URI='.length).trim()
const uri = RAW
await mongoose.connect(uri)
const tok = readFileSync('/tmp/hb/jon.token','utf8').trim()
const payload = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString())
const userId = payload.userId || payload.sub || payload.id
console.log('user', userId)
const col = mongoose.connection.db.collection('userprogresses')
const doc = await col.findOne({ userId: new mongoose.Types.ObjectId(userId) })
if (!doc) { console.log('no progress doc'); process.exit(0) }
const bson = (await import('bson')).default ?? await import('bson')
const size = (o) => bson.BSON ? bson.BSON.serialize({v:o}).length : bson.serialize({v:o}).length
console.log('total doc bytes', size(doc), 'workoutLogs', doc.workoutLogs?.length, 'bytes', size(doc.workoutLogs ?? []), 'weightHistory', doc.weightHistory?.length, size(doc.weightHistory ?? []), 'exercisePRs', doc.exercisePRs?.length, size(doc.exercisePRs ?? []), 'moodHistory', doc.moodHistory?.length)
// projected shape
const slim = (doc.workoutLogs ?? []).map(l => ({ date: l.date, completed: l.completed, title: l.title, day: l.day }))
console.log('slim workoutLogs bytes', size(slim))
// stats over all users
const agg = await col.aggregate([{ $project: { n: { $size: { $ifNull: ['$workoutLogs', []] } }, sz: { $bsonSize: '$$ROOT' } } }, { $sort: { sz: -1 } }, { $limit: 5 }]).toArray()
console.log('largest userprogress docs (bytes, workouts):', agg.map(a => `${a.sz}/${a.n}`).join(' '))
await mongoose.disconnect()

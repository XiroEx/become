import { MongoClient, ObjectId } from 'mongodb'
import jwt from 'jsonwebtoken'
const prod = new MongoClient(process.env.PRODURI); await prod.connect()
const tortilla = await prod.db().collection('foods').findOne({ name: /original zero/i })
await prod.close()
const c = new MongoClient('mongodb://127.0.0.1:27025/become-photo'); await c.connect()
const db = c.db()
for (const n of ['foods','users','foodflags','meallogs']) await db.collection(n).deleteMany({})
await db.collection('foods').insertOne(tortilla)
await db.collection('foods').createIndex({ name: 'text', description: 'text', tags: 'text', brand: 'text' })
const id = new ObjectId()
await db.collection('users').insertOne({ _id: id, email: 'g@example.com', name: 'G', onboardingCompleted: true, createdAt: new Date(Date.now()-365*864e5) })
console.log(JSON.stringify({ token: jwt.sign({ userId: String(id), email: 'g@example.com' }, 'photo-secret', { expiresIn: '6h' }) }))
await c.close()

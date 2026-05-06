import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

// Load .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '../.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const [key, ...rest] = line.split('=')
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
}

const require = createRequire(import.meta.url)
const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) { console.error('No MONGODB_URI'); process.exit(1) }

await mongoose.connect(MONGODB_URI)
console.log('Connected to MongoDB')

const result = await mongoose.connection.db.collection('users').updateMany(
  {},
  { $set: { onboardingCompleted: false } }
)

console.log(`Done — matched: ${result.matchedCount}, modified: ${result.modifiedCount}`)
await mongoose.disconnect()

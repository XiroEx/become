// Mint a capture session for an EXISTING user by inserting a magic link, then redeeming it.
// NOTE: the app reads magic links from the APP database (MONGODB_URI), not become_auth. Prefer
// redeem-session.mjs (send-link via the app, then redeem by sessionId) so nothing is inserted by hand.
// Usage: AUTH_URI=... NODE_PATH=webapp/node_modules node marketing/scripts/capture/mint-session.mjs <email> <outfile>
// Refuses to run for an email with no user doc (login mode would create one).
import mongoose from 'mongoose'
import crypto from 'crypto'
import fs from 'fs'

const [email, outfile] = process.argv.slice(2)
const uri = process.env.AUTH_URI
if (!email || !outfile || !uri) { console.error('missing args/env'); process.exit(1) }

await mongoose.connect(uri)
const db = mongoose.connection.db
const user = await db.collection('users').findOne({ email: email.toLowerCase() })
if (!user) { console.error('NO USER for', email, '- aborting (would create one)'); process.exit(2) }
console.log('user found:', JSON.stringify({ name: user.name, id: String(user._id).slice(-6) }))

const token = crypto.randomBytes(32).toString('hex')
const sessionId = crypto.randomBytes(16).toString('hex')
await db.collection('magiclinks').insertOne({
  email: email.toLowerCase(), token, sessionId, mode: 'login',
  expiresAt: new Date(Date.now() + 15 * 60 * 1000), used: false,
  createdAt: new Date(), updatedAt: new Date(),
})
const res = await fetch('https://become.redbtn.io/api/auth/verify-link', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token }),
})
const j = await res.json()
if (!res.ok || !j.token) { console.error('verify failed', res.status, JSON.stringify(Object.keys(j))); process.exit(3) }
fs.writeFileSync(outfile, j.token, { mode: 0o600 })
console.log('token written to', outfile, 'for user', j.user?.name)
await mongoose.disconnect()

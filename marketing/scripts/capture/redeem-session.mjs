// Find the magic-link doc the app just created (by public sessionId), redeem it
// via the app's verify endpoint, save the JWT. Token value never printed.
import mongoose from 'mongoose'
import fs from 'fs'

const [sessionId, outfile] = process.argv.slice(2)
const uris = [
  ['AUTH_MONGODB_URI', process.env.AUTH_URI],
  ['MONGODB_URI', process.env.APP_URI],
].filter(([, u]) => u)

let doc = null
let where = null
for (const [label, uri] of uris) {
  try {
    const conn = await mongoose.createConnection(uri).asPromise()
    const d = await conn.db.collection('magiclinks').findOne({ sessionId })
    console.log(label, '->', conn.db.databaseName, d ? 'HAS doc' : 'no doc')
    if (d && !doc) { doc = d; where = conn.db.databaseName }
    await conn.close()
  } catch (e) {
    console.log(label, 'connect failed:', e.message.slice(0, 80))
  }
}
if (!doc) { console.error('doc not found anywhere'); process.exit(2) }
console.log('redeeming link from', where)
const res = await fetch('https://become.redbtn.io/api/auth/verify-link', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token: doc.token }),
})
const j = await res.json()
if (!res.ok || !j.token) { console.error('verify failed', res.status); process.exit(3) }
fs.writeFileSync(outfile, j.token, { mode: 0o600 })
console.log('JWT saved to', outfile, 'user:', j.user?.name)

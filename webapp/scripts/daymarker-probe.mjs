/**
 * Does logging mood/weight TODAY actually read back as "today" for a member
 * west of UTC? Scratch DB only.
 */
import { NextRequest } from 'next/server'

const { default: mongoose } = await import('mongoose')
const { default: UserProgress } = await import('../models/UserProgress.ts')
const { signToken } = await import('../lib/auth.ts')
const mood = await import('../app/api/mood/route.ts')
const weight = await import('../app/api/weight/route.ts')

const URI = process.env.MONGODB_URI
if (!URI || !/localhost|127\.0\.0\.1/.test(URI)) throw new Error('local only')
await mongoose.connect(URI)

const userId = new mongoose.Types.ObjectId()
const token = await signToken({ userId: userId.toString(), email: 'probe@test.local' })
const auth = { Authorization: `Bearer ${token}` }

for (const TZ of [0, 300, 480, -60]) {
  await UserProgress.deleteOne({ userId })

  const post = (mod, body) =>
    mod.POST(
      new NextRequest('http://localhost/x', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, tz: TZ }),
      }),
    )

  // Log BOTH, right now, as the member would.
  await post(mood, { mood: 4 })
  await post(weight, { weight: 210 })

  const m = await (await mood.GET(new NextRequest(`http://localhost/x?tz=${TZ}`, { headers: auth }))).json()
  const w = await (await weight.GET(new NextRequest(`http://localhost/x?tz=${TZ}`, { headers: auth }))).json()

  const label =
    TZ === 0 ? 'UTC' : TZ === 300 ? 'US Eastern' : TZ === 480 ? 'US Pacific' : 'Central Europe'
  const ok = m.daysSinceLastEntry === 0 && w.daysSinceLastEntry === 0 && m.todaysMood === 4
  console.log(
    `${ok ? 'OK  ' : 'BUG '} tz=${String(TZ).padStart(4)} (${label.padEnd(15)}) ` +
      `after logging both just now: daysSinceMood=${m.daysSinceLastEntry} ` +
      `daysSinceWeight=${w.daysSinceLastEntry} todaysMood=${m.todaysMood} ` +
      `needsWeightCheck=${w.needsWeightCheck}`,
  )
}

await UserProgress.deleteOne({ userId })
await mongoose.disconnect()

// One-off: reset a user's Mind progress for retesting. Resets MindProgress
// (chapter 1, xp 0, fresh history) and deletes their MindSession docs (so the
// daily session replays + the streak resets). Identity/Vision/Mission content
// is left intact. URL from PROD_MONGODB_URI. Pass the email as argv[2].
const { MongoClient } = require('mongodb')

;(async () => {
  const uri = process.env.PROD_MONGODB_URI
  const email = process.argv[2]
  if (!uri || !email) { console.error('usage: PROD_MONGODB_URI=... node reset-mind-progress.cjs <email>'); process.exit(1) }
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()
  console.log('DB:', db.databaseName)

  const user = await db.collection('users').findOne({ email })
  if (!user) { console.error('no user for', email); process.exit(1) }
  const userId = user._id
  console.log('user:', email, String(userId))

  const mp = await db.collection('mindprogresses').findOneAndUpdate(
    { userId },
    {
      $set: {
        chapter: 1,
        xp: 0,
        chapterHistory: [{ chapter: 1, unlockedAt: new Date() }],
        selfDeclaredChapters: [],
      },
    },
    { upsert: true, returnDocument: 'after' },
  )
  const sess = await db.collection('mindsessions').deleteMany({ userId })

  console.log('MindProgress → chapter:', mp.value?.chapter ?? mp.chapter, 'xp:', mp.value?.xp ?? mp.xp)
  console.log('MindSession docs deleted:', sess.deletedCount)

  await client.close()
})().catch((e) => { console.error(e); process.exit(1) })

import { createRequire } from 'module'; import { readFileSync } from 'fs'
const require = createRequire(import.meta.url); const mongoose = require('mongoose')
// Migrate legacy profile.fitnessGoal values onto the current enum. "build_muscle"
// predates the rename to "gain_muscle"; it isn't a key of GOAL_KEYWORDS, which
// crashed the Workout page. The code now guards this, but the data should still
// be correct so the user actually gets recommendations.
const MAP = { build_muscle: 'gain_muscle', lose_fat: 'lose_weight', weight_loss: 'lose_weight' }
const VALID = ['lose_weight','gain_muscle','maintain','improve_performance','general_health']
await mongoose.connect(readFileSync('/tmp/prod_uri.txt','utf8').trim(), { serverSelectionTimeoutMS:15000 })
const db = mongoose.connection.db
const users = await db.collection('users').find({ 'profile.fitnessGoal':{$exists:true} },
  {projection:{email:1,'profile.fitnessGoal':1}}).toArray()
let n=0
for (const u of users) {
  const g = u.profile.fitnessGoal
  if (VALID.includes(g)) continue
  const next = MAP[g]
  if (!next) { console.log(`  ${u.email}: goal="${g}" — no mapping, LEFT ALONE (code guard prevents the crash)`); continue }
  console.log(`  ${u.email}: "${g}" → "${next}"`)
  n++
  if (process.argv.includes('--apply')) {
    await db.collection('users').updateOne({_id:u._id},{$set:{'profile.fitnessGoal':next}})
  }
}
console.log(`\n${process.argv.includes('--apply')?'APPLIED':'(dry-run)'} — ${n} migrated`)
await mongoose.disconnect()

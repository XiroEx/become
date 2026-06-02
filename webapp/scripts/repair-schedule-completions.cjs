// Repair for the "completion marked a FUTURE slot instead of the overdue one"
// bug. Within each (schedule, dayLabel): while there's a `completed` slot dated
// in the future AND an outstanding (missed/scheduled) slot dated today-or-past,
// relocate the completion to the EARLIEST outstanding slot and revert the future
// slot to `scheduled`. Net completed count is unchanged.
//
// Dry-run by default; pass --apply to write. URI from PROD_MONGODB_URI.
const { MongoClient } = require('mongodb')

const APPLY = process.argv.includes('--apply')

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10)
}

;(async () => {
  const uri = process.env.PROD_MONGODB_URI
  if (!uri) { console.error('no PROD_MONGODB_URI'); process.exit(1) }
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()
  console.log('DB:', db.databaseName, '| mode:', APPLY ? 'APPLY' : 'DRY-RUN')

  const todayKey = new Date().toISOString().slice(0, 10)
  const schedules = await db.collection('schedules').find({}).toArray()

  let schedulesChanged = 0
  let slotsFixed = 0

  for (const s of schedules) {
    const slots = s.scheduledWorkouts || []
    let changed = false

    // Group indices by dayLabel.
    const byDay = new Map()
    slots.forEach((w, i) => {
      if (!byDay.has(w.dayLabel)) byDay.set(w.dayLabel, [])
      byDay.get(w.dayLabel).push(i)
    })

    for (const [, idxs] of byDay) {
      // Future completed slots (newest first — relocate the furthest-out first).
      const completedFuture = idxs
        .filter((i) => slots[i].status === 'completed' && dayKey(slots[i].date) > todayKey)
        .sort((a, b) => dayKey(slots[b].date).localeCompare(dayKey(slots[a].date)))
      // Outstanding overdue/today slots (oldest first — fill the backlog in order).
      const outstandingPast = idxs
        .filter(
          (i) =>
            (slots[i].status === 'missed' || slots[i].status === 'scheduled') &&
            dayKey(slots[i].date) <= todayKey
        )
        .sort((a, b) => dayKey(slots[a].date).localeCompare(dayKey(slots[b].date)))

      const n = Math.min(completedFuture.length, outstandingPast.length)
      for (let k = 0; k < n; k++) {
        const futureIdx = completedFuture[k]
        const pastIdx = outstandingPast[k]
        const completedAt = slots[futureIdx].completedAt || new Date()
        console.log(
          `  [${s.programId} ${String(s.userId).slice(-6)}] ${slots[pastIdx].dayLabel}: ` +
          `move completion ${dayKey(slots[futureIdx].date)} → ${dayKey(slots[pastIdx].date)} ` +
          `(${slots[pastIdx].status} → completed; future → scheduled)`
        )
        slots[pastIdx].status = 'completed'
        slots[pastIdx].completedAt = completedAt
        slots[futureIdx].status = 'scheduled'
        slots[futureIdx].completedAt = undefined
        changed = true
        slotsFixed++
      }
    }

    if (changed) {
      schedulesChanged++
      if (APPLY) {
        await db.collection('schedules').updateOne(
          { _id: s._id },
          { $set: { scheduledWorkouts: slots } }
        )
      }
    }
  }

  console.log(`\nschedules ${APPLY ? 'updated' : 'to update'}: ${schedulesChanged} | slots fixed: ${slotsFixed}`)
  await client.close()
})().catch((e) => { console.error(e); process.exit(1) })

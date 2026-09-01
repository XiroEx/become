// Run ownership: bind a become-ai runId to the user who triggered it, so the
// poll route can prove the caller owns what they are asking for.
//
// Every decision here fails CLOSED — an unknown run, a foreign run, and a
// lookup error are all "not yours".

import dbConnect from '@/lib/mongodb'
import AiRun from '@/models/AiRun'

export interface RunOwnerRecord {
  userId: string
}

/** The whole authorization decision, as a pure function (unit-testable, no DB). */
export function isRunOwner(record: RunOwnerRecord | null | undefined, userId: string): boolean {
  if (!record || !userId) return false
  return String(record.userId) === String(userId)
}

/** Bind a freshly triggered run to its initiator. Never throws; false = not tracked. */
export async function recordRunOwner(
  runId: string,
  userId: string,
  task: string,
): Promise<boolean> {
  if (!runId || !userId) return false
  try {
    await dbConnect()
    // $setOnInsert: a runId can never be re-owned by a later caller.
    await AiRun.updateOne(
      { runId },
      { $setOnInsert: { runId, userId, task, createdAt: new Date() } },
      { upsert: true },
    )
    return true
  } catch (err) {
    console.error('recordRunOwner failed', { runId, err })
    return false
  }
}

export async function loadRunOwner(runId: string): Promise<RunOwnerRecord | null> {
  if (!runId) return null
  await dbConnect()
  const doc = await AiRun.findOne({ runId })
    .select('userId')
    .lean<{ userId?: string } | null>()
  return doc?.userId ? { userId: String(doc.userId) } : null
}

/** Fails CLOSED: an unknown run, a foreign run, or a lookup error are all `false`. */
export async function userOwnsRun(runId: string, userId: string): Promise<boolean> {
  try {
    return isRunOwner(await loadRunOwner(runId), userId)
  } catch (err) {
    console.error('userOwnsRun lookup failed', { runId, err })
    return false
  }
}

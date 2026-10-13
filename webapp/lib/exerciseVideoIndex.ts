import mongoose from 'mongoose'

// ---------------------------------------------------------------------------
// Self-heals a legacy artifact left behind by commit 9ce2da4
// ("fix(exercises): video upload hardening — slug-keyed metadata..."). Before
// that commit, `exercisevideos` enforced a UNIQUE index on `exerciseName`.
// The commit relaxed the Mongoose schema — two exercises are allowed to
// share a display name now, keyed instead by the now-unique `slug` — but
// Mongoose's `autoIndex` only ever CREATES indexes the schema currently
// declares; it never drops one the schema stopped declaring. Any environment
// that had already built the old unique index before the schema changed is
// stuck enforcing it at the database layer forever, so an upsert for a name
// that collides with an existing row keeps failing with E11000 even though
// the app no longer requires uniqueness on that field ("Leg Press" is the
// name that surfaced this in production — two exercises share that display
// name, and every attempt to save a video for the second one hit this).
// ---------------------------------------------------------------------------

const STALE_INDEX_FIELD = 'exerciseName'

interface MongoWriteError {
  code?: number
  keyPattern?: Record<string, unknown>
  message?: string
}

/** True when `error` is the stale unique-index collision described above. */
export function isStaleExerciseNameUniqueIndexError(error: unknown): boolean {
  const err = error as MongoWriteError | null | undefined
  if (!err || typeof err !== 'object' || err.code !== 11000) return false
  if (err.keyPattern && STALE_INDEX_FIELD in err.keyPattern) return true
  return typeof err.message === 'string' && err.message.includes(`${STALE_INDEX_FIELD}_1`)
}

interface IndexInfo {
  name?: string
  unique?: boolean
  key?: Record<string, number>
}

let repairPromise: Promise<boolean> | null = null

/**
 * Drops the stale unique index if it is still present, replacing it with the
 * plain (non-unique) index the schema declares. Cached per-process so a
 * burst of colliding requests only pays for the `listIndexes` round trip
 * once; reset on failure so a later request can retry (e.g. a transient
 * permission blip). Returns whether a stale index was found and removed.
 */
export async function dropStaleExerciseNameUniqueIndex(): Promise<boolean> {
  if (!repairPromise) {
    repairPromise = (async () => {
      const coll = mongoose.connection.collection('exercisevideos')
      const indexes = (await coll.indexes()) as unknown as IndexInfo[]
      const stale = indexes.find(
        (idx) =>
          idx.unique &&
          idx.key &&
          Object.keys(idx.key).length === 1 &&
          idx.key[STALE_INDEX_FIELD] !== undefined
      )
      if (!stale?.name) return false
      await coll.dropIndex(stale.name)
      await coll.createIndex({ [STALE_INDEX_FIELD]: 1 }, { unique: false, background: true })
      return true
    })().catch((err) => {
      repairPromise = null
      throw err
    })
  }
  return repairPromise
}

/**
 * Runs a `findOneAndUpdate` upsert against `ExerciseVideo`, transparently
 * repairing and retrying once if it hits the stale-index collision. Callers
 * don't need to know this index ever existed — a colliding write just works.
 */
export async function upsertRetryingStaleIndex<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (error) {
    if (!isStaleExerciseNameUniqueIndexError(error)) throw error
    await dropStaleExerciseNameUniqueIndex()
    return op()
  }
}

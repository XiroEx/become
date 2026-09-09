// ---------------------------------------------------------------------------
// Who may read a BlobStore object, decided from its KEY.
//
// `GET /api/blob/<...key>` used to stream any object in the bucket to anyone,
// unauthenticated. That was written for `exercises/<slug>/<rand>.mp4` — a
// shared demo-video catalogue where "public" is correct — and then every
// per-user upload route was pointed at the same proxy:
//
//   scans/<userId>/<rand>.jpg           a photo of the member's plate
//   food-flags/<userId>/<rand>.jpg      the panel photo on a food report
//   custom-exercises/<userId>/<slug>/…  a member's own demo video
//   chat/<userId>/<rand>.jpg            a chat attachment
//   avatars/<userId>/<rand>.jpg         a profile picture
//
// The key names the owner, so the owner is derivable from the key and NEVER
// from a query parameter (a caller who could name the owner would just name
// themselves). Everything here is a pure function of the key so the whole
// policy is unit-testable without a request, a session or a bucket.
//
// Three visibilities, and the difference between the last two is the point:
//
//   'public'  — genuinely shared content. No session required, and the
//               response stays `public, max-age=31536000, immutable`.
//   'member'  — any signed-in member. Used where the object is deliberately
//               shown to people other than its uploader but the audience
//               cannot be recovered from the key alone.
//   'owner'   — the uploading member, or a database-confirmed admin.
//
// DEFAULT-DENY on anything unrecognised: an unknown prefix whose second
// segment looks like a user id is treated as owner-scoped, so the NEXT
// per-user upload route added to this bucket is protected on the day it ships
// rather than on the day someone remembers this file.
// ---------------------------------------------------------------------------

export type BlobVisibility = 'public' | 'member' | 'owner'

export interface BlobPolicy {
  visibility: BlobVisibility
  /** Present only when `visibility === 'owner'`. Taken from the key. */
  ownerId?: string
  /** Why, for the route's log line and for the tests. */
  reason: string
}

export interface BlobCaller {
  /** undefined = anonymous. */
  userId?: string | null
  /** MUST be a database-confirmed admin (isVerifiedAdmin), never a token claim. */
  isAdmin?: boolean
}

/**
 * Prefixes served to everyone, unauthenticated, exactly as before.
 *
 *  - `exercises/…`  the shared exercise-demo catalogue. One object per
 *    exercise slug, shown to every member; there is no owner to check.
 *  - `avatars/…`    a profile picture. DELIBERATELY public, for two reasons.
 *    First, an avatar is content a member publishes about themselves and is
 *    meant to be seen by the other people in their conversations. Second, and
 *    decisively: `components/Avatar.tsx` renders it through `next/image`, and
 *    the Next image optimizer re-fetches `/api/blob/…` from the server with
 *    NO cookies and no Authorization header. Gating avatars therefore breaks
 *    the member's own avatar everywhere in the app, not just other people's.
 *    If avatars ever need gating, that component has to stop using the
 *    optimizer first — see the note in app/api/blob/[...key]/route.ts.
 */
const PUBLIC_PREFIXES = new Set(['exercises', 'avatars'])

/**
 * Per-user prefixes whose objects are shown to OTHER members by design, so an
 * owner check would be a regression rather than a fix.
 *
 *  - `chat/<userId>/…` is an attachment on a Message in a Conversation. Every
 *    other participant must be able to load it, and the conversation cannot be
 *    recovered from the key: it would take `Message.findOne({ imageUrl })` on
 *    an unindexed field — a collection scan on every image in every chat. So
 *    this is narrowed from "anyone on the internet" to "a signed-in member",
 *    which closes the unauthenticated exposure, and participant-scoping is
 *    left as a follow-up that needs an index on `Message.imageUrl` first.
 *
 *  - `custom-exercises/<userId>/…` is a member's own demo video, and an admin
 *    approving it flips `isUniversal` (app/api/admin/exercises/review) WITHOUT
 *    re-keying the object — `visibleExerciseFilter` then shows that exercise,
 *    and that video, to every member. Owner-scoping it would blank the demo
 *    for everyone but its author. It is also a video of a barbell, not a photo
 *    of someone's dinner.
 */
const MEMBER_PREFIXES = new Set(['chat', 'custom-exercises'])

/**
 * Per-user prefixes that are private to their uploader. `<prefix>/<userId>/…`.
 * Nothing in the app shows one of these to anyone but its owner (and staff, in
 * the food-report review queue).
 */
const OWNER_PREFIXES = new Set(['scans', 'food-flags'])

/** A Mongo ObjectId as it appears in a key. */
const OBJECT_ID = /^[0-9a-f]{24}$/i

/**
 * Reject anything that is not a plain, forward-only object key before it is
 * used either as an owner claim or as an S3 key: no traversal, no empty
 * segments, no absolute paths, no NUL. Keys this app writes are
 * `<prefix>/<id>/<random><ext>` and never contain any of it.
 */
export function isSafeBlobKey(key: string): boolean {
  if (!key || key.length > 1024) return false
  if (key.startsWith('/') || key.includes('\\') || key.includes('\0')) return false
  const parts = key.split('/')
  if (parts.length < 2) return false
  return parts.every(p => p.length > 0 && p !== '.' && p !== '..')
}

/**
 * The policy for a key. Pure — no session, no database, no network.
 */
export function blobPolicy(key: string): BlobPolicy {
  if (!isSafeBlobKey(key)) {
    // Unreadable by anyone. The route answers 400 before it ever reaches S3.
    return { visibility: 'owner', ownerId: undefined, reason: 'malformed key' }
  }

  const [prefix, second] = key.split('/')

  if (PUBLIC_PREFIXES.has(prefix)) {
    return { visibility: 'public', reason: `${prefix}/ is shared content` }
  }
  if (MEMBER_PREFIXES.has(prefix)) {
    return { visibility: 'member', reason: `${prefix}/ is shared with other members` }
  }
  if (OWNER_PREFIXES.has(prefix)) {
    return { visibility: 'owner', ownerId: second, reason: `${prefix}/ is private to its owner` }
  }

  // Unrecognised prefix. If it is shaped like a per-user namespace, treat it as
  // one — a new upload route is far more likely to be per-user than to be a new
  // public catalogue, and being wrong in this direction costs a 404 rather than
  // a leak.
  if (OBJECT_ID.test(second)) {
    return { visibility: 'owner', ownerId: second, reason: 'unknown per-user prefix' }
  }
  return { visibility: 'member', reason: 'unknown prefix' }
}

/**
 * May this caller read this key? `caller.isAdmin` must already have been
 * confirmed against the User row by the route.
 */
export function canReadBlob(key: string, caller: BlobCaller): boolean {
  // A key that is not a plain forward-only object key is readable by nobody,
  // admin included — the route rejects it as 400 before S3 is ever asked.
  if (!isSafeBlobKey(key)) return false
  const policy = blobPolicy(key)
  if (policy.visibility === 'public') return true
  if (!caller.userId) return false
  if (policy.visibility === 'member') return true
  if (caller.isAdmin) return true
  if (!policy.ownerId) return false
  // Keys are written from an ObjectId hex string; `customExerciseVideoKey`
  // additionally lowercases it, so the comparison is case-insensitive.
  return policy.ownerId.toLowerCase() === caller.userId.toLowerCase()
}

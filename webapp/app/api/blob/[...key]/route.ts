// ---------------------------------------------------------------------------
// GET /api/blob/<...key>
//
// Proxy that streams a BlobStore object through the HTTPS app origin. Solves
// two problems the raw `S3_PUBLIC_BASE_URL=http://192.168.1.10:9000/...` has
// when serving to real-world users:
//
//   1. become.redbtn.io is HTTPS — browsers block mixed-content HTTP media.
//   2. 192.168.1.10 is a private LAN IP — unreachable from the public internet.
//
// The Node container can reach MinIO over LAN; this route fetches the object
// server-side and pipes the body back over HTTPS.
//
// Access control
// --------------
// This route was PUBLIC and unauthenticated, which was right for the one thing
// it originally served (the shared exercise-demo catalogue) and wrong for
// everything added to the bucket afterwards: `scans/<userId>/…`,
// `food-flags/<userId>/…`, `chat/<userId>/…`. Those keys name the member they
// belong to, so a key that is guessed, logged, shared or scraped out of a
// screenshot handed anyone on the internet another member's meal photos.
//
// `lib/blobAccess.ts` owns the whole rule and derives the owner from the KEY —
// never from a query parameter, which the caller controls. A caller who is not
// the owner gets 404, not 403, so the status code does not confirm that the
// object exists. Unrecognised prefixes DEFAULT-DENY when they look per-user.
//
// Why this route reads the cookie itself
// --------------------------------------
// `verifyAuth()` only reads `Authorization: Bearer`. The callers here are
// `<img>` and `<video>` elements, which cannot set a header — they send the
// `auth_token` cookie instead. So the token is taken from either place, the
// same way GET /api/auth/me does it. A SCOPED token (the short-lived
// `ai-tools` one) is not a session and is refused, which is the default-deny
// `verifyAuth` applies and that this route has to apply explicitly.
//
// `avatars/…` stays PUBLIC on purpose: `components/Avatar.tsx` renders it
// through `next/image`, and the Next image optimizer re-fetches the URL from
// the server with no cookies at all — gating avatars would break every
// member's own avatar, not just other people's. See lib/blobAccess.ts.
//
// Range request handling
// ----------------------
// HTML <video> issues `Range: bytes=START-END` requests to support seeking.
// We forward the incoming `Range` header to S3 and return 206 Partial Content
// with the upstream `Content-Range`. We always advertise `Accept-Ranges: bytes`
// so the browser knows to issue range requests in the first place.
//
// When the bucket eventually migrates to a public CDN (R2 or fronted MinIO),
// only the 'public' branch below may move there — anything authenticated has
// to keep coming through this route.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { getBlobStore } from '@/lib/blobStorage'
import { verifyToken, type JWTPayload } from '@/lib/auth'
import { isVerifiedAdmin } from '@/lib/adminAuth'
import { blobPolicy, isSafeBlobKey } from '@/lib/blobAccess'

interface RouteParams {
  params: Promise<{ key: string[] }>
}

/** Never let a refusal be cached — by the browser or by anything in front of it. */
const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * The session behind an `<img>`/`<video>` request: Bearer header first (the
 * native client and any fetch()), then the `auth_token` cookie (the browser).
 * Returns null for anonymous, an invalid token, or a scoped non-session token.
 */
async function sessionFor(request: NextRequest): Promise<JWTPayload | null> {
  const header = request.headers.get('authorization')
  const token = header?.startsWith('Bearer ')
    ? header.substring(7)
    : request.cookies.get('auth_token')?.value
  if (!token) return null
  try {
    const payload = await verifyToken(token)
    // A scoped token is a capability, not a session. Not accepted here.
    if (payload.scope) return null
    return payload.userId ? payload : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { key: keyParts } = await params
  if (!keyParts?.length) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400, headers: NO_STORE })
  }
  const key = keyParts.map(decodeURIComponent).join('/')

  if (!isSafeBlobKey(key)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400, headers: NO_STORE })
  }

  const policy = blobPolicy(key)
  const isPublicObject = policy.visibility === 'public'

  if (!isPublicObject) {
    const session = await sessionFor(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
    }
    if (policy.visibility === 'owner') {
      const isOwner = !!policy.ownerId
        && policy.ownerId.toLowerCase() === session.userId.toLowerCase()
      // Admin is confirmed against the User row, never read off the token
      // claim — a demoted admin must lose this immediately. Only a token that
      // actually claims admin pays for the read (isVerifiedAdmin's fast
      // negative), so members never do.
      if (!isOwner && !(await isVerifiedAdmin(session))) {
        // 404, not 403: the status must not confirm the object exists.
        return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
      }
    }
  }

  const range = request.headers.get('range') ?? undefined

  try {
    const obj = await getBlobStore().get(key, { range })
    if (!obj.body) {
      return NextResponse.json({ error: 'Empty body from origin' }, { status: 502, headers: NO_STORE })
    }

    const headers = new Headers()
    if (obj.contentType) headers.set('Content-Type', obj.contentType)
    if (obj.contentLength != null) headers.set('Content-Length', String(obj.contentLength))
    if (obj.etag) headers.set('ETag', obj.etag)
    if (obj.lastModified) headers.set('Last-Modified', obj.lastModified.toUTCString())
    // Advertise byte-range support regardless of whether this request used it,
    // so the browser knows it can seek on subsequent requests.
    headers.set('Accept-Ranges', obj.acceptRanges || 'bytes')

    if (isPublicObject) {
      // Unchanged: shared content, no session involved, and storage keys are
      // content-addressed (random + timestamp per upload) so they never change
      // meaning. Safe for any shared cache to hold for a year.
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    } else {
      // `private` is the whole point: the response is now identity-dependent,
      // and a shared cache (CDN, the edge proxy, a corporate middlebox) that
      // stored one member's photo under this URL would serve it to the next
      // caller and undo the check above. `private` forbids exactly those while
      // still allowing the browser's OWN per-profile disk cache, so scrolling
      // back through a chat or a scan history does not refetch every image —
      // and `immutable` is still true of the bytes, just not of who may see
      // them. `Vary` is belt-and-braces for anything that ignores `private`.
      headers.set('Cache-Control', 'private, max-age=31536000, immutable')
      headers.set('Vary', 'Cookie, Authorization')
    }

    // S3 returns Content-Range when the request was a partial fetch.
    const isPartial = range && obj.contentRange
    if (isPartial) {
      headers.set('Content-Range', obj.contentRange!)
    }

    return new NextResponse(obj.body, {
      status: isPartial ? 206 : 200,
      headers,
    })
  } catch (err) {
    const e = err as { $metadata?: { httpStatusCode?: number }; name?: string; message?: string }
    // S3 returns 416 (Range Not Satisfiable) when the requested range is
    // outside the object size. Pass that through verbatim so the browser
    // can react correctly to its own bad range guess.
    if (e?.$metadata?.httpStatusCode === 416 || e?.name === 'InvalidRange') {
      return new NextResponse(null, { status: 416, headers: { 'Accept-Ranges': 'bytes', ...NO_STORE } })
    }
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey' || e?.name === 'NotFound') {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
    }
    console.error('[api/blob] proxy error for key', key, 'range:', range, e)
    return NextResponse.json({ error: e?.message ?? 'Proxy error' }, { status: 500, headers: NO_STORE })
  }
}

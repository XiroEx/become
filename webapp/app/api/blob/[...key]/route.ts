// ---------------------------------------------------------------------------
// GET /api/blob/<...key>
//
// Public, unauthenticated proxy that streams a BlobStore object through the
// HTTPS app origin. Solves two problems the raw `S3_PUBLIC_BASE_URL=http://192.168.1.10:9000/...`
// has when serving to real-world users:
//
//   1. become.redbtn.io is HTTPS — browsers block mixed-content HTTP media.
//   2. 192.168.1.10 is a private LAN IP — unreachable from the public internet.
//
// The Node container can reach MinIO over LAN; this route fetches the object
// server-side and pipes the body back over HTTPS.
//
// Range request handling
// ----------------------
// HTML <video> issues `Range: bytes=START-END` requests to support seeking.
// We forward the incoming `Range` header to S3 and return 206 Partial Content
// with the upstream `Content-Range`. We always advertise `Accept-Ranges: bytes`
// so the browser knows to issue range requests in the first place.
//
// Cache-Control is set to immutable because storage keys are content-addressed
// (random + timestamp per upload).
//
// When the bucket eventually migrates to a public CDN (R2 or fronted MinIO),
// flip S3_PUBLIC_BASE_URL back to the CDN domain and this proxy becomes
// unused — keep it around as a fallback.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { getBlobStore } from '@/lib/blobStorage'

interface RouteParams {
  params: Promise<{ key: string[] }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { key: keyParts } = await params
  if (!keyParts?.length) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 })
  }
  const key = keyParts.map(decodeURIComponent).join('/')

  const range = request.headers.get('range') ?? undefined

  try {
    const obj = await getBlobStore().get(key, { range })
    if (!obj.body) {
      return NextResponse.json({ error: 'Empty body from origin' }, { status: 502 })
    }

    const headers = new Headers()
    if (obj.contentType) headers.set('Content-Type', obj.contentType)
    if (obj.contentLength != null) headers.set('Content-Length', String(obj.contentLength))
    if (obj.etag) headers.set('ETag', obj.etag)
    if (obj.lastModified) headers.set('Last-Modified', obj.lastModified.toUTCString())
    // Advertise byte-range support regardless of whether this request used it,
    // so the browser knows it can seek on subsequent requests.
    headers.set('Accept-Ranges', obj.acceptRanges || 'bytes')
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')

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
      return new NextResponse(null, { status: 416, headers: { 'Accept-Ranges': 'bytes' } })
    }
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey' || e?.name === 'NotFound') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    console.error('[api/blob] proxy error for key', key, 'range:', range, e)
    return NextResponse.json({ error: e?.message ?? 'Proxy error' }, { status: 500 })
  }
}

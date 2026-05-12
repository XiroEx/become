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
// server-side and pipes the body back over HTTPS. Cache-Control is set to
// immutable because storage keys are content-addressed (random + timestamp
// per upload).
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

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { key: keyParts } = await params
  if (!keyParts?.length) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 })
  }
  const key = keyParts.map(decodeURIComponent).join('/')

  try {
    const obj = await getBlobStore().get(key)
    if (!obj.body) {
      return NextResponse.json({ error: 'Empty body from origin' }, { status: 502 })
    }

    const headers = new Headers()
    if (obj.contentType) headers.set('Content-Type', obj.contentType)
    if (obj.contentLength != null) headers.set('Content-Length', String(obj.contentLength))
    if (obj.etag) headers.set('ETag', obj.etag)
    if (obj.lastModified) headers.set('Last-Modified', obj.lastModified.toUTCString())
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')

    return new NextResponse(obj.body, { status: 200, headers })
  } catch (err) {
    const e = err as { $metadata?: { httpStatusCode?: number }; name?: string; message?: string }
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey' || e?.name === 'NotFound') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    console.error('[api/blob] proxy error for key', key, e)
    return NextResponse.json({ error: e?.message ?? 'Proxy error' }, { status: 500 })
  }
}

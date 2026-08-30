// Run with: npx tsx --test tests/unit/streamingVideoUpload.test.ts
//
// The reported bug: video uploads failed with "Network error during upload"
// (an `xhr.onerror` — a connection-level failure, never fired for an actual
// HTTP error response) for videos that took a while to send. The upload
// routes buffered the ENTIRE file into memory via `request.formData()` +
// `Buffer.from(await file.arrayBuffer())` before ever starting the second
// hop to blob storage — so the client's connection sat completely idle
// during that second transfer, long enough for a reverse proxy to give up on
// it, and every upload carried 2-3x the file size in simultaneous in-memory
// copies (a real OOM risk on a memory-constrained container).
//
// `parseVideoUpload` (lib/streamingVideoUpload.ts) fixes this by parsing the
// multipart body incrementally with busboy and hanging back a stream the
// caller pipes straight into `BlobStore.putStream` — the client upload and
// the blob-store write now overlap instead of happening back-to-back, and
// nothing needs to sit fully in memory. These tests exercise the real
// parsing/streaming logic end-to-end (no live Mongo or MinIO needed — this
// module has no dependency on either).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { NextRequest } from 'next/server'
import { parseVideoUpload, isStreamingValidationFailure } from '../../lib/streamingVideoUpload'

const ROOT = path.join(__dirname, '../..')
const BOUNDARY = 'red-test-boundary-1234'

function multipartPart(opts: { name: string; filename?: string; contentType?: string; data: Buffer }): Buffer {
  const lines: string[] = [`--${BOUNDARY}`]
  let disposition = `Content-Disposition: form-data; name="${opts.name}"`
  if (opts.filename) disposition += `; filename="${opts.filename}"`
  lines.push(disposition)
  if (opts.contentType) lines.push(`Content-Type: ${opts.contentType}`)
  lines.push('', '')
  return Buffer.concat([Buffer.from(lines.join('\r\n')), opts.data, Buffer.from('\r\n')])
}

function buildMultipartBody(parts: Array<{ name: string; filename?: string; contentType?: string; data: Buffer }>): Buffer {
  return Buffer.concat([...parts.map(multipartPart), Buffer.from(`--${BOUNDARY}--\r\n`)])
}

function fakeRequest(body: Buffer, contentType = `multipart/form-data; boundary=${BOUNDARY}`): NextRequest {
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(body))
      controller.close()
    },
  })
  const req = new Request('http://localhost/api/exercises/bench-press/video', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: webStream,
    // Fetch spec requires this when a stream body is present.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
  return req as unknown as NextRequest
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

test('streams a valid video field through to completion with correct bytes', async () => {
  const payload = Buffer.from('fake-mp4-bytes-'.repeat(1000))
  const body = buildMultipartBody([
    { name: 'video', filename: 'clip.mp4', contentType: 'video/mp4', data: payload },
  ])

  const parsed = await parseVideoUpload(fakeRequest(body))
  assert.ok(!isStreamingValidationFailure(parsed), 'expected a stream, not a validation failure')
  if (isStreamingValidationFailure(parsed)) return

  assert.equal(parsed.filename, 'clip.mp4')
  assert.equal(parsed.mimeType, 'video/mp4')

  const collected = await collect(parsed.stream)
  const { bytes, truncated } = await parsed.done

  assert.equal(truncated, false)
  assert.equal(bytes, payload.length)
  assert.ok(collected.equals(payload), 'streamed bytes must match the uploaded file exactly')
})

test('resolves the iOS octet-stream fallback via the filename extension', async () => {
  const payload = Buffer.from('mov-bytes')
  const body = buildMultipartBody([
    { name: 'video', filename: 'IMG_0001.MOV', contentType: 'application/octet-stream', data: payload },
  ])

  const parsed = await parseVideoUpload(fakeRequest(body))
  assert.ok(!isStreamingValidationFailure(parsed))
  if (isStreamingValidationFailure(parsed)) return
  assert.equal(parsed.mimeType, 'video/quicktime')
  await collect(parsed.stream)
  await parsed.done
})

test('rejects an unsupported type without buffering the file', async () => {
  const payload = Buffer.from('not a video')
  const body = buildMultipartBody([
    { name: 'video', filename: 'notes.txt', contentType: 'text/plain', data: payload },
  ])

  const parsed = await parseVideoUpload(fakeRequest(body))
  assert.ok(isStreamingValidationFailure(parsed))
  if (!isStreamingValidationFailure(parsed)) return
  assert.equal(parsed.status, 415)
  assert.match(parsed.error, /Unsupported video type/)
})

test('reports a missing "video" field as a 400, not a hang', async () => {
  const body = buildMultipartBody([
    { name: 'label', data: Buffer.from('hello') },
  ])

  const parsed = await parseVideoUpload(fakeRequest(body))
  assert.ok(isStreamingValidationFailure(parsed))
  if (!isStreamingValidationFailure(parsed)) return
  assert.equal(parsed.status, 400)
  assert.match(parsed.error, /Missing "video" file field/)
})

test('a zero-byte file field streams to completion with bytes === 0', async () => {
  const body = buildMultipartBody([
    { name: 'video', filename: 'empty.mp4', contentType: 'video/mp4', data: Buffer.alloc(0) },
  ])

  const parsed = await parseVideoUpload(fakeRequest(body))
  assert.ok(!isStreamingValidationFailure(parsed))
  if (isStreamingValidationFailure(parsed)) return
  const collected = await collect(parsed.stream)
  const { bytes, truncated } = await parsed.done
  assert.equal(bytes, 0)
  assert.equal(truncated, false)
  assert.equal(collected.length, 0)
})

test('caps bytes at the configured limit and flags truncation instead of silently accepting a bigger file', async () => {
  const payload = Buffer.from('x'.repeat(100))
  const body = buildMultipartBody([
    { name: 'video', filename: 'big.mp4', contentType: 'video/mp4', data: payload },
  ])

  const parsed = await parseVideoUpload(fakeRequest(body), { maxBytes: 10 })
  assert.ok(!isStreamingValidationFailure(parsed))
  if (isStreamingValidationFailure(parsed)) return
  const collected = await collect(parsed.stream)
  const { bytes, truncated } = await parsed.done
  assert.equal(truncated, true, 'busboy must report the field as truncated once it hits the byte cap')
  assert.ok(bytes <= 10, `expected at most 10 bytes to ever reach the sink, got ${bytes}`)
  assert.equal(collected.length, bytes, 'the caller must only ever receive the bytes actually counted')
})

test('a boundary-less multipart content-type resolves as a 400 instead of throwing', async () => {
  const body = Buffer.from('irrelevant')
  const parsed = await parseVideoUpload(fakeRequest(body, 'multipart/form-data'))
  assert.ok(isStreamingValidationFailure(parsed))
  if (!isStreamingValidationFailure(parsed)) return
  assert.equal(parsed.status, 400)
  assert.match(parsed.error, /Expected multipart\/form-data/)
})

// ─── Wiring: both routes must actually use the streaming path ───────────────
// The routes themselves need a live Mongo + admin/feature auth context this
// suite does not stand up (same rationale as tests/unit/exerciseVideoClear.test.ts),
// so the wiring itself is a source check.

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

for (const route of [
  'app/api/exercises/[slug]/video/route.ts',
  'app/api/exercises/custom/[slug]/video/route.ts',
]) {
  test(`${route} streams the upload instead of buffering it into memory`, () => {
    const src = readSource(route)
    assert.match(src, /parseVideoUpload\(request/, 'must parse via the streaming helper')
    assert.match(src, /store\.putStream\(/, 'must write via the streaming BlobStore method')
    assert.ok(
      !/Buffer\.from\(await file\.arrayBuffer\(\)\)/.test(src),
      'must not buffer the whole file into memory before uploading it'
    )
    assert.ok(
      !/await request\.formData\(\)/.test(src),
      'must not parse the multipart body with formData() — that buffers the whole request'
    )
  })

  test(`${route} rejects a truncated (oversized) upload and cleans up the partial object`, () => {
    const src = readSource(route)
    assert.match(src, /if \(truncated\)/)
    assert.match(src, /store\.delete\(key\)/)
  })

  test(`${route} rejects an empty upload after streaming completes`, () => {
    const src = readSource(route)
    assert.match(src, /bytes === 0/)
  })
}

test('BlobStore.putStream uses the multipart-capable Upload helper, not a single buffered PutObject', () => {
  const src = readSource('lib/blobStorage.ts')
  assert.match(src, /import \{ Upload \} from '@aws-sdk\/lib-storage'/)
  assert.match(src, /async putStream\(/)
  assert.match(src, /new Upload\(/)
  assert.match(src, /await upload\.done\(\)/)
})

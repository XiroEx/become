// ---------------------------------------------------------------------------
// Streaming multipart parsing for video uploads.
//
// The routes used to do `await request.formData()` then
// `Buffer.from(await file.arrayBuffer())` — both steps require the ENTIRE
// upload to sit in memory before a single byte reaches blob storage, and the
// blob-store write only starts after the client has finished sending. On a
// large clip over a slow connection that leaves the client's connection
// completely idle for the whole second hop, which is long enough for a
// reverse proxy to give up on it — surfacing to the browser as a bare
// `xhr.onerror` ("Network error during upload"), not an HTTP error response,
// because nothing ever came back before the proxy killed the connection.
//
// This parses the multipart body incrementally with `busboy` and hands the
// caller a Node Readable for the `video` field as soon as its headers are
// known, so piping it into `BlobStore.putStream` overlaps the client upload
// with the blob-store write instead of doing them back-to-back.
// ---------------------------------------------------------------------------

import { Readable, Transform } from 'node:stream'
import type { NextRequest } from 'next/server'
import Busboy from 'busboy'
import { MAX_VIDEO_BYTES, resolveVideoMime, type VideoValidationFailure } from './videoUpload'

export interface StreamedVideoFile {
  /** Bytes of the `video` field, capped at MAX_VIDEO_BYTES (busboy truncates beyond it). */
  stream: Readable
  filename: string
  mimeType: string
  /** Resolves once `stream` has been fully drained by whatever the caller piped it into. */
  done: Promise<{ bytes: number; truncated: boolean }>
}

/**
 * Parse a multipart/form-data request looking for a single file field.
 * Resolves with a validation failure (never rejects for a bad-but-well-formed
 * request) if the field is missing, unnamed, or an unsupported type; rejects
 * only on a genuine stream/transport error.
 */
export interface ParseVideoUploadOptions {
  fieldName?: string
  /** Override for tests — production call sites rely on the MAX_VIDEO_BYTES default. */
  maxBytes?: number
}

export function parseVideoUpload(
  request: NextRequest,
  options: ParseVideoUploadOptions = {}
): Promise<StreamedVideoFile | VideoValidationFailure> {
  const { fieldName = 'video', maxBytes = MAX_VIDEO_BYTES } = options
  return new Promise((resolve, reject) => {
    if (!request.body) {
      resolve({ error: 'Expected multipart/form-data', status: 400 })
      return
    }

    let busboy: Busboy.Busboy
    try {
      busboy = Busboy({
        headers: { 'content-type': request.headers.get('content-type') ?? '' },
        limits: { fileSize: maxBytes, files: 1 },
      })
    } catch {
      resolve({ error: 'Expected multipart/form-data', status: 400 })
      return
    }

    let settled = false
    let sawFile = false
    const finish = (result: StreamedVideoFile | VideoValidationFailure) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    busboy.on('file', (name, fileStream, info) => {
      if (name !== fieldName || sawFile) {
        fileStream.resume() // drain + discard: extra or unexpected fields
        return
      }
      sawFile = true

      const mimeType = resolveVideoMime(info.mimeType, info.filename)
      if (!mimeType) {
        fileStream.resume()
        finish({
          error: `Unsupported video type${info.mimeType ? `: ${info.mimeType}` : ''}. Use MP4, MOV or WebM.`,
          status: 415,
        })
        return
      }

      // Tee bytes through a counting Transform rather than attaching our own
      // `data` listener directly to `fileStream` — a `data` listener switches
      // a stream into flowing mode immediately, which can drop chunks emitted
      // before the caller (on the other side of the resolved promise) gets a
      // chance to attach its own consumer. Piping through a Transform keeps
      // backpressure intact: bytes queue in the Transform's own buffer until
      // something downstream actually reads them.
      let bytes = 0
      let truncated = false
      const counter = new Transform({
        transform(chunk, _enc, callback) {
          bytes += chunk.length
          callback(null, chunk)
        },
      })
      fileStream.on('limit', () => {
        truncated = true
      })
      fileStream.on('error', (err) => counter.destroy(err))
      fileStream.pipe(counter)

      const done = new Promise<{ bytes: number; truncated: boolean }>((doneResolve, doneReject) => {
        counter.on('end', () => doneResolve({ bytes, truncated }))
        counter.on('error', doneReject)
      })

      finish({ stream: counter, filename: info.filename ?? '', mimeType, done })
    })

    busboy.on('error', (err) => {
      if (!settled) reject(err instanceof Error ? err : new Error(String(err)))
    })

    busboy.on('finish', () => {
      if (!sawFile) finish({ error: 'Missing "video" file field', status: 400 })
    })

    const nodeBody = Readable.fromWeb(request.body as unknown as import('node:stream/web').ReadableStream)
    nodeBody.on('error', (err) => {
      if (!settled) reject(err)
      busboy.destroy(err)
    })
    nodeBody.pipe(busboy)
  })
}

export function isStreamingValidationFailure(
  result: StreamedVideoFile | VideoValidationFailure
): result is VideoValidationFailure {
  return 'error' in result
}

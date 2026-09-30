// ---------------------------------------------------------------------------
// BlobStore — S3-compatible binary storage.
//
// Today it talks to a self-hosted MinIO instance (single-node, on the LAN
// drive at /mnt/staging on host .10). Tomorrow we drop in Cloudflare R2 or
// AWS S3 by swapping the env vars — nothing else changes:
//
//   S3_ENDPOINT             e.g. http://192.168.1.10:9000  (or R2 endpoint)
//   S3_REGION               e.g. us-east-1                 (or auto for R2)
//   S3_BUCKET               e.g. become-videos
//   S3_ACCESS_KEY_ID
//   S3_SECRET_ACCESS_KEY
//   S3_PUBLIC_BASE_URL      e.g. http://192.168.1.10:9000/become-videos
//                                  Used to build public read URLs. Set this
//                                  to the bucket's public domain (or CDN)
//                                  when migrating to R2.
//   S3_FORCE_PATH_STYLE     'true' for MinIO; unset/false for R2 + AWS.
// ---------------------------------------------------------------------------

import type { Readable } from 'node:stream'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getRuntimeConfig, requireRuntimeSecret } from './runtimeConfig'

export interface BlobPutInput {
  key: string
  body: Buffer | Uint8Array
  contentType: string
  cacheControl?: string
}

export interface BlobPutStreamInput {
  key: string
  /** Readable of unknown total length — `Upload` chunks it into multipart parts as needed. */
  body: Readable
  contentType: string
  cacheControl?: string
}

export interface BlobGetOptions {
  /** HTTP Range header value, e.g. `bytes=0-1023`. Forwarded as-is to S3.
   *  When set, the returned result is a partial object with `contentRange`
   *  populated and `contentLength` covering only the requested slice. */
  range?: string
}

export interface BlobGetResult {
  body: ReadableStream<Uint8Array> | null
  contentType?: string
  contentLength?: number
  contentRange?: string
  acceptRanges?: string
  etag?: string
  lastModified?: Date
}

export interface BlobStore {
  put(input: BlobPutInput): Promise<{ key: string; publicUrl: string }>
  /**
   * Streaming counterpart to `put` — writes as bytes arrive instead of
   * requiring the full object in memory first. Use this for anything sourced
   * from a client upload, where the alternative is buffering the whole
   * request body (and every copy the app makes of it) before the first byte
   * ever reaches storage.
   */
  putStream(input: BlobPutStreamInput): Promise<{ key: string; publicUrl: string }>
  get(key: string, options?: BlobGetOptions): Promise<BlobGetResult>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  publicUrl(key: string): string
  presignedPutUrl(key: string, contentType: string, expiresInSec?: number): Promise<string>
}

class S3BlobStore implements BlobStore {
  private client: S3Client | null = null
  private bucket = ''
  private publicBase = ''
  private init: Promise<void> | null = null

  private async ensureInitialized(): Promise<void> {
    if (this.client) return
    if (!this.init) {
      this.init = getRuntimeConfig().then(({ blob }) => {
        const endpoint = requireRuntimeSecret(blob.endpoint, 'blob.endpoint')
        const accessKeyId = requireRuntimeSecret(blob.accessKeyId, 'blob.accessKeyId')
        const secretAccessKey = requireRuntimeSecret(blob.secretAccessKey, 'blob.secretAccessKey')
        this.bucket = requireRuntimeSecret(blob.bucket, 'blob.bucket')
        this.publicBase = (blob.publicBaseUrl || `${endpoint}/${this.bucket}`).replace(/\/+$/, '')
        this.client = new S3Client({
          endpoint,
          region: blob.region || 'us-east-1',
          credentials: { accessKeyId, secretAccessKey },
          forcePathStyle: blob.forcePathStyle ?? false,
        })
      })
    }
    await this.init
  }

  async put({ key, body, contentType, cacheControl }: BlobPutInput) {
    await this.ensureInitialized()
    const params: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl ?? 'public, max-age=31536000, immutable',
    }
    await this.client!.send(new PutObjectCommand(params))
    return { key, publicUrl: this.publicUrl(key) }
  }

  async putStream({ key, body, contentType, cacheControl }: BlobPutStreamInput) {
    await this.ensureInitialized()
    const upload = new Upload({
      client: this.client!,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl ?? 'public, max-age=31536000, immutable',
      },
    })
    await upload.done()
    return { key, publicUrl: this.publicUrl(key) }
  }

  async get(key: string, options: BlobGetOptions = {}): Promise<BlobGetResult> {
    await this.ensureInitialized()
    const res = await this.client!.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Range: options.range,
    }))
    return {
      body: res.Body?.transformToWebStream() ?? null,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
      contentRange: res.ContentRange,
      acceptRanges: res.AcceptRanges,
      etag: res.ETag,
      lastModified: res.LastModified,
    }
  }

  async delete(key: string) {
    await this.ensureInitialized()
    await this.client!.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  async exists(key: string) {
    await this.ensureInitialized()
    try {
      await this.client!.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return true
    } catch (err) {
      const e = err as { $metadata?: { httpStatusCode?: number }; name?: string }
      if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return false
      throw err
    }
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key.replace(/^\/+/, '')}`
  }

  async presignedPutUrl(key: string, contentType: string, expiresInSec = 900): Promise<string> {
    await this.ensureInitialized()
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType })
    return getSignedUrl(this.client!, cmd, { expiresIn: expiresInSec })
  }
}

let cached: BlobStore | null = null

export function getBlobStore(): BlobStore {
  if (!cached) cached = new S3BlobStore()
  return cached
}

/**
 * Build a content-addressed object key for an exercise video.
 * Pattern: `exercises/<slug>/<random>.<ext>` — versioned by random so
 * replacing a video doesn't require cache invalidation.
 */
export function exerciseVideoKey(slug: string, mimeType: string): string {
  const ext = extFromMime(mimeType)
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  return `exercises/${safeSlug}/${id}${ext}`
}

/**
 * Same idea for a user's own custom exercise, but namespaced per user so the
 * bucket stays browsable and a per-user quota / cleanup sweep is a prefix
 * listing rather than a full scan.
 */
export function customExerciseVideoKey(userId: string, slug: string, mimeType: string): string {
  const ext = extFromMime(mimeType)
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  const safeUser = userId.replace(/[^a-z0-9]/gi, '').toLowerCase()
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  return `custom-exercises/${safeUser}/${safeSlug}/${id}${ext}`
}

function extFromMime(mime: string): string {
  switch (mime) {
    case 'video/mp4': return '.mp4'
    case 'video/quicktime': return '.mov'
    case 'video/webm': return '.webm'
    case 'video/x-matroska': return '.mkv'
    default: return ''
  }
}

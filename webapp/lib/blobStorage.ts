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

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface BlobPutInput {
  key: string
  body: Buffer | Uint8Array
  contentType: string
  cacheControl?: string
}

export interface BlobGetResult {
  body: ReadableStream<Uint8Array> | null
  contentType?: string
  contentLength?: number
  etag?: string
  lastModified?: Date
}

export interface BlobStore {
  put(input: BlobPutInput): Promise<{ key: string; publicUrl: string }>
  get(key: string): Promise<BlobGetResult>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  publicUrl(key: string): string
  presignedPutUrl(key: string, contentType: string, expiresInSec?: number): Promise<string>
}

class S3BlobStore implements BlobStore {
  private client: S3Client
  private bucket: string
  private publicBase: string

  constructor() {
    const endpoint = requireEnv('S3_ENDPOINT')
    const region = process.env.S3_REGION || 'us-east-1'
    const accessKeyId = requireEnv('S3_ACCESS_KEY_ID')
    const secretAccessKey = requireEnv('S3_SECRET_ACCESS_KEY')
    const forcePathStyle = (process.env.S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true'

    this.bucket = requireEnv('S3_BUCKET')
    this.publicBase = (process.env.S3_PUBLIC_BASE_URL || `${endpoint}/${this.bucket}`).replace(/\/+$/, '')

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
    })
  }

  async put({ key, body, contentType, cacheControl }: BlobPutInput) {
    const params: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl ?? 'public, max-age=31536000, immutable',
    }
    await this.client.send(new PutObjectCommand(params))
    return { key, publicUrl: this.publicUrl(key) }
  }

  async get(key: string): Promise<BlobGetResult> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    return {
      body: res.Body?.transformToWebStream() ?? null,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
      etag: res.ETag,
      lastModified: res.LastModified,
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
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
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType })
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSec })
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
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

function extFromMime(mime: string): string {
  switch (mime) {
    case 'video/mp4': return '.mp4'
    case 'video/quicktime': return '.mov'
    case 'video/webm': return '.webm'
    case 'video/x-matroska': return '.mkv'
    default: return ''
  }
}

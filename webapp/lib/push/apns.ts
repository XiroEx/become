// SERVER-ONLY. Apple Push Notification service, sent directly (NP-064).
//
// HTTP/2 to api.push.apple.com (or the sandbox host) with token-based auth: an
// ES256 JWT signed with the team's .p8 key. Node core has everything needed
// (`node:http2`, `node:crypto`), so there is no dependency.
//
// The transport is an interface so the unit tests never open a socket.

import crypto from 'node:crypto'
import http2 from 'node:http2'
import type { ApnsConfig, ApnsEnvironment } from './nativeConfig'
import type { NativePushMessage } from './nativeMessage'

export const APNS_HOSTS: Record<ApnsEnvironment, string> = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
}

/** Apple refuses a provider token older than an hour and throttles fresh ones
 * minted more often than every 20 minutes. 50 minutes sits between the two. */
export const APNS_JWT_TTL_MS = 50 * 60 * 1000

export interface ApnsRequest {
  environment: ApnsEnvironment
  deviceToken: string
  headers: Record<string, string>
  body: string
}

export interface ApnsResponse {
  status: number
  /** Apple's `reason` from the JSON body, when there is one. */
  reason?: string
}

export interface ApnsTransport {
  send(request: ApnsRequest): Promise<ApnsResponse>
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

interface CachedJwt {
  keyId: string
  teamId: string
  token: string
  issuedAt: number
}

let cachedJwt: CachedJwt | null = null

/** The provider token, reused for APNS_JWT_TTL_MS. */
export function apnsProviderToken(config: ApnsConfig, now: number = Date.now()): string {
  if (
    cachedJwt
    && cachedJwt.keyId === config.keyId
    && cachedJwt.teamId === config.teamId
    && now - cachedJwt.issuedAt < APNS_JWT_TTL_MS
  ) {
    return cachedJwt.token
  }
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }))
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }))
  const signingInput = `${header}.${claims}`
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: config.privateKey,
    dsaEncoding: 'ieee-p1363',
  })
  const token = `${signingInput}.${base64url(signature)}`
  cachedJwt = { keyId: config.keyId, teamId: config.teamId, token, issuedAt: now }
  return token
}

/** Apple said the provider token is bad or stale: mint a new one next time. */
export function resetApnsProviderToken(): void {
  cachedJwt = null
}

/** `apns-collapse-id` may not exceed 64 bytes. */
function collapseId(tag: string): string {
  const bytes = Buffer.from(tag, 'utf8')
  if (bytes.length <= 64) return tag
  return crypto.createHash('sha256').update(tag).digest('hex').slice(0, 64)
}

export function buildApnsRequest(
  config: ApnsConfig,
  deviceToken: string,
  message: NativePushMessage,
  environment: ApnsEnvironment,
  now: number = Date.now(),
): ApnsRequest {
  const aps: Record<string, unknown> = {
    alert: { title: message.title, body: message.body },
    sound: 'default',
  }
  // Only a sender that knows the whole answer sets the badge; 0 clears it.
  if (typeof message.badgeCount === 'number') aps.badge = message.badgeCount
  if (message.tag) aps['thread-id'] = message.tag

  const headers: Record<string, string> = {
    authorization: `bearer ${apnsProviderToken(config, now)}`,
    'apns-topic': config.bundleId,
    'apns-push-type': 'alert',
    'apns-priority': '10',
  }
  if (message.tag) headers['apns-collapse-id'] = collapseId(message.tag)

  return {
    environment,
    deviceToken,
    headers,
    body: JSON.stringify({ aps, url: message.url, ...(message.tag ? { tag: message.tag } : {}) }),
  }
}

const REQUEST_TIMEOUT_MS = 10_000

/** One HTTP/2 session per APNs host, reused across sends (Apple asks for that). */
export function createHttp2ApnsTransport(): ApnsTransport {
  const sessions = new Map<string, http2.ClientHttp2Session>()

  function sessionFor(host: string): http2.ClientHttp2Session {
    const existing = sessions.get(host)
    if (existing && !existing.closed && !existing.destroyed) return existing
    const session = http2.connect(host)
    const drop = () => {
      if (sessions.get(host) === session) sessions.delete(host)
    }
    session.on('error', drop)
    session.on('goaway', drop)
    session.on('close', drop)
    // Never hold the process open just because a session is idle.
    session.unref()
    sessions.set(host, session)
    return session
  }

  return {
    send(request) {
      return new Promise<ApnsResponse>((resolve, reject) => {
        let session: http2.ClientHttp2Session
        try {
          session = sessionFor(APNS_HOSTS[request.environment])
        } catch (err) {
          reject(err)
          return
        }
        const req = session.request({
          ':method': 'POST',
          ':path': `/3/device/${request.deviceToken}`,
          'content-type': 'application/json',
          ...request.headers,
        })
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
          req.close(http2.constants.NGHTTP2_CANCEL)
          reject(new Error('APNs request timed out'))
        })
        let status = 0
        let raw = ''
        req.setEncoding('utf8')
        req.on('response', (headers) => {
          status = Number(headers[':status'] ?? 0)
        })
        req.on('data', (chunk: string) => {
          raw += chunk
        })
        req.on('end', () => {
          let reason: string | undefined
          if (raw) {
            try {
              reason = (JSON.parse(raw) as { reason?: string }).reason
            } catch {
              reason = undefined
            }
          }
          resolve({ status, reason })
        })
        req.on('error', reject)
        req.end(request.body)
      })
    },
  }
}

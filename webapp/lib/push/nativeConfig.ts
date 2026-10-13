// SERVER-ONLY. Resolves the native push credentials (NP-063) out of the
// `push` section of BECOME_RUNTIME_CONFIG.
//
// DECISION (George, 2026-09-30): no Expo-hosted services. The server sends
// straight to APNs (HTTP/2, token auth with a .p8 key) and to FCM HTTP v1
// (OAuth with a service account), so it holds both credentials itself.
//
// Every field is optional. A section that is missing or incomplete resolves to
// `undefined`, which means "this transport is not configured": the native
// branch of the send path skips those devices and the app keeps working.

export type ApnsEnvironment = 'production' | 'sandbox'

export interface ApnsConfig {
  keyId: string
  teamId: string
  /** The apns-topic. The iOS bundle id in expo/app.json. */
  bundleId: string
  /** PKCS#8 PEM of the .p8 key, real newlines. */
  privateKey: string
  /** Which APNs host a token is tried on first. */
  environment: ApnsEnvironment
}

export interface FcmConfig {
  projectId: string
  clientEmail: string
  /** PKCS#8 PEM of the service account key, real newlines. */
  privateKey: string
  tokenUri: string
}

export interface NativePushPayloadInput {
  apns?: Partial<{
    keyId: unknown
    teamId: unknown
    bundleId: unknown
    privateKey: unknown
    environment: unknown
  }>
  /** `serviceAccount` is the service-account JSON, as an object or a string. */
  fcm?: Partial<{ serviceAccount: unknown }>
  /** Send `chat-*` notifications to native devices. Off while NP-032 hides chat. */
  nativeChat?: unknown
}

export interface NativePushEnv {
  APNS_KEY_ID?: string
  APNS_TEAM_ID?: string
  APNS_BUNDLE_ID?: string
  APNS_PRIVATE_KEY?: string
  APNS_ENVIRONMENT?: string
  FCM_SERVICE_ACCOUNT?: string
}

function str(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

/** A PEM pasted into JSON often carries literal `\n` escapes. */
export function normalisePem(pem: string): string {
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem
}

export function resolveApnsConfig(
  input: NativePushPayloadInput['apns'] | undefined,
  env: NativePushEnv = {},
): ApnsConfig | undefined {
  const apns = input ?? {}
  const keyId = str(apns.keyId, env.APNS_KEY_ID)
  const teamId = str(apns.teamId, env.APNS_TEAM_ID)
  const privateKey = str(apns.privateKey, env.APNS_PRIVATE_KEY)
  if (!keyId || !teamId || !privateKey) return undefined
  const environment = str(apns.environment, env.APNS_ENVIRONMENT)?.toLowerCase()
  return {
    keyId,
    teamId,
    bundleId: str(apns.bundleId, env.APNS_BUNDLE_ID) || 'io.redbtn.become',
    privateKey: normalisePem(privateKey),
    environment: environment === 'sandbox' || environment === 'development' ? 'sandbox' : 'production',
  }
}

export function resolveFcmConfig(
  input: NativePushPayloadInput['fcm'] | undefined,
  env: NativePushEnv = {},
): FcmConfig | undefined {
  let account: unknown = input?.serviceAccount ?? env.FCM_SERVICE_ACCOUNT
  if (typeof account === 'string') {
    if (!account.trim()) return undefined
    try {
      account = JSON.parse(account)
    } catch {
      // A malformed key must not take the app down; it just leaves FCM off.
      console.warn('[push] push.fcm.serviceAccount is not valid JSON; FCM sending is off')
      return undefined
    }
  }
  if (!account || typeof account !== 'object') return undefined
  const sa = account as Record<string, unknown>
  const projectId = str(sa.project_id, sa.projectId)
  const clientEmail = str(sa.client_email, sa.clientEmail)
  const privateKey = str(sa.private_key, sa.privateKey)
  if (!projectId || !clientEmail || !privateKey) return undefined
  return {
    projectId,
    clientEmail,
    privateKey: normalisePem(privateKey),
    tokenUri: str(sa.token_uri) || 'https://oauth2.googleapis.com/token',
  }
}

export function resolveNativeChat(value: unknown, envValue?: string): boolean {
  const raw = typeof value === 'boolean' ? String(value) : String(value ?? envValue ?? '')
  return ['true', '1', 'yes', 'on'].includes(raw.toLowerCase())
}

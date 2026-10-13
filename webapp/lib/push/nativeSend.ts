// SERVER-ONLY. The native half of sendPushToUser (NP-064): one notification to
// each registered iPhone (APNs) and Android phone (FCM v1).
//
// Pure apart from the injected transports, so the whole decision (what is
// sent, what counts as delivered, which tokens are dead) is unit tested with
// fakes. The caller owns the database: it hands rows in and applies the
// `staleIds` / `apnsEnvironmentUpdates` this returns.

import {
  buildApnsRequest,
  resetApnsProviderToken,
  type ApnsTransport,
} from './apns'
import { sendFcm, type FcmDeps } from './fcm'
import type { ApnsConfig, ApnsEnvironment, FcmConfig } from './nativeConfig'
import { isChatTag, isExpoPushToken, type NativePushMessage } from './nativeMessage'

export type NativePlatform = 'ios' | 'android'

export interface NativeSubscriptionRow {
  id: string
  platform: NativePlatform
  /** The raw device token (APNs hex / FCM registration token). */
  endpoint: string
  /** Set once a token has been seen to work on one APNs host. */
  apnsEnvironment?: ApnsEnvironment
}

export interface NativeSendConfig {
  apns?: ApnsConfig
  fcm?: FcmConfig
  /** Deliver `chat-*` to phones. Off while NP-032 keeps chat out of the app. */
  nativeChat: boolean
}

export interface NativeSendDeps {
  apns: ApnsTransport
  fcm: FcmDeps
  /** Never handed a token or a key, only hosts, statuses and reasons. */
  warn: (message: string) => void
  error: (message: string) => void
}

export interface PlatformCounts {
  attempted: number
  delivered: number
  pruned: number
  failed: number
}

export interface NativeSendReport {
  ios: PlatformCounts
  android: PlatformCounts
  /** Rows the transport reported dead (or Expo-format leftovers): delete them. */
  staleIds: string[]
  /** iOS rows that only work on the other APNs host: remember it. */
  apnsEnvironmentUpdates: Array<{ id: string; environment: ApnsEnvironment }>
}

export const NATIVE_SEND_CONCURRENCY = 10

const counts = (): PlatformCounts => ({ attempted: 0, delivered: 0, pruned: 0, failed: 0 })

const warnedUnconfigured = new Set<NativePlatform>()

/** Test hook: the "not configured" warning is once per process. */
export function __resetNativeSendWarningsForTests(): void {
  warnedUnconfigured.clear()
}

async function eachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

const otherEnvironment = (env: ApnsEnvironment): ApnsEnvironment =>
  env === 'production' ? 'sandbox' : 'production'

type ApnsVerdict = 'delivered' | 'dead' | 'wrong-env' | 'auth' | 'failed'

function apnsVerdict(status: number, reason: string | undefined): ApnsVerdict {
  if (status === 200) return 'delivered'
  if (status === 410 || reason === 'Unregistered' || reason === 'ExpiredToken') return 'dead'
  if (status === 400 && reason === 'BadDeviceToken') return 'wrong-env'
  if (status === 403 && (reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken')) return 'auth'
  return 'failed'
}

async function sendOneApns(
  row: NativeSubscriptionRow,
  message: NativePushMessage,
  apns: ApnsConfig,
  deps: NativeSendDeps,
  report: NativeSendReport,
): Promise<void> {
  const c = report.ios
  c.attempted++
  const first = row.apnsEnvironment ?? apns.environment

  const attempt = async (env: ApnsEnvironment) => {
    let res = await deps.apns.send(buildApnsRequest(apns, row.endpoint, message, env))
    let verdict = apnsVerdict(res.status, res.reason)
    if (verdict === 'auth') {
      // A stale or refused provider token: mint a new one and try once more.
      resetApnsProviderToken()
      res = await deps.apns.send(buildApnsRequest(apns, row.endpoint, message, env))
      verdict = apnsVerdict(res.status, res.reason)
    }
    return { res, verdict }
  }

  try {
    let { res, verdict } = await attempt(first)
    let usedEnv = first
    if (verdict === 'wrong-env') {
      // A development build's token is a sandbox token, and vice versa. Try
      // the other host once before calling the token dead.
      usedEnv = otherEnvironment(first)
      ;({ res, verdict } = await attempt(usedEnv))
      if (verdict === 'wrong-env') verdict = 'dead'
    }
    if (verdict === 'delivered') {
      c.delivered++
      if (usedEnv !== row.apnsEnvironment) {
        report.apnsEnvironmentUpdates.push({ id: row.id, environment: usedEnv })
      }
      return
    }
    if (verdict === 'dead') {
      c.pruned++
      report.staleIds.push(row.id)
      return
    }
    c.failed++
    // DeviceTokenNotForTopic / TopicDisallowed / BadCertificate are OUR
    // configuration (bundle id, key), never the device's: keep the token.
    deps.error(`[push] apns send failed status=${res.status} reason=${res.reason ?? 'n/a'} env=${usedEnv}`)
  } catch (err) {
    c.failed++
    deps.error(`[push] apns send threw: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function sendOneFcm(
  row: NativeSubscriptionRow,
  message: NativePushMessage,
  fcm: FcmConfig,
  deps: NativeSendDeps,
  report: NativeSendReport,
): Promise<void> {
  const c = report.android
  c.attempted++
  try {
    const outcome = await sendFcm(fcm, row.endpoint, message, deps.fcm)
    if (outcome.kind === 'delivered') {
      c.delivered++
    } else if (outcome.kind === 'unregistered') {
      c.pruned++
      report.staleIds.push(row.id)
    } else {
      c.failed++
      deps.error(`[push] fcm send failed status=${outcome.status} code=${outcome.code}`)
    }
  } catch (err) {
    c.failed++
    deps.error(`[push] fcm send threw: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function sendToNativeDevices(
  rows: NativeSubscriptionRow[],
  message: NativePushMessage,
  config: NativeSendConfig,
  deps: NativeSendDeps,
): Promise<NativeSendReport> {
  const report: NativeSendReport = {
    ios: counts(),
    android: counts(),
    staleIds: [],
    apnsEnvironmentUpdates: [],
  }
  if (rows.length === 0) return report
  if (isChatTag(message.tag) && !config.nativeChat) return report

  const sendable: NativeSubscriptionRow[] = []
  for (const row of rows) {
    // Tokens from the abandoned Expo push design can never be delivered.
    // Drop them; the app registers a raw token on its next launch.
    if (isExpoPushToken(row.endpoint)) {
      report[row.platform].pruned++
      report.staleIds.push(row.id)
      continue
    }
    const configured = row.platform === 'ios' ? config.apns : config.fcm
    if (!configured) {
      if (!warnedUnconfigured.has(row.platform)) {
        warnedUnconfigured.add(row.platform)
        deps.warn(`[push] ${row.platform === 'ios' ? 'push.apns' : 'push.fcm'} is not configured; ${row.platform} devices are skipped`)
      }
      continue
    }
    sendable.push(row)
  }

  await eachLimited(sendable, NATIVE_SEND_CONCURRENCY, (row) =>
    row.platform === 'ios'
      ? sendOneApns(row, message, config.apns!, deps, report)
      : sendOneFcm(row, message, config.fcm!, deps, report),
  )
  return report
}

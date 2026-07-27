// SERVER-ONLY: this module resolves encrypted values and must never be imported
// by a client component or bundled into browser code.
import { MongoClient } from 'mongodb'
import { SecretsClient } from '@redbtn/redsecrets'

const APP_NAME = 'become'
const RUNTIME_SECRET_NAME = 'BECOME_RUNTIME_CONFIG'
const SECRETS_DATABASE = 'redshared'

export interface RuntimeConfig {
  auth: {
    jwtSecret: string
    mongoUri: string
    authMongoUri?: string
    googleClientId?: string
    googleClientSecret?: string
  }
  email: {
    host?: string
    port?: number
    user?: string
    pass?: string
    from?: string
  }
  redis: { url?: string }
  blob: {
    endpoint?: string
    region?: string
    bucket?: string
    accessKeyId?: string
    secretAccessKey?: string
    publicBaseUrl?: string
    forcePathStyle?: boolean
  }
  ai: {
    baseUrl?: string
    webhookId?: string
    webhookSecret?: string
    readbackToken?: string
  }
  reward: { mongoUri?: string }
  push: { publicKey?: string; privateKey?: string; email?: string }
  admin: { bootstrapToken?: string; cronSecret?: string; adminKey?: string }
  external: { usdaApiKey?: string; giphyApiKey?: string }
}

type RuntimePayload = Partial<{
  auth: Partial<RuntimeConfig['auth']>
  email: RuntimeConfig['email']
  redis: RuntimeConfig['redis']
  blob: RuntimeConfig['blob']
  ai: RuntimeConfig['ai']
  reward: RuntimeConfig['reward']
  push: RuntimeConfig['push']
  admin: RuntimeConfig['admin']
  external: RuntimeConfig['external']
}>

export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(`[Become runtime config] ${message}`)
    this.name = 'RuntimeConfigError'
  }
}

let cachedConfig: RuntimeConfig | null = null
let inFlight: Promise<RuntimeConfig> | null = null
let secretsClient: SecretsClient | null = null
let secretsMongoClient: MongoClient | null = null

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

function localEnv(name: string): string | undefined {
  return isProduction() ? undefined : process.env[name]
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function required(name: string, ...values: unknown[]): string {
  for (const value of values) {
    const found = nonEmpty(value)
    if (found) return found
  }
  throw new RuntimeConfigError(`${name} is required`)
}

function optional(...values: unknown[]): string | undefined {
  for (const value of values) {
    const found = nonEmpty(value)
    if (found) return found
  }
  return undefined
}

function numberValue(value: unknown, fallback?: string): number | undefined {
  const raw = typeof value === 'number' ? value : Number(value ?? fallback)
  return Number.isInteger(raw) && raw > 0 ? raw : undefined
}

function booleanValue(value: unknown, fallback?: string): boolean | undefined {
  if (typeof value === 'boolean') return value
  const raw = String(value ?? fallback ?? '').toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(raw)) return true
  if (['false', '0', 'no', 'off'].includes(raw)) return false
  return undefined
}

function parsePayload(raw: string | null): RuntimePayload {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    return parsed as RuntimePayload
  } catch {
    throw new RuntimeConfigError(`${RUNTIME_SECRET_NAME} must be valid JSON`)
  }
}

async function getSecretsClient(): Promise<SecretsClient | null> {
  if (secretsClient) return secretsClient

  const storeUri = required(
    'REDSECRETS_MONGODB_URI',
    isProduction() ? process.env.REDSECRETS_MONGODB_URI : process.env.REDSECRETS_MONGODB_URI || process.env.MONGODB_URI,
  )
  const encryptionKey = required(
    'SECRETS_ENCRYPTION_KEY',
    isProduction()
      ? process.env.SECRETS_ENCRYPTION_KEY
      : process.env.SECRETS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || process.env.JWT_SECRET,
  )

  try {
    secretsMongoClient = new MongoClient(storeUri)
    await secretsMongoClient.connect()
    secretsClient = new SecretsClient(secretsMongoClient, {
      database: SECRETS_DATABASE,
      encryptionKey,
    })
    await secretsClient.ensureIndexes()
    return secretsClient
  } catch {
    throw new RuntimeConfigError('unable to initialize the shared secret store')
  }
}

async function readRuntimePayload(): Promise<RuntimePayload> {
  const hasStoreBootstrap = Boolean(
    isProduction()
      ? process.env.REDSECRETS_MONGODB_URI && process.env.SECRETS_ENCRYPTION_KEY
      : process.env.REDSECRETS_MONGODB_URI
        && (process.env.SECRETS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || process.env.JWT_SECRET),
  )

  if (!hasStoreBootstrap) {
    if (isProduction()) {
      throw new RuntimeConfigError('shared secret store bootstrap is required')
    }
    return {}
  }

  const client = await getSecretsClient()
  let raw: string | null
  try {
    raw = await client!.get({
      name: RUNTIME_SECRET_NAME,
      appName: APP_NAME,
      scope: 'global',
    })
  } catch {
    throw new RuntimeConfigError('unable to read the shared runtime configuration')
  }

  if (!raw) {
    if (isProduction()) throw new RuntimeConfigError(`${RUNTIME_SECRET_NAME} is required`)
    return {}
  }
  return parsePayload(raw)
}

function buildConfig(payload: RuntimePayload): RuntimeConfig {
  const auth = payload.auth ?? {}
  const email = payload.email ?? {}
  const redis = payload.redis ?? {}
  const blob = payload.blob ?? {}
  const ai = payload.ai ?? {}
  const reward = payload.reward ?? {}
  const push = payload.push ?? {}
  const admin = payload.admin ?? {}
  const external = payload.external ?? {}

  return {
    auth: {
      jwtSecret: required('auth.jwtSecret', auth.jwtSecret, localEnv('JWT_SECRET')),
      mongoUri: required('auth.mongoUri', auth.mongoUri, localEnv('MONGODB_URI')),
      authMongoUri: optional(auth.authMongoUri, localEnv('AUTH_MONGODB_URI')),
      googleClientId: optional(auth.googleClientId, localEnv('GOOGLE_CLIENT_ID')),
      googleClientSecret: optional(auth.googleClientSecret, localEnv('GOOGLE_CLIENT_SECRET')),
    },
    email: {
      host: optional(email.host, localEnv('EMAIL_HOST')) || 'smtp.gmail.com',
      port: numberValue(email.port, localEnv('EMAIL_PORT')) || 587,
      user: optional(email.user, localEnv('EMAIL_USER')),
      pass: optional(email.pass, localEnv('EMAIL_PASS')),
      from: optional(email.from, localEnv('EMAIL_FROM')),
    },
    redis: { url: optional(redis.url, localEnv('REDIS_URL')) },
    blob: {
      endpoint: optional(blob.endpoint, localEnv('S3_ENDPOINT')),
      region: optional(blob.region, localEnv('S3_REGION')) || 'us-east-1',
      bucket: optional(blob.bucket, localEnv('S3_BUCKET')),
      accessKeyId: optional(blob.accessKeyId, localEnv('S3_ACCESS_KEY_ID')),
      secretAccessKey: optional(blob.secretAccessKey, localEnv('S3_SECRET_ACCESS_KEY')),
      publicBaseUrl: optional(blob.publicBaseUrl, localEnv('S3_PUBLIC_BASE_URL')),
      forcePathStyle: booleanValue(blob.forcePathStyle, localEnv('S3_FORCE_PATH_STYLE')),
    },
    ai: {
      baseUrl: optional(ai.baseUrl, localEnv('BECOME_AI_BASE_URL')) || 'https://app.redbtn.io',
      webhookId: optional(ai.webhookId, localEnv('BECOME_AI_WEBHOOK_ID')) || 'LzbTW8D6DA9z',
      webhookSecret: optional(ai.webhookSecret, localEnv('BECOME_AI_WEBHOOK_SECRET')),
      readbackToken: optional(ai.readbackToken, localEnv('BECOME_AI_READBACK_TOKEN')),
    },
    reward: { mongoUri: optional(reward.mongoUri, localEnv('BECOME_REWARD_MONGODB_URI')) },
    push: {
      publicKey: optional(push.publicKey, localEnv('VAPID_PUBLIC_KEY')),
      privateKey: optional(push.privateKey, localEnv('VAPID_PRIVATE_KEY')),
      email: optional(push.email, localEnv('VAPID_EMAIL')) || 'mailto:admin@become.redbtn.io',
    },
    admin: {
      bootstrapToken: optional(admin.bootstrapToken, localEnv('BOOTSTRAP_TOKEN')),
      cronSecret: optional(admin.cronSecret, localEnv('CRON_SECRET')),
      adminKey: optional(admin.adminKey, localEnv('ADMIN_KEY')),
    },
    external: {
      usdaApiKey: optional(external.usdaApiKey, localEnv('USDA_API_KEY')),
      giphyApiKey: optional(external.giphyApiKey, localEnv('GIPHY_API_KEY')),
    },
  }
}

async function resolveRuntimeConfig(): Promise<RuntimeConfig> {
  return buildConfig(await readRuntimePayload())
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (cachedConfig) return cachedConfig
  if (!inFlight) {
    inFlight = resolveRuntimeConfig()
      .then((config) => {
        cachedConfig = config
        return config
      })
      .finally(() => {
        if (!cachedConfig) inFlight = null
      })
  }
  return inFlight
}

export function requireRuntimeSecret(value: string | undefined, name: string): string {
  return required(name, value)
}

export function __resetRuntimeConfigForTests(): void {
  cachedConfig = null
  inFlight = null
  secretsClient = null
  secretsMongoClient = null
}

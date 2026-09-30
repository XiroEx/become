// THE CONTRACT HARNESS — the web's own test of what the native app is sent.
//
// Run with: npm run test:file 'tests/unit/contract/*.test.ts'
//
// WHY THIS LIVES IN THE WEBAPP SUITE
//
// `shared/api-client` is the wire contract the Expo app reads every response
// through, and until this directory existed NOTHING failed when the web changed
// a response: `shared/api-client/tests/schemas.test.ts` parses hand-written
// fixtures, which agree with the schema by construction and say nothing about
// what the route actually returns. About 680 webapp commits have landed since
// 2026-05-31 against 4 in `expo/` and `shared/` (expo/gap_analysis/
// PARITY_GAP_ANALYSIS.md §1.8), so the contract has to be checked in the suite
// that runs on every web change — this one, the `verify` job, which always
// runs.
//
// So these tests call the REAL exported route handlers against the real
// (loopback, disposable) test database with real signed tokens, and parse the
// JSON they answer with using the schema imported from `shared/api-client/src`
// BY RELATIVE PATH.
//
// THE RELATIVE PATH IS DELIBERATE, AND SO IS "TESTS ONLY".
//
// webapp/Dockerfile builds with the build context set to `webapp/` (`COPY . .`,
// RedRun `baseDirectory: webapp`), so `../shared` does not exist in the image:
// an import of `@become/api-client` from app code would typecheck locally and
// break the production build. Tests never run inside that image — CI runs them
// from the full checkout and installs `shared/api-client`'s own lockfile first
// (.github/workflows/ci.yml, "Install shared/api-client deps") — so the
// relative import is safe HERE and nowhere else. Import the schemas by
// relative path in this directory; never through the tsconfig alias.
//
// WHAT "PARSES" IS NOT ENOUGH FOR
//
// Every response schema is `.passthrough()` on purpose: a shipped store build
// outlives the server it was written against and must keep a field it has never
// heard of rather than dropping the whole response. That forward-compatibility
// makes `schema.parse(body)` blind to exactly the change this harness exists to
// catch — a RENAMED field parses fine, as an unknown extra key, while the field
// the native app reads is simply gone.
//
// `assertContract` therefore checks three things, not one:
//   1. the body parses (a type change fails here);
//   2. every key the body carries is DECLARED by the schema, at every depth
//      (a renamed or brand-new field fails here);
//   3. every key named in `expectKeys` is present (a renamed or deleted field
//      fails here too).
//
// HOW A DOMAIN TICKET ADDS ITS ROUTES (NP-018 … NP-024, NP-037, NP-202)
//
//   1. Add or re-align the schema in shared/api-client/src/schemas/<domain>.ts
//      and export it from src/index.ts.
//   2. Add one file here, `<domain>.test.ts`, importing those schemas by
//      relative path (../../../../shared/api-client/src/schemas/<domain>).
//   3. Declare every route the ticket covers in a `ContractRoute[]` manifest in
//      that file, seed with `seedMembers()` and call each handler through
//      `getJson` / `sendJson`, asserting with `assertContract`.
//   4. End the file with `assertEveryRouteCovered(manifest, coverage)`, so a
//      manifest entry nobody actually called fails the suite instead of
//      quietly counting as coverage.
//   5. Use fixture emails under your own `@<domain>.contract.test` domain and
//      clean them up in `after()`: the runner executes test FILES in parallel,
//      so two files sharing a fixture row would race.
//
// THE RULE THAT TRAVELS: a failing contract test blocks the web PR. The web
// author updates `shared/api-client` in the SAME PR — that is the whole point
// of checking the contract where the change is made. Do not "fix" a failure by
// loosening a schema to `z.unknown()` or by deleting the expectKeys entry.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import NodeModule from 'node:module'
import nodePath from 'node:path'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import User from '../../../models/User'
import UserProgress from '../../../models/UserProgress'
import { signToken } from '../../../lib/auth'

// ---------------------------------------------------------------------------
// Members. One free, one Plus — the two sides of every gate.
// ---------------------------------------------------------------------------

export interface ContractMember {
  /** Stable ObjectId hex, so a leaked row is identifiable and cleanable. */
  readonly id: string
  readonly email: string
  readonly label: 'free' | 'plus'
  /** `Bearer <jwt>`, filled in by seedMembers(). */
  auth: string
}

export const FREE_MEMBER: ContractMember = {
  id: '6ab0150000000000000f7ee0',
  email: 'free@np015.contract.test',
  label: 'free',
  auth: '',
}

export const PLUS_MEMBER: ContractMember = {
  id: '6ab0150000000000000f7ee1',
  email: 'plus@np015.contract.test',
  label: 'plus',
  auth: '',
}

const FIXTURE_EMAILS = [FREE_MEMBER.email, PLUS_MEMBER.email]

/**
 * Connect, drop anything left over, and create the two members.
 *
 * `ENTITLEMENTS_ENFORCED` is switched ON here: with the kill-switch off every
 * `allowed`/`canCreate` is true and the free/Plus difference the schema
 * describes never appears in a response. A test process is its own process, so
 * this affects nothing else.
 */
export async function seedMembers(): Promise<void> {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await dropMembers()

  await User.create({
    _id: new mongoose.Types.ObjectId(FREE_MEMBER.id),
    email: FREE_MEMBER.email,
    // The legacy password column is `required` on the model; magic-link members
    // never use it.
    password: 'contract-test-unused',
    name: 'Contract Free',
    tier: 'free',
  })

  await User.create({
    _id: new mongoose.Types.ObjectId(PLUS_MEMBER.id),
    email: PLUS_MEMBER.email,
    password: 'contract-test-unused',
    name: 'Contract Plus',
    tier: 'plus',
    // A real subscription row, in TEST mode — which is the mode an
    // unconfigured install reports, so `managed` comes back true and
    // GET /api/billing/status answers with its fullest shape.
    subscription: {
      status: 'active',
      plan: 'monthly',
      currentPeriodEnd: new Date('2027-01-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      stripeTestCustomerId: 'cus_np015_contract_test',
    },
    profile: { fitnessGoal: 'gain_muscle', weightUnit: 'lbs' },
    onboardingCompleted: true,
  })

  FREE_MEMBER.auth = `Bearer ${await signToken({ userId: FREE_MEMBER.id, email: FREE_MEMBER.email })}`
  PLUS_MEMBER.auth = `Bearer ${await signToken({ userId: PLUS_MEMBER.id, email: PLUS_MEMBER.email })}`
}

/** Remove every row these tests could have written. */
export async function dropMembers(): Promise<void> {
  const ids = [FREE_MEMBER.id, PLUS_MEMBER.id].map((id) => new mongoose.Types.ObjectId(id))
  await User.deleteMany({ $or: [{ _id: { $in: ids } }, { email: { $in: FIXTURE_EMAILS } }] })
  await UserProgress.deleteMany({ userId: { $in: [FREE_MEMBER.id, PLUS_MEMBER.id] } })
}

// ---------------------------------------------------------------------------
// Calling a route handler
// ---------------------------------------------------------------------------

export type Handler = (request: NextRequest) => Promise<Response> | Response

export interface CallResult {
  status: number
  /** Parsed JSON body, or `null` for a 204 (which several routes answer with). */
  body: unknown
}

/** A signed GET against `path`, optionally with a query string. */
export async function getJson(
  handler: Handler,
  path: string,
  member: ContractMember,
  query: Record<string, string> = {},
): Promise<CallResult> {
  const url = new URL(`http://localhost${path}`)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  const request = new NextRequest(url, {
    headers: new Headers({ Authorization: member.auth }),
  })
  return read(await handler(request))
}

/** A signed write. `member` may be null for the routes that take no session. */
export async function sendJson(
  handler: Handler,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  member: ContractMember | null,
  body: unknown,
): Promise<CallResult> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (member) headers.set('Authorization', member.auth)
  const request = new NextRequest(new URL(`http://localhost${path}`), {
    method,
    headers,
    body: JSON.stringify(body),
  })
  return read(await handler(request))
}

/**
 * `app/api/tutorial-progress/route.ts` is the one NP-015 route this suite
 * cannot simply `import`.
 *
 * It imports `@redbtn/redtutorial`, whose published package.json offers only an
 * `import` condition in its exports map, and whose `dist/` uses extensionless
 * relative specifiers. Node's CJS resolver therefore refuses the package name
 * (ERR_PACKAGE_PATH_NOT_EXPORTED) and Node's own ESM loader refuses the dist
 * files (ERR_MODULE_NOT_FOUND): only a bundler resolves it, which is why the
 * Next build is fine and this runner is not.
 *
 * So the package NAME is redirected to the package's real entry FILE, which
 * tsx loads happily. The real library runs — `parseProgressState` is not
 * stubbed — the redirect is undone immediately, and it is scoped to this
 * process. Route handlers are cached by `require` after the first call.
 */
export function loadTutorialProgressRoute(): { GET: Handler; PUT: Handler } {
  const PACKAGE = '@redbtn/redtutorial'
  const candidates = [
    nodePath.join(__dirname, '..', '..', '..', 'node_modules', PACKAGE),
    nodePath.join(__dirname, '..', '..', '..', '..', 'node_modules', PACKAGE),
  ]
  const root = candidates.find((dir) => fs.existsSync(nodePath.join(dir, 'package.json')))
  assert.ok(root, `${PACKAGE} is not installed — run npm ci in webapp/`)

  const manifest = JSON.parse(
    fs.readFileSync(nodePath.join(root, 'package.json'), 'utf8'),
  ) as { main?: string }
  const entry = nodePath.join(root, manifest.main ?? 'dist/index.js')
  assert.ok(fs.existsSync(entry), `${PACKAGE} has no entry file at ${entry}`)

  interface LoaderInternals {
    _load(request: string, parent: unknown, isMain: boolean): unknown
  }
  const loader = NodeModule as unknown as LoaderInternals
  const original = loader._load
  loader._load = function patched(request: string, parent: unknown, isMain: boolean) {
    return original.call(this, request === PACKAGE ? entry : request, parent, isMain)
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../../app/api/tutorial-progress/route') as { GET: Handler; PUT: Handler }
  } finally {
    loader._load = original
  }
}

async function read(response: Response): Promise<CallResult> {
  if (response.status === 204) return { status: 204, body: null }
  const text = await response.text()
  if (!text) return { status: response.status, body: null }
  return { status: response.status, body: JSON.parse(text) as unknown }
}

// ---------------------------------------------------------------------------
// The assertion
// ---------------------------------------------------------------------------

/** The minimum of a zod schema's internals this file relies on (v4 `def`). */
interface ZodLike {
  parse(value: unknown): unknown
  def?: ZodDef
  _zod?: { def?: ZodDef }
}

interface ZodDef {
  type?: string
  shape?: Record<string, unknown>
  innerType?: unknown
  element?: unknown
  valueType?: unknown
  options?: unknown[]
}

function defOf(schema: unknown): ZodDef {
  const s = schema as ZodLike
  return (s?.def ?? s?._zod?.def ?? {}) as ZodDef
}

/** Strip the wrappers that do not change an object's key set. */
function unwrap(schema: unknown): unknown {
  const WRAPPERS = new Set([
    'optional', 'nullable', 'default', 'prefault', 'catch', 'readonly', 'nonoptional', 'lazy',
  ])
  let current = schema
  for (let i = 0; i < 20; i += 1) {
    const def = defOf(current)
    if (!def.type || !WRAPPERS.has(def.type) || def.innerType === undefined) return current
    current = def.innerType
  }
  return current
}

/**
 * The keys a schema DECLARES for an object, or null when the node is not an
 * object schema. Exported because the `lib/sharedApiTypes.ts` parity test
 * compares two schemas key for key with it.
 */
export function declaredKeys(schema: unknown): string[] | null {
  const def = defOf(unwrap(schema))
  if (def.type !== 'object' || !def.shape) return null
  return Object.keys(def.shape)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Every key in `value`, at every depth, must be declared by `schema`.
 *
 * This is the half `schema.parse()` cannot do: the response schemas are
 * `.passthrough()` so a shipped build survives a server that grew a field, and
 * that same tolerance is what lets a rename slip past a parse.
 */
function assertKeysDeclared(label: string, schema: unknown, value: unknown, path: string): void {
  const node = unwrap(schema)
  const def = defOf(node)

  if (def.type === 'object' && def.shape && isPlainObject(value)) {
    const shape = def.shape
    for (const key of Object.keys(value)) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(shape, key),
        `${label}: ${path}${key} is in the response but NOT in the shared schema. `
          + 'The web changed the contract: declare it in shared/api-client (and rename it '
          + 'there if this is a rename) in THIS pull request — the native app reads the '
          + 'schema, not the route.',
      )
      assertKeysDeclared(label, shape[key], value[key], `${path}${key}.`)
    }
    return
  }

  if (def.type === 'array' && Array.isArray(value) && def.element !== undefined) {
    value.forEach((item, index) => {
      assertKeysDeclared(label, def.element, item, `${path}${index}.`)
    })
    return
  }

  if (def.type === 'record' && isPlainObject(value) && def.valueType !== undefined) {
    for (const [key, item] of Object.entries(value)) {
      assertKeysDeclared(label, def.valueType, item, `${path}${key}.`)
    }
  }
}

/** Resolve a dotted path ('features.vision.canCreate', 'widgets.0.headline'). */
function at(value: unknown, path: string): { found: boolean; value: unknown } {
  let current: unknown = value
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { found: false, value: undefined }
      }
      current = current[index]
      continue
    }
    if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false, value: undefined }
    }
    current = current[segment]
  }
  return { found: true, value: current }
}

export interface ContractExpectation {
  /** Human label for failures, e.g. "GET /api/me/entitlements (free)". */
  label: string
  /** The schema from shared/api-client, imported by relative path. */
  schema: unknown
  body: unknown
  /**
   * Dotted paths the native app READS and the route is expected to send. A
   * rename removes the old path (fails here) and adds an undeclared one (fails
   * in assertKeysDeclared) — which is how a rename is caught from both sides.
   */
  expectKeys?: string[]
}

export function assertContract({ label, schema, body, expectKeys = [] }: ContractExpectation): void {
  // 1. It parses. A changed TYPE fails here.
  try {
    ;(schema as ZodLike).parse(body)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    assert.fail(
      `${label}: the real response does not parse with the shared schema.\n${detail}\n`
        + `Body: ${JSON.stringify(body, null, 2)}`,
    )
  }

  // 2. Nothing undeclared, at any depth. A RENAMED or new field fails here.
  assertKeysDeclared(label, schema, body, '')

  // 3. Everything the native app reads is still there. A rename fails here too.
  for (const path of expectKeys) {
    const { found } = at(body, path)
    assert.ok(
      found,
      `${label}: '${path}' is missing from the real response. The native app reads it `
        + 'through shared/api-client — if the web renamed or dropped it, rename it in the '
        + 'shared schema and in this expectation in THIS pull request.',
    )
  }
}

// ---------------------------------------------------------------------------
// Coverage: the manifest, and the proof it was exercised
// ---------------------------------------------------------------------------

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface ContractRoute {
  method: HttpMethod
  path: string
  /** The exported schema name in shared/api-client this route is parsed with. */
  schema: string
  /** Why it is in scope / what is special about calling it. */
  note?: string
}

/** Records what a test file actually called, keyed 'METHOD /path'. */
export class Coverage {
  private readonly seen = new Set<string>()

  mark(method: HttpMethod, path: string): void {
    this.seen.add(`${method} ${path}`)
  }

  has(method: HttpMethod, path: string): boolean {
    return this.seen.has(`${method} ${path}`)
  }

  list(): string[] {
    return [...this.seen].sort()
  }
}

/**
 * Fail unless every declared route was actually called. Without this a
 * manifest is a wish list: an entry nobody exercises looks like coverage in a
 * review and checks nothing.
 */
export function assertEveryRouteCovered(routes: readonly ContractRoute[], coverage: Coverage): void {
  const missing = routes
    .filter((route) => !coverage.has(route.method, route.path))
    .map((route) => `${route.method} ${route.path} (${route.schema})`)

  assert.deepEqual(
    missing,
    [],
    `these declared routes were never called, so nothing checks their contract:\n  ${missing.join('\n  ')}`,
  )
}

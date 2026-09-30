// Run with: npm run test:file tests/unit/contract/sharedApiTypes.test.ts
//
// webapp/lib/sharedApiTypes.ts IS A HAND COPY, AND THIS IS WHY IT IS ALLOWED
// TO BE ONE.
//
// The webapp cannot import `@become/api-client`: webapp/Dockerfile builds with
// the build context set to `webapp/` (`COPY . .`, RedRun
// `baseDirectory: webapp`), so `../shared` is not in the image and a type
// import from app code would typecheck on a dev box and fail the production
// build. Tests are the one place that may reach the sibling package — they run
// from the full checkout and CI installs its lockfile first — so the copy is
// compared with the original HERE.
//
// Before this file the copy could disagree with `shared/api-client` and
// nothing failed: it was a mirror of the May API, it imported `zod` although
// webapp/package.json did not declare it (a hoisted transitive copy that
// would have vanished the day a dependency dropped it), and one route
// (app/api/auth/me/route.ts) read its `MeResponse` type — so the web could
// rename a field in the response, keep typechecking against its own copy, and
// break every native client silently.
//
// Three things are asserted, and each one is a way the copy could rot:
//   1. every schema is structurally identical to its shared counterpart, at
//      every depth — keys, types, optionality, passthrough;
//   2. the file exports nothing beyond the schemas this test polices, so a new
//      hand copy cannot be added without being checked too;
//   3. `zod` is a DECLARED dependency of webapp, at a major the shared client
//      agrees with.
//
// No database, no network: this is a comparison of two module graphs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// The copy.
import * as webapp from '../../../lib/sharedApiTypes'
// The original, by relative path — see _contract.ts for why that is safe here.
import {
  UserSchema as SharedUserSchema,
  UserSubscriptionSchema as SharedUserSubscriptionSchema,
  MeResponseSchema as SharedMeResponseSchema,
} from '../../../../shared/api-client/src/schemas/auth'
import { UserProfileSchema as SharedUserProfileSchema } from '../../../../shared/api-client/src/schemas/account'

const WEBAPP_ROOT = path.join(__dirname, '..', '..', '..')
const REPO_ROOT = path.join(WEBAPP_ROOT, '..')

// ---------------------------------------------------------------------------
// A canonical description of a zod schema, deep enough to catch a rename.
// ---------------------------------------------------------------------------

interface ZodDef {
  type?: string
  shape?: Record<string, unknown>
  innerType?: unknown
  element?: unknown
  valueType?: unknown
  keyType?: unknown
  entries?: Record<string, unknown>
  catchall?: unknown
  options?: unknown[]
}

function defOf(schema: unknown): ZodDef {
  const s = schema as { def?: ZodDef; _zod?: { def?: ZodDef } }
  return (s?.def ?? s?._zod?.def ?? {}) as ZodDef
}

/**
 * Describe a schema as plain data so two of them can be deep-compared.
 *
 * Wrappers are kept rather than stripped: `name: z.string().optional()` and
 * `name: z.string()` are not the same contract — one of them is the difference
 * between a native screen rendering a blank and refusing the whole response.
 */
function describe(schema: unknown): unknown {
  const def = defOf(schema)
  const WRAPPERS = new Set([
    'optional', 'nullable', 'default', 'prefault', 'catch', 'readonly', 'nonoptional',
  ])

  if (def.type && WRAPPERS.has(def.type)) {
    return { wrap: def.type, of: describe(def.innerType) }
  }
  if (def.type === 'object') {
    const shape = def.shape ?? {}
    return {
      object: Object.fromEntries(
        Object.keys(shape).sort().map((key) => [key, describe(shape[key])]),
      ),
      // `.passthrough()` — forward compatibility for a shipped build. If one
      // side has it and the other does not, they disagree about what happens
      // when the server grows a field.
      passthrough: def.catchall !== undefined,
    }
  }
  if (def.type === 'array') return { array: describe(def.element) }
  if (def.type === 'record') {
    return { record: { key: describe(def.keyType), value: describe(def.valueType) } }
  }
  if (def.type === 'enum') return { enum: Object.values(def.entries ?? {}).map(String).sort() }
  if (def.type === 'union') return { union: (def.options ?? []).map(describe) }
  return { type: def.type ?? 'unknown' }
}

// ---------------------------------------------------------------------------
// 1. Key for key with shared/api-client
// ---------------------------------------------------------------------------

const PAIRS = [
  ['UserProfileSchema', webapp.UserProfileSchema, SharedUserProfileSchema],
  ['UserSubscriptionSchema', webapp.UserSubscriptionSchema, SharedUserSubscriptionSchema],
  ['UserSchema', webapp.UserSchema, SharedUserSchema],
  ['MeResponseSchema', webapp.MeResponseSchema, SharedMeResponseSchema],
] as const

for (const [name, mine, theirs] of PAIRS) {
  test(`lib/sharedApiTypes.ts ${name} is identical to shared/api-client's, key for key`, () => {
    assert.deepEqual(
      describe(mine),
      describe(theirs),
      `webapp/lib/sharedApiTypes.ts#${name} and shared/api-client disagree. The webapp `
        + 'cannot import the shared package (webapp/Dockerfile\'s build context is webapp/), '
        + 'so this copy has to be updated in the SAME pull request as the schema — that is '
        + 'the only thing keeping the native app and the web on one contract.',
    )
  })
}

test('the same real-shaped GET /api/auth/me body parses with both copies', () => {
  // The projection app/api/auth/me/route.ts selects, with a Plus member's
  // three-field subscription block.
  const body = {
    user: {
      _id: '68f1c2a9b4d3e10012ab34cd',
      email: 'jon@example.com',
      name: 'Jon',
      role: 'user',
      tier: 'plus',
      grandfathered: true,
      subscription: {
        status: 'active',
        currentPeriodEnd: '2027-01-01T00:00:00.000Z',
        cancelAtPeriodEnd: false,
      },
      trainerId: null,
      savedPrograms: [],
      profile: { fitnessGoal: 'gain_muscle', weightUnit: 'kg' },
      onboardingCompleted: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    token: 'a.b.c',
  }

  assert.deepEqual(
    webapp.MeResponseSchema.parse(body),
    SharedMeResponseSchema.parse(body),
    'the two copies parsed the same body differently',
  )
})

// ---------------------------------------------------------------------------
// 2. Nothing unpoliced may be added to the file
// ---------------------------------------------------------------------------

test('lib/sharedApiTypes.ts exports nothing this test does not compare', () => {
  // Runtime exports only — the `type` aliases are erased, which is fine: every
  // one of them is inferred from a schema below.
  assert.deepEqual(
    Object.keys(webapp).sort(),
    PAIRS.map(([name]) => name).sort(),
    'a new schema was hand-copied into webapp/lib/sharedApiTypes.ts without being compared '
      + 'with shared/api-client. Add it to PAIRS here, or (better) leave the shape on the '
      + 'native side of the wire where @become/api-client is a real dependency.',
  )
})

test('lib/sharedApiTypes.ts is the webapp\'s only hand copy of a shared schema', () => {
  // The dead copies that used to live in this file (ActiveProgram,
  // ScheduleSlot, MoodEntry, WeightEntry, WorkoutLog) were removed with the
  // harness: nothing imported them and shared/api-client owns those domains
  // (NP-018 … NP-023). This fails if they come back.
  const source = fs.readFileSync(path.join(WEBAPP_ROOT, 'lib', 'sharedApiTypes.ts'), 'utf8')
  for (const gone of ['ActiveProgram', 'ScheduleSlot', 'ScheduleResponse', 'MoodEntry', 'WeightEntry', 'WorkoutLog']) {
    assert.equal(
      source.includes(`export interface ${gone}`),
      false,
      `${gone} is a hand copy of a domain shared/api-client owns — no test can hold it to `
        + 'the schema, because it is a TypeScript interface and not a schema. Put it in '
        + 'shared/api-client instead.',
    )
  }
})

// ---------------------------------------------------------------------------
// 3. Every package this file imports is declared
// ---------------------------------------------------------------------------

interface Manifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function manifestOf(dir: string): Manifest {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Manifest
}

test('webapp declares every package lib/sharedApiTypes.ts imports — zod included', () => {
  const manifest = manifestOf(WEBAPP_ROOT)
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ])

  // Comments first: this file's header quotes the import it must NOT make.
  const source = fs
    .readFileSync(path.join(WEBAPP_ROOT, 'lib', 'sharedApiTypes.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
  const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
  const bare = specifiers.filter((spec) => !spec.startsWith('.') && !spec.startsWith('@/'))

  assert.ok(bare.includes('zod'), 'this test is pointless if the file stopped importing zod')
  for (const spec of bare) {
    // node: builtins need no manifest entry; a subpath belongs to its package.
    if (spec.startsWith('node:')) continue
    const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
    assert.ok(
      declared.has(pkg),
      `lib/sharedApiTypes.ts imports '${spec}' but webapp/package.json does not declare `
        + `'${pkg}'. It resolves today only because something else in the tree happens to `
        + 'depend on it — declare it, or stop importing it.',
    )
  }
})

test('webapp and shared/api-client agree on the zod major', () => {
  const webappRange = manifestOf(WEBAPP_ROOT).dependencies?.zod
  const sharedRange = manifestOf(path.join(REPO_ROOT, 'shared', 'api-client')).dependencies?.zod
  assert.ok(webappRange, 'webapp/package.json must declare zod')
  assert.ok(sharedRange, 'shared/api-client/package.json must declare zod')

  const major = (range: string) => range.replace(/^[^\d]*/, '').split('.')[0]
  assert.equal(
    major(webappRange),
    major(sharedRange),
    `webapp declares zod ${webappRange} and shared/api-client declares ${sharedRange}. Two `
      + 'majors means the schemas above are built by two different libraries and this '
      + 'comparison stops meaning anything.',
  )
})

test('webapp/package-lock.json carries zod as a direct dependency', () => {
  // `npm ci` refuses a lockfile that disagrees with package.json, so a
  // manifest edit without a lockfile update fails CI at install time with a
  // message about nothing in particular. This says which.
  const lock = JSON.parse(
    fs.readFileSync(path.join(WEBAPP_ROOT, 'package-lock.json'), 'utf8'),
  ) as { packages?: Record<string, { dependencies?: Record<string, string> }> }
  const root = lock.packages?.['']
  assert.ok(root, 'package-lock.json has no root package entry')
  assert.ok(
    root.dependencies?.zod,
    'webapp/package-lock.json does not list zod as a root dependency — run `npm install` '
      + 'in webapp/ and commit the lockfile alongside package.json.',
  )
})

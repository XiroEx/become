// PRELOADED BEFORE EVERY UNIT TEST (`--import ./tests/unit/_guard.ts`).
//
// A unit test may create, mutate and drop collections. `npm run test:unit` pins
// MONGODB_URI to a loopback `become-test` database, but nothing stopped a
// developer from running one file directly —
//
//     npx tsx --test tests/unit/nutrition/foods.test.ts     ← NOT THIS
//
// — where the shell's own MONGODB_URI is inherited. On this fleet that value
// comes from ~/.env via ~/.bashrc and names a REMOTE host. Every test file's
// header therefore documents `npm run test:file <path>`, which is the same
// pinned, guarded environment as the full suite with the globs swapped for one
// path. `test:unit` is defined in terms of `test:file` so the two can never
// drift apart: there is one env prefix in package.json, not two.
//
// So the target is checked rather than assumed: loopback host, and a database
// whose name ends in `-test`. Both, every time, before a single test module is
// loaded. This is a blast-radius guard, not a security boundary — it exists to
// turn a catastrophic typo into an immediate, obvious failure.
//
// It is deliberately quiet when nothing is configured: CI has no such env, and
// refusing to start there would break the build over a database nobody is
// talking to.

const LOOPBACK = new Set(['127.0.0.1', '::1', '[::1]', 'localhost', '0.0.0.0'])

function isLoopbackHost(hostPort: string): boolean {
  // Strip the port, keeping a bracketed IPv6 literal intact.
  const host = hostPort.startsWith('[')
    ? hostPort.slice(0, hostPort.indexOf(']') + 1)
    : hostPort.split(':')[0]
  const bare = host.toLowerCase()
  if (LOOPBACK.has(bare)) return true
  // The whole 127.0.0.0/8 block is loopback.
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare)
}

/**
 * Hosts + database out of a mongodb:// or mongodb+srv:// URI. `new URL()`
 * cannot be used here: a seed list is comma separated and URL rejects it.
 */
function parseMongoUri(uri: string): { hosts: string[]; db: string } | null {
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?/i.exec(uri.trim())
  if (!m) return null
  return {
    hosts: m[1].split(',').filter(Boolean),
    db: decodeURIComponent(m[2] ?? ''),
  }
}

function refuse(varName: string, why: string): never {
  // The URI itself is never printed — it carries credentials.
  throw new Error(
    `[tests] refusing to run: ${varName} ${why}. Unit tests write to and drop `
      + 'collections, so they may only point at a loopback host and a database '
      + 'whose name ends in "-test". Use `npm run test:unit` for the suite or '
      + '`npm run test:file <path>` for one file — both pin '
      + `mongodb://127.0.0.1:27017/become-test — or set ${varName} yourself `
      + 'before running a file directly.',
  )
}

/**
 * Refuse unless `process.env[varName]` is absent, or names a loopback host (and
 * a `-test` database when asked). Exported so the rule itself can be tested —
 * a guard nobody exercises is a guard nobody notices has stopped working.
 */
export function requireLocalTestTarget(varName: string, opts: { needsTestDb: boolean }): void {
  const uri = process.env[varName]
  if (!uri) return // nothing configured, nothing to point at the wrong place

  const parsed = parseMongoUri(uri)
  if (!parsed) refuse(varName, 'is not a mongodb connection string')
  if (!parsed.hosts.every(isLoopbackHost)) refuse(varName, 'names a non-loopback host')
  if (opts.needsTestDb && !parsed.db.endsWith('-test')) {
    refuse(varName, 'names a database that does not end in "-test"')
  }
}

requireLocalTestTarget('MONGODB_URI', { needsTestDb: true })
// The secret store is a second door into the same room: lib/runtimeConfig.ts
// bootstraps from it outside production and its payload carries a MONGODB_URI
// that would outrank the pin above. `test:unit` unsets it and readRuntimePayload
// short-circuits on NODE_ENV=test, but a direct run has neither. The database
// there is always `redshared`, so only the host is checked.
requireLocalTestTarget('REDSECRETS_MONGODB_URI', { needsTestDb: false })

// The remaining doors, and they are doors for the same reason: under
// NODE_ENV=test `readRuntimePayload()` returns `{}`, so every field in
// lib/runtimeConfig.ts falls through to `localEnv(...)` — the raw environment
// is the ONLY source. These two are then dialled directly:
//
//   AUTH_MONGODB_URI          → lib/redauth.ts, `createRedAuth({ mongoUri })`
//   BECOME_REWARD_MONGODB_URI → lib/reward/redreward.ts, `createRedReward({ mongoUri })`
//
// Both are separate DATABASES holding real member identity and inventory, and
// both were outside the guard while ~/.env exported them. No test reaches
// getRedAuth() or getRedReward() today, which is exactly the wrong reason to
// leave them uncovered — the first passkey, Google-auth or rewards route test
// is the one that finds out, and by then it has already connected. `test:file`
// unsets both; this refuses if a direct run reinstates them.
//
// Held to the same rule as MONGODB_URI, `-test` suffix included: these
// databases carry the redAuth `users` collection and the reward ledger, and a
// test that touches them will create and drop collections there too.
requireLocalTestTarget('AUTH_MONGODB_URI', { needsTestDb: true })
requireLocalTestTarget('BECOME_REWARD_MONGODB_URI', { needsTestDb: true })



// Run with: npm run test:file tests/unit/billing/billingSecretHygiene.test.ts
//
// A repo guard, not a unit test. A Stripe secret key committed to a private
// repo is still a compromised key — it is in every clone, every CI cache and
// every build image (see the RedRun build-arg incident). This fails the build
// on the shape of one, before a human has to notice it in a diff.
//
// It also keeps the SDK out of the browser bundle. `import Stripe from 'stripe'`
// from a 'use client' file ships the whole server SDK to every visitor, and if
// the key ever reaches a NEXT_PUBLIC_ var it ships that too.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../../..')
const SCAN_DIRS = ['lib', 'app', 'components', 'models', 'hooks', 'scripts']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'public'])
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'])

// This file necessarily contains the patterns it searches for.
const SELF = path.join(ROOT, 'tests/unit/billing/billingSecretHygiene.test.ts')

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out)
    } else if (EXTENSIONS.has(path.extname(entry.name)) && full !== SELF) {
      out.push(full)
    }
  }
  return out
}

const FILES = SCAN_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)))

function scan(pattern: RegExp, label: string) {
  const hits: string[] = []
  for (const file of FILES) {
    const source = fs.readFileSync(file, 'utf8')
    if (pattern.test(source)) hits.push(path.relative(ROOT, file))
  }
  assert.deepEqual(hits, [], `${label} found in: ${hits.join(', ')}`)
}

test('the tree scan actually found files to scan', () => {
  // A broken walk would make every assertion below pass vacuously.
  assert.ok(FILES.length > 100, `expected a real tree, got ${FILES.length} files`)
})

test('no Stripe secret or restricted key is committed', () => {
  scan(/\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/, 'a Stripe secret key')
})

test('no webhook signing secret is committed', () => {
  scan(/\bwhsec_[A-Za-z0-9]{16,}/, 'a Stripe webhook secret')
})

test('no real price id is committed — prices come from config', () => {
  // Real ids are ~24 chars after the prefix. Prices are an unsettled product
  // decision, which is exactly why everything here is config-driven.
  scan(/\bprice_[A-Za-z0-9]{20,}/, 'a Stripe price id')
})

test('no publishable key is baked into a NEXT_PUBLIC_ variable', () => {
  scan(/NEXT_PUBLIC_[A-Z_]*STRIPE/, 'a NEXT_PUBLIC_ Stripe variable')
})

test('the Stripe SDK never reaches a client component', () => {
  const offenders: string[] = []
  for (const file of FILES) {
    const source = fs.readFileSync(file, 'utf8')
    if (!/^\s*['"]use client['"]/m.test(source)) continue
    if (/from\s+['"]stripe['"]/.test(source)) offenders.push(path.relative(ROOT, file))
  }
  assert.deepEqual(offenders, [], `'use client' files importing the Stripe SDK: ${offenders.join(', ')}`)
})

test('the SDK is imported only from the billing boundary', () => {
  const allowed = new Set([
    'lib/billing/stripeClient.ts',
    'lib/billing/subscriptionState.ts',
    'lib/billing/webhookEvents.ts',
    'lib/billing/apply.ts',
    'lib/billing/customer.ts',
  ])

  const importers = FILES.filter((file) =>
    /from\s+['"]stripe['"]/.test(fs.readFileSync(file, 'utf8')),
  ).map((file) => path.relative(ROOT, file).split(path.sep).join('/'))

  for (const importer of importers) {
    assert.ok(allowed.has(importer), `${importer} imports the Stripe SDK outside lib/billing`)
  }
})

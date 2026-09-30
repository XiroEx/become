// Run with: npm run test:file tests/unit/entitlements/enforcementSwitch.test.ts
//
// ENTITLEMENTS_ENFORCED is the launch-day safety net: off (the default) means
// zero user-visible gating while allowance usage still accrues, so the real
// distribution is known before the flip. Two things about HOW it is read are
// load-bearing:
//
//   1. It is read inside the function, never memoised at module scope, so a
//      test (or a container restart) can flip it.
//   2. It comes straight off process.env, NOT through lib/runtimeConfig.ts —
//      that module ignores process.env entirely when NODE_ENV === 'production'
//      (which `next start` sets), so routing this through it would make the
//      switch permanently read as unset in production.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { entitlementsEnforced } from '../../../lib/entitlements'

const ROOT = path.join(__dirname, '../../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

function withEnv(value: string | undefined, fn: () => void) {
  const prev = process.env.ENTITLEMENTS_ENFORCED
  if (value === undefined) delete process.env.ENTITLEMENTS_ENFORCED
  else process.env.ENTITLEMENTS_ENFORCED = value
  try {
    fn()
  } finally {
    if (prev === undefined) delete process.env.ENTITLEMENTS_ENFORCED
    else process.env.ENTITLEMENTS_ENFORCED = prev
  }
}

test('the switch defaults OFF and only explicit truthy values turn it on', () => {
  for (const off of [undefined, '', '  ', 'false', 'FALSE ', '0', 'off', 'no', 'maybe']) {
    withEnv(off, () =>
      assert.equal(entitlementsEnforced(), false, `${JSON.stringify(off)} must read as OFF`),
    )
  }
  for (const on of ['1', 'true', 'TRUE', ' true ', 'yes', 'on', 'ON']) {
    withEnv(on, () =>
      assert.equal(entitlementsEnforced(), true, `${JSON.stringify(on)} must read as ON`),
    )
  }
})

test('the switch is re-read on every call, not captured at import time', () => {
  withEnv('true', () => assert.equal(entitlementsEnforced(), true))
  withEnv('false', () => assert.equal(entitlementsEnforced(), false))
  withEnv('true', () => assert.equal(entitlementsEnforced(), true))

  // Source-level guard for the same property: the read must sit inside the
  // function body, never on a module-scope const that freezes at import.
  const src = readSource('lib/entitlements.ts')
  assert.doesNotMatch(src, /^(const|let|var)\s+\w+\s*=.*ENTITLEMENTS_ENFORCED/m)
  assert.match(src, /export function entitlementsEnforced\(\)[\s\S]{0,200}ENTITLEMENTS_ENFORCED/)
})

test('the switch never goes through redsecrets/runtimeConfig', () => {
  assert.doesNotMatch(readSource('lib/runtimeConfig.ts'), /ENTITLEMENTS_ENFORCED/)
})

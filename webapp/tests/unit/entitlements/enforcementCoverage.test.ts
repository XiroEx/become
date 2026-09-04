// Run with: npx tsx --test tests/unit/entitlements/enforcementCoverage.test.ts
//
// AN ADVERTISED FEATURE MUST BE AN ENFORCED FEATURE.
//
// GET /api/me/entitlements walks FEATURES and reports, per feature, whether
// this member may use it. Every one of those answers is a promise. A feature
// that appears in FEATURE_MIN_TIER and FREE_LIMITS but that no route ever
// passes to a guard is a promise nothing keeps, and it is wrong in BOTH
// directions at once.
//
// 'share-programs' was exactly that. It lived in lib/entitlements.ts,
// lib/allowances.ts and lib/entitlementsClient.ts and appeared in no guard
// call anywhere in the app. POST /api/programs/[programId]/share was — and
// still is — gated solely by requireTrainerOrAdmin. So:
//
//   • a Plus member read `share-programs: { allowed: true }` and was refused
//     by the role check;
//   • a free-tier TRAINER read `{ allowed: false }` and shared successfully.
//
// Both reproduced on production. It was removed rather than wired up, because
// sharing is a ROLE capability: it writes `sharedWith`, the grant that plants
// a program in another member's library, and that is staff-only by design.
// Enforcing the entitlement on the route would have left the Plus-member half
// of the mismatch standing; dropping the role check to make the advertisement
// true would have widened who can write the grant.
//
// This test is the guard against the next one. Adding a feature to the tier
// model now fails the build until a route gates on it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { FEATURES, FREE_LIMITS, FEATURE_MIN_TIER, type Feature } from '../../../lib/entitlements'
import { FEATURE_LABELS } from '../../../lib/entitlementsClient'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** The files that DEFINE the model rather than consume it — naming a feature
 *  there is not enforcement. */
const DEFINITIONS = new Set([
  'lib/entitlements.ts',
  'lib/entitlementsClient.ts',
  'lib/entitlementGuards.ts',
  'lib/allowances.ts',
  'lib/allowanceTicket.ts',
  'lib/ai/allowance.ts',
])

/** Anything that answers "may this member use it" and returns a 403 from it. */
const GUARDS = [
  'requireQuota',
  'requireQuotaForUser',
  'requireFeature',
  'peekQuota',
  'requireAiAllowance',
  'requireAiFeature',
]

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const rel = (full: string) => path.relative(ROOT, full).split(path.sep).join('/')

const SOURCES = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]
  .filter((f) => !DEFINITIONS.has(rel(f)))
  .map((f) => ({ name: rel(f), src: fs.readFileSync(f, 'utf8') }))

/**
 * A guard called with this feature as an argument. The `[\s\S]{0,160}?` span
 * covers the multi-line call shapes in use (`requireAiAllowance(gate.user,\n
 * 'ai-food-estimate', {`), and is non-greedy so it cannot run past the call.
 */
function gatedBy(feature: Feature): string[] {
  const re = new RegExp(
    `(?:${GUARDS.join('|')})\\s*\\([\\s\\S]{0,160}?['"]${feature}['"]`,
  )
  return SOURCES.filter((f) => re.test(f.src)).map((f) => f.name)
}

/**
 * Features gated INDIRECTLY (the feature name reaches the guard through a
 * lookup, not as a literal at the call site). Each needs the file that holds
 * the mapping named here, with a reason — the point is that it is a decision
 * someone made on the record, not an oversight.
 */
const INDIRECT: Partial<Record<Feature, string>> = {}

test('every advertised feature is gated by at least one route', () => {
  const orphans: string[] = []
  for (const feature of FEATURES) {
    if (INDIRECT[feature]) continue
    if (gatedBy(feature).length === 0) orphans.push(feature)
  }
  assert.deepEqual(
    orphans,
    [],
    `these features are advertised by GET /api/me/entitlements and enforced by nothing:\n  ${orphans.join('\n  ')}\n` +
      'Gate them on the route that spends, or remove them from FEATURE_MIN_TIER/FREE_LIMITS.',
  )
})

test('the indirect allowlist stays honest', () => {
  for (const [feature, reason] of Object.entries(INDIRECT)) {
    assert.ok(FEATURES.includes(feature as Feature), `${feature} is allowlisted but is not a feature`)
    assert.ok(reason.length > 30, `${feature} needs a real reason, not a label`)
  }
})

// ─── share-programs is gone from the whole surface ───────────────────────────

test("'share-programs' is not advertised anywhere", () => {
  assert.ok(!FEATURES.includes('share-programs' as Feature))
  assert.ok(!('share-programs' in FREE_LIMITS))
  assert.ok(!('share-programs' in FEATURE_MIN_TIER))
  assert.ok(!('share-programs' in FEATURE_LABELS))
  // And the detector agrees: nothing in app/ or lib/ gates on it. This is also
  // the detector's own self-test — if this ever returned a hit, the coverage
  // check above would be passing on prose rather than on a guard call.
  assert.deepEqual(gatedBy('share-programs' as Feature), [])
  for (const file of ['lib/entitlements.ts', 'lib/entitlementsClient.ts', 'lib/allowances.ts']) {
    const src = read(file)
    // Prose explaining why it was removed is fine; a live entry is not.
    assert.doesNotMatch(
      src,
      /'share-programs':/,
      `${file} still declares a share-programs entry`,
    )
  }
})

test('sharing stays role-gated, and says so', () => {
  const src = read('app/api/programs/[programId]/share/route.ts')
  // Every handler on the route confirms the role against the database.
  assert.equal((src.match(/requireTrainerOrAdmin\(request\)/g) ?? []).length, 3)
  for (const method of ['GET', 'POST', 'DELETE']) {
    const at = src.indexOf(`export async function ${method}(`)
    assert.ok(at > 0, `${method} handler missing`)
    const head = src.slice(at, at + 400)
    assert.match(head, /requireTrainerOrAdmin/, `${method} must confirm the role`)
  }
  assert.match(src, /ROLE-GATED, NOT TIER-GATED/)
})

// ─── the copy maps track FEATURES exactly ────────────────────────────────────

test('client copy covers every feature and nothing else', () => {
  assert.deepEqual(Object.keys(FEATURE_LABELS).sort(), [...FEATURES].sort())
  assert.deepEqual(Object.keys(FREE_LIMITS).sort(), [...FEATURES].sort())
})

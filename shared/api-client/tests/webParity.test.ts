// Run with: npx tsx --test tests/webParity.test.ts
//
// The webapp does not import this package — it is zod-free and depends on
// nothing in shared/ — so the two trees carry the same refusal contract twice.
// That is fine as long as nothing drifts, and the only way to know is to READ
// the web files. This test does, as text, exactly as
// webapp/tests/unit/account/storeReadiness.test.tsx reads the Expo sources.
//
// A drift here is silent in both builds: a renamed reason code turns every AI
// consent refusal into an ordinary 403 (native stops asking for the permission,
// so every AI feature simply fails), and a gate parser that stopped requiring
// both fields would open the upgrade sheet on an ownership refusal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AI_CONSENT_REASON,
  SPEND_CAP_REASON,
  classifyApiResponse,
  MAX_DASHBOARD_TILES,
  MAX_SMART_POOL,
  DEFAULT_SMART_INTERVAL_MS,
  SMART_INTERVAL_OPTIONS_MS,
  SMART_ROTATING_TILE_ID,
  STAT_TILE_IDS,
  TILE_KEY_REGEX,
  TILE_KINDS,
  TILE_SIZES,
} from '../src/index';

const read = (rel: string): string => {
  const url = new URL(`../../../${rel}`, import.meta.url);
  assert.ok(fs.existsSync(url), `${rel} has moved — update this test with it`);
  return fs.readFileSync(url, 'utf8');
};

test('AI_CONSENT_REASON is the literal shared/core/src/legal sends', () => {
  const legal = read('shared/core/src/legal/index.ts');
  const match = /AI_CONSENT_REASON\s*=\s*'([^']+)'/.exec(legal);
  assert.ok(match, 'shared/core/src/legal no longer declares AI_CONSENT_REASON');
  assert.equal(AI_CONSENT_REASON, match[1]);
});

test('the gate parser still requires both `feature` and `requiresTier`, as gateFrom does', () => {
  const client = read('shared/core/src/entitlements.ts');
  const gateFrom = client.slice(client.indexOf('export function gateFrom'));
  assert.match(gateFrom, /status !== 403/);
  assert.match(gateFrom, /typeof b\.error !== 'string' \|\| !b\.error/);
  assert.match(
    gateFrom,
    /typeof b\.feature !== 'string' \|\| typeof b\.requiresTier !== 'string'/,
  );
  // And the classifier agrees on the case that matters: one field is not a gate.
  assert.equal(
    classifyApiResponse(403, { error: 'Nope.', requiresTier: 'plus' }).kind,
    'forbidden',
  );
});

test('the plans route still builds its body from the web constants', () => {
  // GET /api/billing/plans exists so a price change never needs a store
  // release. That only holds while the payload is READ from the same constants
  // the web plan page renders: an amount typed into the builder is a second
  // source of truth, and the device would be the last to hear it changed.
  const plans = read('webapp/lib/billing/plans.ts');
  for (const constant of ['PLAN_PRICING', 'FREE_LIMITS', 'FEATURE_LABELS', 'FREE_FOREVER', 'renewalLine']) {
    assert.match(plans, new RegExp(`\\b${constant}\\b`), `the payload no longer reads ${constant}`);
  }
  // Comments stripped: prose about a price is not a price.
  const code = plans.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  assert.doesNotMatch(code, /\$\s?\d/, 'an amount is typed into the plans payload');
});

test('a spend ceiling is still a 429 carrying `rate_limit`, so it can never be an upsell', () => {
  const allowance = read('webapp/lib/ai/allowance.ts');
  const from = allowance.indexOf('export async function requireSpendCap');
  assert.ok(from > -1, 'webapp/lib/ai/allowance.ts no longer declares requireSpendCap');
  // Bounded at the next top-level declaration, so a later function's text
  // cannot satisfy — or break — the scan.
  const rest = allowance.slice(from + 1);
  const to = rest.indexOf('\nexport ');
  const refusal = to > -1 ? rest.slice(0, to) : rest;
  assert.match(refusal, new RegExp(`reason: '${SPEND_CAP_REASON}'`));
  assert.match(refusal, /status: 429/);
  assert.doesNotMatch(refusal, /requiresTier/);
});

// ---------------------------------------------------------------------------
// The dashboard tile vocabulary (NP-023)
//
// `schemas/dashboard.ts` and webapp/lib/dashboardLayout/{types,defaults}.ts
// declare the same tile kinds, sizes, rotation intervals, stat ids and limits,
// because the webapp cannot import this package (its Docker build context is
// `webapp/`). A drift is silent in both builds and lands on the member: a kind
// or size the native app does not know makes GET /api/dashboard/layout
// unparseable and blanks the home screen, and a rotation interval the schema
// rejects does the same to anyone who changed the frequency.
//
// The webapp side of this pair is webapp/tests/unit/contract/
// dashboardParity.test.ts, which imports both modules; this one reads the web
// files as TEXT, because the `shared-api-client` CI job has no webapp install.
// ---------------------------------------------------------------------------

/** The literal list inside `export const <name> = [ … ]`, as written. */
const declaredArray = (source: string, name: string): string[] => {
  const match = new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(source);
  assert.ok(match, `the web no longer declares ${name} — update this test with it`);
  return (match[1] as string)
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter((entry) => entry.length > 0);
};

/** The literal after `export const <name> = `, as written. */
const declaredValue = (source: string, name: string): string => {
  const match = new RegExp(`${name}\\s*=\\s*([^\\s;]+)`).exec(source);
  assert.ok(match, `the web no longer declares ${name} — update this test with it`);
  return (match[1] as string).replace(/^['"]|['"]$/g, '');
};

test('dashboard tile kinds and sizes match webapp/lib/dashboardLayout/types.ts', () => {
  const types = read('webapp/lib/dashboardLayout/types.ts');

  assert.deepEqual(
    declaredArray(types, 'TILE_KINDS'),
    [...TILE_KINDS],
    'tile kinds differ between webapp/lib/dashboardLayout/types.ts and the shared schema',
  );
  assert.deepEqual(
    declaredArray(types, 'TILE_SIZES'),
    [...TILE_SIZES],
    'tile sizes differ between webapp/lib/dashboardLayout/types.ts and the shared schema',
  );
});

test('smart-tile rotation intervals match webapp/lib/dashboardLayout/types.ts', () => {
  const types = read('webapp/lib/dashboardLayout/types.ts');

  assert.deepEqual(
    declaredArray(types, 'SMART_INTERVAL_OPTIONS_MS').map(Number),
    [...SMART_INTERVAL_OPTIONS_MS],
    'interval options differ between webapp/lib/dashboardLayout/types.ts and the shared schema',
  );
  assert.equal(
    Number(declaredValue(types, 'DEFAULT_SMART_INTERVAL_MS')),
    DEFAULT_SMART_INTERVAL_MS,
    'the default rotation interval differs between the web and the shared schema',
  );
});

test('the 20-tile limit and the smart-pool cap match webapp/lib/dashboardLayout/types.ts', () => {
  const types = read('webapp/lib/dashboardLayout/types.ts');

  assert.equal(
    Number(declaredValue(types, 'MAX_DASHBOARD_TILES')),
    MAX_DASHBOARD_TILES,
    'the 20-tile limit differs between webapp/lib/dashboardLayout/types.ts and the shared schema',
  );
  assert.equal(
    Number(declaredValue(types, 'MAX_SMART_POOL')),
    MAX_SMART_POOL,
    'the smart-pool cap differs between webapp/lib/dashboardLayout/types.ts and the shared schema',
  );
});

test('the tile-key pattern and the stat tile ids match the webapp', () => {
  const types = read('webapp/lib/dashboardLayout/types.ts');
  const defaults = read('webapp/lib/dashboardLayout/defaults.ts');

  const pattern = /TILE_KEY_RE\s*=\s*(\/.+\/)\s*$/m.exec(types);
  assert.ok(pattern, 'webapp/lib/dashboardLayout/types.ts no longer declares TILE_KEY_RE');
  assert.equal(
    pattern[1],
    TILE_KEY_REGEX.toString(),
    'the tile-key pattern differs between the webapp and the shared schema',
  );

  assert.deepEqual(
    declaredArray(defaults, 'STAT_TILE_IDS'),
    [...STAT_TILE_IDS],
    'the stat tile ids differ between webapp/lib/dashboardLayout/defaults.ts and the shared schema',
  );
  assert.equal(
    declaredValue(defaults, 'SMART_ROTATING_TILE_ID'),
    SMART_ROTATING_TILE_ID,
    'the smart-rotating tile id differs between the webapp and the shared schema',
  );
});

test('the parity readers actually notice a drift', () => {
  // Without this, a regex that silently stopped matching would read as parity.
  const drifted = `
    export const TILE_KINDS = ['stat', 'metric'] as const
    export const MAX_DASHBOARD_TILES = 25
  `;
  assert.throws(
    () => assert.deepEqual(declaredArray(drifted, 'TILE_KINDS'), [...TILE_KINDS]),
    /AssertionError/,
  );
  assert.throws(
    () =>
      assert.equal(
        Number(declaredValue(drifted, 'MAX_DASHBOARD_TILES')),
        MAX_DASHBOARD_TILES,
      ),
    /AssertionError/,
  );
  assert.throws(() => declaredArray(drifted, 'TILE_SIZES'), /no longer declares TILE_SIZES/);
});

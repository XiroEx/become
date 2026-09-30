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
  TILE_KINDS,
  TILE_SIZES,
  SMART_INTERVAL_OPTIONS_MS,
  MAX_DASHBOARD_TILES,
} from '../src/index';

const read = (rel: string): string => {
  const url = new URL(`../../../${rel}`, import.meta.url);
  assert.ok(fs.existsSync(url), `${rel} has moved — update this test with it`);
  return fs.readFileSync(url, 'utf8');
};

test('AI_CONSENT_REASON is the literal webapp/lib/legal sends', () => {
  const legal = read('webapp/lib/legal/index.ts');
  const match = /AI_CONSENT_REASON\s*=\s*'([^']+)'/.exec(legal);
  assert.ok(match, 'webapp/lib/legal no longer declares AI_CONSENT_REASON');
  assert.equal(AI_CONSENT_REASON, match[1]);
});

test('the gate parser still requires both `feature` and `requiresTier`, as gateFrom does', () => {
  const client = read('webapp/lib/entitlementsClient.ts');
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

test('webapp/lib/dashboardLayout/types.ts constants match shared/api-client', () => {
  const typesSource = read('webapp/lib/dashboardLayout/types.ts');

  // Tile kinds: ['stat', 'metric', 'smart-rotating']
  const kindsMatch = /TILE_KINDS\s*=\s*\[([^\]]+)\]/.exec(typesSource);
  assert.ok(kindsMatch && kindsMatch[1], 'types.ts no longer declares TILE_KINDS');
  const webKinds = kindsMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, ''));
  assert.deepEqual(webKinds, [...TILE_KINDS], 'tile kinds differ between types.ts and shared schema');

  // Tile sizes: ['1x1', '2x1']
  const sizesMatch = /TILE_SIZES\s*=\s*\[([^\]]+)\]/.exec(typesSource);
  assert.ok(sizesMatch && sizesMatch[1], 'types.ts no longer declares TILE_SIZES');
  const webSizes = sizesMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, ''));
  assert.deepEqual(webSizes, [...TILE_SIZES], 'tile sizes differ between types.ts and shared schema');

  // Smart interval options: [4000, 6000, 10000, 30000]
  const intervalsMatch = /SMART_INTERVAL_OPTIONS_MS\s*=\s*\[([^\]]+)\]/.exec(typesSource);
  assert.ok(intervalsMatch && intervalsMatch[1], 'types.ts no longer declares SMART_INTERVAL_OPTIONS_MS');
  const webIntervals = intervalsMatch[1].split(',').map((s) => Number(s.trim()));
  assert.deepEqual(webIntervals, [...SMART_INTERVAL_OPTIONS_MS], 'interval options differ between types.ts and shared schema');

  // Max dashboard tiles: 20
  const maxMatch = /MAX_DASHBOARD_TILES\s*=\s*(\d+)/.exec(typesSource);
  assert.ok(maxMatch && maxMatch[1], 'types.ts no longer declares MAX_DASHBOARD_TILES');
  assert.equal(Number(maxMatch[1]), MAX_DASHBOARD_TILES, '20-tile limit differs between types.ts and shared schema');
});


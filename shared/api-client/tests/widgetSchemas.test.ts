// Run with: npx tsx --test tests/widgetSchemas.test.ts
//
// ─── The two widget contracts, from the sending side ─────────────────────────
//
// A widget surface is the one client that cannot recover from a surprise: it has
// no screen to show an error on, no member watching it happen and no retry until
// the OS feels like one. So both of its schemas are checked here from the outside:
//
//   • the FEED must stay permissive — a server that adds a field may not blank a
//     home-screen tile — while still refusing a body that is not a feed;
//   • the TOKEN must be strict about exactly one thing, its scope. A token with
//     any other scope is not a read-only widgets credential, and storing one
//     where a widget reads it is the mistake the scoped token exists to prevent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BecomeWidgetSchema,
  WidgetFeedSchema,
  WidgetTokenResponseSchema,
} from '../src/index';

const REPO = path.resolve(import.meta.dirname, '..', '..', '..');

const TOKEN_RESPONSE = {
  token: 'widgets.jwt.value',
  scope: 'widgets',
  expiresIn: 15552000,
  expiresAt: '2027-03-28T00:00:00.000Z',
  refreshAfterSeconds: 900,
};

const WIDGET_ROW = {
  key: 'streak',
  title: 'Streak',
  headline: '12',
  headlineUnit: 'days',
  caption: '2 days to 14',
  state: 'done',
  progress: 0.857,
  rings: [],
  deepLink: '/dashboard/streaks',
};

test('WidgetTokenResponseSchema accepts what POST /api/widgets/token returns', () => {
  const parsed = WidgetTokenResponseSchema.parse(TOKEN_RESPONSE);
  assert.equal(parsed.token, 'widgets.jwt.value');
  assert.equal(parsed.scope, 'widgets');
  assert.equal(parsed.refreshAfterSeconds, 900);
});

test('it refuses a token with any other scope', () => {
  for (const scope of ['ai-tools', 'session', '', undefined]) {
    assert.equal(
      WidgetTokenResponseSchema.safeParse({ ...TOKEN_RESPONSE, scope }).success,
      false,
      `scope ${String(scope)} must not parse as a widgets token`,
    );
  }
});

test('it refuses a response with no token in it', () => {
  assert.equal(
    WidgetTokenResponseSchema.safeParse({ scope: 'widgets' }).success,
    false,
  );
  assert.equal(
    WidgetTokenResponseSchema.safeParse({ token: '', scope: 'widgets' }).success,
    false,
  );
});

test('the meta fields are optional — only the token and the scope are load-bearing', () => {
  const parsed = WidgetTokenResponseSchema.parse({
    token: 'widgets.jwt.value',
    scope: 'widgets',
  });
  assert.equal(parsed.expiresIn, undefined);
  assert.equal(parsed.refreshAfterSeconds, undefined);
});

test('the route really does answer with that shape', () => {
  // Read the server's own source: a rename over there fails here rather than at
  // a member's home screen.
  const route = fs.readFileSync(
    path.join(REPO, 'webapp', 'app', 'api', 'widgets', 'token', 'route.ts'),
    'utf8',
  );
  for (const field of ['token', 'scope', 'expiresIn', 'expiresAt', 'refreshAfterSeconds']) {
    assert.match(route, new RegExp(`\\b${field}\\b`), `route no longer sends ${field}`);
  }
});

test('WidgetFeedSchema keeps a feed that carries fields this build never heard of', () => {
  const parsed = WidgetFeedSchema.parse({
    generatedAt: 1780000000000,
    todayKey: '2026-09-29',
    refreshAfterSeconds: 900,
    badgeCount: 2,
    somethingNew: true,
    widgets: [{ ...WIDGET_ROW, brandNew: 1 }],
  });
  assert.equal(parsed.widgets.length, 1);
  assert.equal(parsed.widgets[0]?.headline, '12');
});

test('a body that is not a feed does not parse as one', () => {
  assert.equal(WidgetFeedSchema.safeParse({ widgets: 'nope' }).success, false);
  assert.equal(
    BecomeWidgetSchema.safeParse({ ...WIDGET_ROW, state: 'exploded' }).success,
    false,
  );
  assert.equal(
    BecomeWidgetSchema.safeParse({ ...WIDGET_ROW, key: 'sleep' }).success,
    false,
  );
});

test('a row with no deepLink does not parse — a widget with no tap is a dead tile', () => {
  const { deepLink: _deepLink, ...noLink } = WIDGET_ROW;
  assert.equal(BecomeWidgetSchema.safeParse(noLink).success, false);
});

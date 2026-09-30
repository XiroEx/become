import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppConfigResponseSchema } from '../src/schemas/appConfig';

test('AppConfigResponseSchema parses full config', () => {
  const input = {
    ios: {
      minVersion: '1.0.0',
      latestVersion: '1.2.0',
      storeUrl: 'https://apps.apple.com/app/become',
    },
    android: {
      minVersion: '1.0.0',
      latestVersion: '1.2.0',
      storeUrl: 'https://play.google.com/store/apps/details?id=io.redbtn.become',
    },
  };

  const parsed = AppConfigResponseSchema.parse(input);
  assert.equal(parsed.ios.minVersion, '1.0.0');
  assert.equal(parsed.ios.latestVersion, '1.2.0');
  assert.equal(parsed.ios.storeUrl, 'https://apps.apple.com/app/become');
  assert.equal(parsed.android.minVersion, '1.0.0');
  assert.equal(parsed.android.latestVersion, '1.2.0');
  assert.equal(parsed.android.storeUrl, 'https://play.google.com/store/apps/details?id=io.redbtn.become');
});

test('AppConfigResponseSchema parses empty config without failing', () => {
  const parsed = AppConfigResponseSchema.parse({});
  assert.deepEqual(parsed.ios, {});
  assert.deepEqual(parsed.android, {});
});

test('AppConfigResponseSchema parses partial config', () => {
  const parsed = AppConfigResponseSchema.parse({
    ios: { minVersion: '1.0.0' },
  });
  assert.equal(parsed.ios.minVersion, '1.0.0');
  assert.equal(parsed.ios.latestVersion, undefined);
  assert.equal(parsed.ios.storeUrl, undefined);
  assert.deepEqual(parsed.android, {});
});

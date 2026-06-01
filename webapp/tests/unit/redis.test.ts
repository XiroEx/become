// Run with: npx tsx --test tests/unit/redis.test.ts
//
// Fail-soft behavior of the Redis cache helpers. We never touch a real Redis:
// every test injects a fake CacheClient (the helpers accept an injectable
// client, defaulting to the lazy singleton). This proves the contract that
// matters in production: any client trouble degrades to null/void, never a
// throw, and the JSON round-trip / key versioning is correct.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  cacheGetJson,
  cacheSetJson,
  cacheDel,
  tilesCacheKey,
  TILES_CACHE_TTL_SECONDS,
  bustTilesCache,
  type CacheClient,
} from '../../lib/redis'

/** A working in-memory fake implementing the CacheClient surface. */
class FakeRedis implements CacheClient {
  store = new Map<string, string>()
  lastSet: { key: string; value: string; ttl: number } | null = null

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  async set(key: string, value: string, _mode: 'EX', ttlSeconds: number): Promise<unknown> {
    this.store.set(key, value)
    this.lastSet = { key, value, ttl: ttlSeconds }
    return 'OK'
  }
  async del(key: string): Promise<unknown> {
    const had = this.store.delete(key)
    return had ? 1 : 0
  }
}

/** A client whose every method rejects — simulates Redis errors at any call. */
const throwingClient: CacheClient = {
  get: async () => {
    throw new Error('boom-get')
  },
  set: async () => {
    throw new Error('boom-set')
  },
  del: async () => {
    throw new Error('boom-del')
  },
}

/** A client that hangs forever — simulates an unreachable/slow Redis. */
const hangingClient: CacheClient = {
  get: () => new Promise(() => {}),
  set: () => new Promise(() => {}),
  del: () => new Promise(() => {}),
}

describe('cacheGetJson', () => {
  it('round-trips JSON written via cacheSetJson (fake client)', async () => {
    const fake = new FakeRedis()
    const value = { a: 1, b: ['x', 'y'], nested: { ok: true } }
    await cacheSetJson('k', value, 60, fake)
    assert.deepEqual(await cacheGetJson<typeof value>('k', fake), value)
  })

  it('returns null on a miss', async () => {
    const fake = new FakeRedis()
    assert.equal(await cacheGetJson('missing', fake), null)
  })

  it('returns null (no throw) when the client throws', async () => {
    assert.equal(await cacheGetJson('k', throwingClient), null)
  })

  it('returns null when no client is configured (null client)', async () => {
    assert.equal(await cacheGetJson('k', null), null)
  })

  it('returns null (no throw) for corrupt JSON', async () => {
    const fake = new FakeRedis()
    fake.store.set('bad', '{not valid json')
    assert.equal(await cacheGetJson('bad', fake), null)
  })

  it('does not hang on a hanging client — resolves null via timeout', async () => {
    // If the timeout race were broken this test would never finish.
    assert.equal(await cacheGetJson('k', hangingClient), null)
  })
})

describe('cacheSetJson', () => {
  it('writes the value with the given TTL', async () => {
    const fake = new FakeRedis()
    await cacheSetJson('key1', { hello: 'world' }, 42, fake)
    assert.equal(fake.lastSet?.key, 'key1')
    assert.equal(fake.lastSet?.ttl, 42)
    assert.deepEqual(JSON.parse(fake.lastSet!.value), { hello: 'world' })
  })

  it('swallows errors when the client throws (returns void, no throw)', async () => {
    await assert.doesNotReject(() => cacheSetJson('k', { x: 1 }, 60, throwingClient))
  })

  it('is a no-op when no client is configured', async () => {
    await assert.doesNotReject(() => cacheSetJson('k', { x: 1 }, 60, null))
  })

  it('does not hang on a hanging client', async () => {
    await assert.doesNotReject(() => cacheSetJson('k', { x: 1 }, 60, hangingClient))
  })
})

describe('cacheDel / bustTilesCache', () => {
  it('deletes a key', async () => {
    const fake = new FakeRedis()
    await cacheSetJson('k', { x: 1 }, 60, fake)
    assert.notEqual(await cacheGetJson('k', fake), null)
    await cacheDel('k', fake)
    assert.equal(await cacheGetJson('k', fake), null)
  })

  it('swallows errors on a throwing client', async () => {
    await assert.doesNotReject(() => cacheDel('k', throwingClient))
  })

  it('is a no-op with a null client', async () => {
    await assert.doesNotReject(() => cacheDel('k', null))
  })

  it('bustTilesCache never throws even with no Redis configured', async () => {
    // Default singleton path: REDIS_URL unset in the test env → no-op client.
    await assert.doesNotReject(() => bustTilesCache('user123'))
  })
})

describe('tiles cache key versioning', () => {
  it('embeds the user id under a versioned prefix', () => {
    assert.equal(tilesCacheKey('abc'), 'tiles:v1:abc')
  })

  it('produces distinct keys per user', () => {
    assert.notEqual(tilesCacheKey('a'), tilesCacheKey('b'))
  })

  it('uses a 60s TTL', () => {
    assert.equal(TILES_CACHE_TTL_SECONDS, 60)
  })
})

describe('no-op path (REDIS_URL unset)', () => {
  it('default singleton helpers resolve null/void without a real Redis', async () => {
    // The test process has no REDIS_URL, so getClient() returns null and the
    // default-arg helpers degrade to no-ops — exactly the production failsafe.
    assert.equal(await cacheGetJson('whatever'), null)
    await assert.doesNotReject(() => cacheSetJson('whatever', { a: 1 }, 60))
    await assert.doesNotReject(() => cacheDel('whatever'))
  })
})

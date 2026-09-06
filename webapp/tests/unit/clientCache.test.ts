// Run with: npm run test:file tests/unit/clientCache.test.ts
//
// Pure read/write behavior of the localStorage SWR cache helper. Node has no
// `window`/`localStorage`, so we install a minimal in-memory shim before
// importing the module (which reads `window.localStorage` lazily per call, so a
// shim installed here is picked up).
import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

/** Minimal in-memory Storage shim sufficient for the helper's getItem/setItem/removeItem. */
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(k: string): string | null {
    return this.store.has(k) ? (this.store.get(k) as string) : null
  }
  setItem(k: string, v: string): void {
    this.store.set(k, String(v))
  }
  removeItem(k: string): void {
    this.store.delete(k)
  }
  clear(): void {
    this.store.clear()
  }
  get length(): number {
    return this.store.size
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null
  }
  /** Direct accessor used by tests to plant corrupt / legacy entries. */
  raw(k: string): string | null {
    return this.getItem(k)
  }
}

// Install a window with our storage. The helper reads `window.localStorage`
// lazily per call, so installing the shim at import time is sufficient.
const memory = new MemoryStorage()
;(globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
  localStorage: memory,
}

import {
  readCache,
  writeCache,
  clearCache,
  clearAllCache,
  CACHE_VERSION,
  DEFAULT_MAX_AGE_MS,
} from '../../lib/clientCache'

const RAW_PREFIX = `become.cache.${CACHE_VERSION}.`

beforeEach(() => {
  memory.clear()
})

afterEach(() => {
  memory.clear()
})

describe('writeCache / readCache round-trip', () => {
  it('reads back exactly what was written', () => {
    const value = { a: 1, b: ['x', 'y'], nested: { ok: true } }
    writeCache('demo', value)
    assert.deepEqual(readCache<typeof value>('demo'), value)
  })

  it('namespaces keys under the versioned prefix', () => {
    writeCache('layout', [1, 2, 3])
    assert.ok(memory.raw(`${RAW_PREFIX}layout`) !== null)
    // Bare key should NOT be used.
    assert.equal(memory.raw('layout'), null)
  })

  it('stores an envelope with a timestamp and the data', () => {
    writeCache('k', { hello: 'world' })
    const stored = JSON.parse(memory.raw(`${RAW_PREFIX}k`) as string)
    assert.equal(typeof stored.t, 'number')
    assert.deepEqual(stored.data, { hello: 'world' })
  })

  it('returns null for a missing key', () => {
    assert.equal(readCache('nope'), null)
  })
})

describe('version mismatch', () => {
  it('ignores an entry stored under a different version prefix', () => {
    // Plant a valid-looking envelope under an old version namespace.
    memory.setItem(
      'become.cache.v0.legacy',
      JSON.stringify({ t: Date.now(), data: { stale: true } }),
    )
    // Current readCache looks under the v1 prefix → miss.
    assert.equal(readCache('legacy'), null)
  })
})

describe('corrupt JSON tolerance', () => {
  it('returns null (no throw) for non-JSON content', () => {
    memory.setItem(`${RAW_PREFIX}bad`, '{not valid json')
    assert.equal(readCache('bad'), null)
  })

  it('returns null for JSON that is not an envelope shape', () => {
    memory.setItem(`${RAW_PREFIX}weird`, JSON.stringify({ data: 'x' })) // missing `t`
    assert.equal(readCache('weird'), null)
    memory.setItem(`${RAW_PREFIX}weird2`, JSON.stringify(42)) // not an object
    assert.equal(readCache('weird2'), null)
  })
})

describe('max-age expiry', () => {
  it('returns the value when within max age', () => {
    memory.setItem(
      `${RAW_PREFIX}fresh`,
      JSON.stringify({ t: Date.now() - 1000, data: { ok: 1 } }),
    )
    assert.deepEqual(readCache('fresh', 5000), { ok: 1 })
  })

  it('returns null when older than max age', () => {
    memory.setItem(
      `${RAW_PREFIX}old`,
      JSON.stringify({ t: Date.now() - 10_000, data: { ok: 1 } }),
    )
    assert.equal(readCache('old', 5000), null)
  })

  it('uses a ~24h default max age', () => {
    // Just under the default → present; just over → absent.
    memory.setItem(
      `${RAW_PREFIX}d1`,
      JSON.stringify({ t: Date.now() - (DEFAULT_MAX_AGE_MS - 1000), data: 'in' }),
    )
    assert.equal(readCache('d1'), 'in')
    memory.setItem(
      `${RAW_PREFIX}d2`,
      JSON.stringify({ t: Date.now() - (DEFAULT_MAX_AGE_MS + 1000), data: 'out' }),
    )
    assert.equal(readCache('d2'), null)
  })
})

describe('clearCache', () => {
  it('removes a written entry', () => {
    writeCache('temp', { v: 1 })
    assert.deepEqual(readCache('temp'), { v: 1 })
    clearCache('temp')
    assert.equal(readCache('temp'), null)
  })
})

describe('SSR / no-storage safety', () => {
  it('write + read no-op gracefully when window is undefined', () => {
    const saved = (globalThis as unknown as { window?: unknown }).window
    // Simulate SSR.
    delete (globalThis as unknown as { window?: unknown }).window
    assert.doesNotThrow(() => writeCache('ssr', { x: 1 }))
    assert.equal(readCache('ssr'), null)
    // restore
    ;(globalThis as unknown as { window?: unknown }).window = saved
  })
})

describe('clearAllCache', () => {
  it('removes every become.cache.* entry but leaves other keys intact', () => {
    writeCache('progress', { a: 1 })
    writeCache('dashboard.tiles', { b: 2 })
    memory.setItem('token', 'keep-me')
    memory.setItem('become.cache.v0.legacy', 'old-version-entry')

    clearAllCache()

    assert.equal(readCache('progress'), null)
    assert.equal(readCache('dashboard.tiles'), null)
    assert.equal(memory.raw('become.cache.v0.legacy'), null) // cross-version wipe
    assert.equal(memory.getItem('token'), 'keep-me') // unrelated key preserved
  })

  it('is a no-op (never throws) when there is nothing cached', () => {
    assert.doesNotThrow(() => clearAllCache())
  })
})

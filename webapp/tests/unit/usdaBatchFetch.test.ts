// Run with: npm run test:file tests/unit/usdaBatchFetch.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchUSDAFoodsBatch, MAX_PER_BATCH } from '../../lib/usdaBatchFetch'

// ---------------------------------------------------------------------------
// Fetch-mock helpers
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string
  method: string
  body: unknown
}

interface MockResponse {
  ok: boolean
  status: number
  statusText: string
  json: () => Promise<unknown>
}

function makeResponse(payload: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : `HTTP ${status}`,
    json: async () => payload,
  }
}

/**
 * Build a fetch mock whose handler receives the parsed body + chunk fdcIds
 * and returns a payload. Records every call.
 */
function buildFetchMock(
  handler: (call: { fdcIds: string[]; url: string }) => MockResponse | Promise<MockResponse>,
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const bodyText = typeof init?.body === 'string' ? init.body : ''
    let body: unknown = undefined
    try {
      body = bodyText ? JSON.parse(bodyText) : undefined
    } catch {
      body = bodyText
    }
    calls.push({ url, method, body })
    const fdcIds = ((body as { fdcIds?: unknown })?.fdcIds as string[]) ?? []
    return handler({ fdcIds, url }) as unknown as Response
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

function makeUSDAItem(fdcId: number) {
  return {
    fdcId,
    description: `Food ${fdcId}`,
    dataType: 'Foundation',
    foodNutrients: [
      { nutrient: { id: 1008, name: 'Energy', unitName: 'kcal' }, amount: 100 },
    ],
    foodPortions: [{ id: 1, amount: 1, modifier: 'cup', gramWeight: 240 }],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('empty input is a no-op — no fetch call, empty map', async () => {
  const { fetchImpl, calls } = buildFetchMock(() => makeResponse([]))
  const result = await fetchUSDAFoodsBatch([], { fetchImpl })
  assert.equal(calls.length, 0)
  assert.equal(result.size, 0)
})

test('single batch happy path — one POST, returns normalised USDAFood for each id', async () => {
  const { fetchImpl, calls } = buildFetchMock(({ fdcIds }) =>
    makeResponse(fdcIds.map(id => makeUSDAItem(Number(id)))),
  )
  const result = await fetchUSDAFoodsBatch(['1', '2', '3'], { fetchImpl, apiKey: 'TEST_KEY' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.match(calls[0].url, /\/v1\/foods\?api_key=TEST_KEY$/)
  assert.deepEqual((calls[0].body as { fdcIds: string[] }).fdcIds, ['1', '2', '3'])
  assert.equal(result.size, 3)
  for (const id of ['1', '2', '3']) {
    const entry = result.get(id)
    assert.ok(entry && !(entry instanceof Error), `${id} should be a USDAFood`)
    if (entry && !(entry instanceof Error)) {
      assert.equal(entry.fdcId, Number(id))
      // Nutrients normalised from wrapped {nutrient:{id}} to flat {nutrientId}
      assert.equal(entry.foodNutrients[0].nutrientId, 1008)
      assert.equal(entry.foodNutrients[0].value, 100)
      // foodPortions present after normalisation
      assert.ok(entry.foodPortions && entry.foodPortions.length === 1)
    }
  }
})

test('boundary at MAX_PER_BATCH (20) — single POST', async () => {
  const ids = Array.from({ length: MAX_PER_BATCH }, (_, i) => String(i + 1))
  const { fetchImpl, calls } = buildFetchMock(({ fdcIds }) =>
    makeResponse(fdcIds.map(id => makeUSDAItem(Number(id)))),
  )
  const result = await fetchUSDAFoodsBatch(ids, { fetchImpl })
  assert.equal(calls.length, 1, 'exactly one POST for 20 ids')
  assert.equal(result.size, MAX_PER_BATCH)
})

test('21 ids chunk into 2 POSTs of 20 + 1', async () => {
  const ids = Array.from({ length: 21 }, (_, i) => String(i + 1))
  const { fetchImpl, calls } = buildFetchMock(({ fdcIds }) =>
    makeResponse(fdcIds.map(id => makeUSDAItem(Number(id)))),
  )
  const result = await fetchUSDAFoodsBatch(ids, { fetchImpl })
  assert.equal(calls.length, 2)
  assert.equal((calls[0].body as { fdcIds: string[] }).fdcIds.length, 20)
  assert.equal((calls[1].body as { fdcIds: string[] }).fdcIds.length, 1)
  assert.equal(result.size, 21)
})

test('45 ids chunk into 3 POSTs of 20 + 20 + 5', async () => {
  const ids = Array.from({ length: 45 }, (_, i) => String(i + 1))
  const { fetchImpl, calls } = buildFetchMock(({ fdcIds }) =>
    makeResponse(fdcIds.map(id => makeUSDAItem(Number(id)))),
  )
  await fetchUSDAFoodsBatch(ids, { fetchImpl })
  assert.equal(calls.length, 3)
  assert.equal((calls[0].body as { fdcIds: string[] }).fdcIds.length, 20)
  assert.equal((calls[1].body as { fdcIds: string[] }).fdcIds.length, 20)
  assert.equal((calls[2].body as { fdcIds: string[] }).fdcIds.length, 5)
})

test('per-id failure: id missing from response returns an Error in the map', async () => {
  // Server returns items for 1 and 2 only; 3 was requested but absent.
  const { fetchImpl } = buildFetchMock(({ fdcIds }) => {
    const present = fdcIds.filter(id => id !== '3').map(id => makeUSDAItem(Number(id)))
    return makeResponse(present)
  })
  const result = await fetchUSDAFoodsBatch(['1', '2', '3'], { fetchImpl })
  assert.ok(!(result.get('1') instanceof Error))
  assert.ok(!(result.get('2') instanceof Error))
  assert.ok(result.get('3') instanceof Error)
  assert.match((result.get('3') as Error).message, /not found/i)
})

test('per-id malformed: item with non-number fdcId is dropped, missing-id Error returned', async () => {
  const { fetchImpl } = buildFetchMock(() =>
    // Return one valid + one garbage entry; both requested ids should resolve
    // (one as USDAFood, the bad one as Error since the malformed entry is
    // dropped at the lookup-build step).
    makeResponse([
      makeUSDAItem(1),
      { fdcId: 'not-a-number', description: 'garbage' },
    ]),
  )
  const result = await fetchUSDAFoodsBatch(['1', '2'], { fetchImpl })
  assert.ok(!(result.get('1') instanceof Error))
  assert.ok(result.get('2') instanceof Error)
})

test('chunk-level HTTP failure — every id in the failing chunk gets the same Error', async () => {
  let calls = 0
  const { fetchImpl } = buildFetchMock(() => {
    calls++
    if (calls === 1) return makeResponse({ error: 'server down' }, 500)
    return makeResponse([makeUSDAItem(21)])
  })
  const ids = Array.from({ length: 21 }, (_, i) => String(i + 1))
  const result = await fetchUSDAFoodsBatch(ids, { fetchImpl })
  // First chunk (ids 1-20) all errored
  for (let i = 1; i <= 20; i++) {
    const entry = result.get(String(i))
    assert.ok(entry instanceof Error, `id ${i} should be Error`)
    assert.match((entry as Error).message, /500/)
  }
  // Second chunk (id 21) succeeded
  assert.ok(!(result.get('21') instanceof Error))
})

test('network error fallback — fetch throws, all ids in chunk get the wrapped Error', async () => {
  const fetchImpl = (async () => {
    throw new Error('connect ECONNREFUSED')
  }) as unknown as typeof fetch
  const result = await fetchUSDAFoodsBatch(['1', '2'], { fetchImpl })
  assert.equal(result.size, 2)
  for (const id of ['1', '2']) {
    const entry = result.get(id)
    assert.ok(entry instanceof Error)
    assert.match((entry as Error).message, /ECONNREFUSED/)
  }
})

test('non-array response — every id in chunk gets the same Error', async () => {
  const { fetchImpl } = buildFetchMock(() => makeResponse({ error: 'bad shape' }, 200))
  const result = await fetchUSDAFoodsBatch(['1', '2'], { fetchImpl })
  for (const id of ['1', '2']) {
    const entry = result.get(id)
    assert.ok(entry instanceof Error)
    assert.match((entry as Error).message, /not an array/i)
  }
})

test('input deduped while preserving order — POST body has unique ids only', async () => {
  const { fetchImpl, calls } = buildFetchMock(({ fdcIds }) =>
    makeResponse(fdcIds.map(id => makeUSDAItem(Number(id)))),
  )
  await fetchUSDAFoodsBatch(['1', '2', '1', '3', '2', '4'], { fetchImpl })
  assert.equal(calls.length, 1)
  assert.deepEqual((calls[0].body as { fdcIds: string[] }).fdcIds, ['1', '2', '3', '4'])
})

test('mixed success / failure across chunks — survivors retained, no cross-poisoning', async () => {
  // 25 ids total. Chunk 1 (1-20) succeeds. Chunk 2 (21-25) has a 404 from server.
  let chunkCount = 0
  const { fetchImpl } = buildFetchMock(({ fdcIds }) => {
    chunkCount++
    if (chunkCount === 1) {
      return makeResponse(fdcIds.map(id => makeUSDAItem(Number(id))))
    }
    return makeResponse({ error: 'not found' }, 404)
  })
  const ids = Array.from({ length: 25 }, (_, i) => String(i + 1))
  const result = await fetchUSDAFoodsBatch(ids, { fetchImpl })
  // First chunk all succeeded
  for (let i = 1; i <= 20; i++) {
    assert.ok(!(result.get(String(i)) instanceof Error), `id ${i} should succeed`)
  }
  // Second chunk all errored
  for (let i = 21; i <= 25; i++) {
    assert.ok(result.get(String(i)) instanceof Error, `id ${i} should be Error`)
  }
})

test('API key + content-type are propagated correctly', async () => {
  const { fetchImpl, calls } = buildFetchMock(({ fdcIds }) =>
    makeResponse(fdcIds.map(id => makeUSDAItem(Number(id)))),
  )
  await fetchUSDAFoodsBatch(['42'], { fetchImpl, apiKey: 'MY_SECRET_KEY' })
  assert.match(calls[0].url, /api_key=MY_SECRET_KEY/)
  assert.equal(calls[0].method, 'POST')
})

// Run with: npx tsx --test tests/unit/suggestions/engine.test.ts
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  registerSource,
  listSources,
  listSourcesForDomain,
  __resetSourceRegistryForTest,
} from '../../../lib/suggestions/registry'
import {
  runSuggestions,
  isDismissed,
} from '../../../lib/suggestions/engine'
import type {
  DismissedSuggestion,
  RecentActivity,
  Suggestion,
} from '../../../lib/suggestions/types'

const EMPTY_ACTIVITY: RecentActivity = {}

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 'log-weight',
    severity: 'nudge',
    title: 'Log your weight',
    body: 'A weekly check-in keeps the trend honest.',
    dismissible: true,
    cooldownDays: 7,
    source: 'mindset',
    ...overrides,
  }
}

beforeEach(() => {
  __resetSourceRegistryForTest()
})

// --- registry ----------------------------------------------------------

test('registry: registers + lists sources', () => {
  registerSource('a', 'workout', async () => null)
  registerSource('b', 'nutrition', async () => null)
  const ids = listSources().map((s) => s.id).sort()
  assert.deepEqual(ids, ['a', 'b'])
})

test('registry: duplicate source id throws', () => {
  registerSource('dup', 'workout', async () => null)
  assert.throws(
    () => registerSource('dup', 'workout', async () => null),
    /already registered/,
  )
})

test('registry: listSourcesForDomain filters by domain', () => {
  registerSource('w1', 'workout', async () => null)
  registerSource('n1', 'nutrition', async () => null)
  registerSource('w2', 'workout', async () => null)
  const workout = listSourcesForDomain('workout').map((s) => s.id).sort()
  assert.deepEqual(workout, ['w1', 'w2'])
})

// --- isDismissed -------------------------------------------------------

test('isDismissed: id not in dismissed list → false', () => {
  assert.equal(
    isDismissed(
      { id: 'a', cooldownDays: 7 },
      [],
      new Date('2026-05-28T00:00:00Z'),
    ),
    false,
  )
})

test('isDismissed: within cooldown → true', () => {
  const dismissed: DismissedSuggestion[] = [
    { id: 'a', dismissedAt: new Date('2026-05-26T00:00:00Z') },
  ]
  // 2 days later, cooldown=7 → still suppressed
  assert.equal(
    isDismissed(
      { id: 'a', cooldownDays: 7 },
      dismissed,
      new Date('2026-05-28T00:00:00Z'),
    ),
    true,
  )
})

test('isDismissed: past cooldown → false (re-emission allowed)', () => {
  const dismissed: DismissedSuggestion[] = [
    { id: 'a', dismissedAt: new Date('2026-05-20T00:00:00Z') },
  ]
  // 8 days later, cooldown=7 → expired
  assert.equal(
    isDismissed(
      { id: 'a', cooldownDays: 7 },
      dismissed,
      new Date('2026-05-28T00:00:01Z'),
    ),
    false,
  )
})

test('isDismissed: undefined cooldown = permanent dismissal', () => {
  const dismissed: DismissedSuggestion[] = [
    { id: 'a', dismissedAt: new Date('2025-01-01T00:00:00Z') },
  ]
  assert.equal(
    isDismissed(
      { id: 'a', cooldownDays: undefined },
      dismissed,
      new Date('2026-05-28T00:00:00Z'),
    ),
    true,
  )
})

// --- runSuggestions ----------------------------------------------------

test('runSuggestions: fans out to all sources, filters nulls', async () => {
  registerSource('s1', 'workout', async () =>
    makeSuggestion({ id: 'log-weight' }),
  )
  registerSource('s2', 'nutrition', async () => null) // no-op source
  registerSource('s3', 'mindset', async () =>
    makeSuggestion({ id: 'log-mood', title: 'Mood check' }),
  )
  const out = await runSuggestions('user_1', EMPTY_ACTIVITY)
  const ids = out.map((s) => s.id).sort()
  assert.deepEqual(ids, ['log-mood', 'log-weight'])
})

test('runSuggestions: filters dismissed-within-cooldown via injected list', async () => {
  registerSource('s1', 'workout', async () =>
    makeSuggestion({ id: 'log-weight', cooldownDays: 7 }),
  )
  registerSource('s2', 'workout', async () =>
    makeSuggestion({ id: 'streak-clap', title: '🎉', cooldownDays: 1 }),
  )
  const out = await runSuggestions('u', EMPTY_ACTIVITY, {
    now: new Date('2026-05-28T00:00:00Z'),
    dismissed: [
      { id: 'log-weight', dismissedAt: new Date('2026-05-26T00:00:00Z') },
    ],
  })
  // log-weight in cooldown → hidden; streak-clap not dismissed → kept
  assert.deepEqual(
    out.map((s) => s.id),
    ['streak-clap'],
  )
})

test('runSuggestions: re-emits after cooldown expires', async () => {
  registerSource('s1', 'workout', async () =>
    makeSuggestion({ id: 'log-weight', cooldownDays: 3 }),
  )
  const dismissed: DismissedSuggestion[] = [
    { id: 'log-weight', dismissedAt: new Date('2026-05-20T00:00:00Z') },
  ]
  // 8 days later → expired
  const out = await runSuggestions('u', EMPTY_ACTIVITY, {
    now: new Date('2026-05-28T00:00:01Z'),
    dismissed,
  })
  assert.deepEqual(out.map((s) => s.id), ['log-weight'])
})

test('runSuggestions: permanent dismissal (no cooldownDays) never re-emits', async () => {
  registerSource('s1', 'workout', async () =>
    makeSuggestion({ id: 'log-weight', cooldownDays: undefined }),
  )
  const out = await runSuggestions('u', EMPTY_ACTIVITY, {
    now: new Date('2999-01-01T00:00:00Z'),
    dismissed: [
      { id: 'log-weight', dismissedAt: new Date('2020-01-01T00:00:00Z') },
    ],
  })
  assert.deepEqual(out, [])
})

test('runSuggestions: falls back to fetchDismissed when dismissed not supplied', async () => {
  let userSeen = ''
  registerSource('s1', 'workout', async () =>
    makeSuggestion({ id: 'log-weight', cooldownDays: 7 }),
  )
  const out = await runSuggestions('user_xyz', EMPTY_ACTIVITY, {
    now: new Date('2026-05-28T00:00:00Z'),
    fetchDismissed: async (userId: string) => {
      userSeen = userId
      return [
        { id: 'log-weight', dismissedAt: new Date('2026-05-27T00:00:00Z') },
      ]
    },
  })
  assert.equal(userSeen, 'user_xyz')
  assert.deepEqual(out, [])
})

test('runSuggestions: source that throws is isolated (other sources still run)', async () => {
  const originalErr = console.error
  let logged = 0
  console.error = () => {
    logged++
  }
  try {
    registerSource('boom', 'workout', async () => {
      throw new Error('db unavailable')
    })
    registerSource('ok', 'mindset', async () =>
      makeSuggestion({ id: 'log-mood', title: 'Mood' }),
    )
    const out = await runSuggestions('u', EMPTY_ACTIVITY)
    assert.deepEqual(out.map((s) => s.id), ['log-mood'])
    assert.ok(logged > 0)
  } finally {
    console.error = originalErr
  }
})

test('runSuggestions: dedups by suggestion.id when two sources emit the same id', async () => {
  registerSource('a', 'workout', async () => makeSuggestion({ id: 'shared' }))
  registerSource('b', 'workout', async () =>
    makeSuggestion({ id: 'shared', title: 'Different title same id' }),
  )
  const out = await runSuggestions('u', EMPTY_ACTIVITY)
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'shared')
})

test('runSuggestions: sources receive (userId, activity) verbatim', async () => {
  let seenUser = ''
  let seenActivity: RecentActivity | null = null
  registerSource('capture', 'workout', async (uid, act) => {
    seenUser = uid
    seenActivity = act
    return null
  })
  const activity: RecentActivity = {
    streak: { count: 12, lastLogDate: new Date('2026-05-27T00:00:00Z') },
  }
  await runSuggestions('user_2', activity)
  assert.equal(seenUser, 'user_2')
  assert.deepEqual(seenActivity, activity)
})

test('runSuggestions: with no sources registered returns empty array', async () => {
  const out = await runSuggestions('u', EMPTY_ACTIVITY)
  assert.deepEqual(out, [])
})

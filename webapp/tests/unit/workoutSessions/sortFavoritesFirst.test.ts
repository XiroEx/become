// Run with: npx tsx --test tests/unit/workoutSessions/sortFavoritesFirst.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveInArray, sortFavoritesFirst } from '../../../app/dashboard/workout/hub/HubClient'

interface FakeSession {
  sessionId?: string
  favorite?: boolean
  date: string
  title: string
}

test('moveInArray: from < to', () => {
  assert.deepEqual(moveInArray([1, 2, 3, 4], 0, 2), [2, 3, 1, 4])
})

test('moveInArray: from > to', () => {
  assert.deepEqual(moveInArray([1, 2, 3, 4], 3, 0), [4, 1, 2, 3])
})

test('moveInArray: from === to → unchanged copy', () => {
  const src = [1, 2, 3]
  const out = moveInArray(src, 1, 1)
  assert.deepEqual(out, src)
  assert.notEqual(out, src) // returns a new array
})

const S = (sessionId: string, date: string, favorite = false): FakeSession => ({
  sessionId,
  date,
  favorite,
  title: sessionId,
})

test('sortFavoritesFirst: favorites always precede non-favorites', () => {
  const sessions = [
    S('old-fav', '2026-01-01', true),
    S('newest', '2026-08-01'),
    S('mid', '2026-06-01'),
  ]
  const { favorites, others } = sortFavoritesFirst(sessions, [])
  assert.deepEqual(favorites.map((s) => s.sessionId), ['old-fav'])
  assert.deepEqual(others.map((s) => s.sessionId), ['newest', 'mid'])
})

test('sortFavoritesFirst: no favoriteOrder → favorites sort newest-first among themselves', () => {
  const sessions = [
    S('a', '2026-01-01', true),
    S('b', '2026-08-01', true),
    S('c', '2026-05-01', true),
  ]
  const { favorites } = sortFavoritesFirst(sessions, [])
  assert.deepEqual(favorites.map((s) => s.sessionId), ['b', 'c', 'a'])
})

test('sortFavoritesFirst: favoriteOrder wins over date', () => {
  const sessions = [
    S('a', '2026-01-01', true),
    S('b', '2026-08-01', true),
    S('c', '2026-05-01', true),
  ]
  const { favorites } = sortFavoritesFirst(sessions, ['a', 'b', 'c'])
  assert.deepEqual(favorites.map((s) => s.sessionId), ['a', 'b', 'c'])
})

test('sortFavoritesFirst: favorites missing from favoriteOrder fall to the end, newest-first', () => {
  const sessions = [
    S('ordered', '2026-01-01', true),
    S('unordered-new', '2026-08-01', true),
    S('unordered-old', '2026-03-01', true),
  ]
  const { favorites } = sortFavoritesFirst(sessions, ['ordered'])
  assert.deepEqual(favorites.map((s) => s.sessionId), ['ordered', 'unordered-new', 'unordered-old'])
})

test('sortFavoritesFirst: a favorite without a sessionId is treated as a non-favorite (cannot be reordered)', () => {
  const sessions: FakeSession[] = [
    { date: '2026-01-01', favorite: true, title: 'legacy' },
    S('normal', '2026-01-02'),
  ]
  const { favorites, others } = sortFavoritesFirst(sessions, [])
  assert.deepEqual(favorites, [])
  assert.equal(others.length, 2)
})

test('sortFavoritesFirst: stale favoriteOrder entries (unfavorited/deleted) are ignored', () => {
  const sessions = [S('still-here', '2026-01-01', true)]
  const { favorites } = sortFavoritesFirst(sessions, ['ghost', 'still-here'])
  assert.deepEqual(favorites.map((s) => s.sessionId), ['still-here'])
})

test('sortFavoritesFirst: empty input → empty groups', () => {
  const { favorites, others } = sortFavoritesFirst([], [])
  assert.deepEqual(favorites, [])
  assert.deepEqual(others, [])
})

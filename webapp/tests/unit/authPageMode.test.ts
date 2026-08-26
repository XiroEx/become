import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getAuthPageCopy } from '../../lib/authPageMode'

test('no query params -> login mode, toggle points at ?register', () => {
  const copy = getAuthPageCopy(new URLSearchParams(''))
  assert.equal(copy.mode, 'login')
  assert.equal(copy.heading, 'Sign in')
  assert.equal(copy.toggleHref, '/login?register')
})

test('?register present -> register mode with registration copy, toggle points back at plain /login', () => {
  const copy = getAuthPageCopy(new URLSearchParams('register'))
  assert.equal(copy.mode, 'register')
  assert.equal(copy.heading, 'Create account')
  assert.match(copy.subtext, /account/i)
  assert.equal(copy.toggleHref, '/login')
})

test('?register=anything still counts as register mode (presence, not value)', () => {
  const copy = getAuthPageCopy(new URLSearchParams('register=1'))
  assert.equal(copy.mode, 'register')
})

test('next param carries through the toggle link in both directions', () => {
  const next = '/share/mind/abc123'
  const fromLogin = getAuthPageCopy(new URLSearchParams(`next=${encodeURIComponent(next)}`))
  assert.equal(fromLogin.toggleHref, `/login?register&next=${encodeURIComponent(next)}`)

  const fromRegister = getAuthPageCopy(new URLSearchParams(`register&next=${encodeURIComponent(next)}`))
  assert.equal(fromRegister.toggleHref, `/login?next=${encodeURIComponent(next)}`)
})

test('no next param -> toggle links carry no next query at all', () => {
  const copy = getAuthPageCopy(new URLSearchParams('register'))
  assert.doesNotMatch(copy.toggleHref, /next=/)
})

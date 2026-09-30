// Run with: npm run test:file tests/unit/authPageMode.test.ts
//
// "Clicking Sign in next to 'Already have an account?' does nothing."
//
// It did nothing because sign-in and sign-up were the SAME route told apart by
// a `?register` query param, so the toggle was a link from /login?register to
// /login. The App Router treats a query-only change on the page it is already
// rendering as nothing to do: the address bar never moved and the form never
// re-rendered. Nothing about the link looked wrong — it pointed exactly where
// it meant to.
//
// So the invariant this file pins is not "the href is this string", it is
// "the toggle leaves the page it is drawn on". A future refactor that puts both
// views back behind one pathname fails here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUTH_PATH, authHref, firstQueryValue, getAuthPageCopy } from '../../lib/authPageMode'

const pathnameOf = (href: string) => new URL(href, 'https://become.redbtn.io').pathname

test('login mode offers sign-up, register mode offers sign-in', () => {
  const login = getAuthPageCopy('login')
  assert.equal(login.heading, 'Sign in')
  assert.equal(login.toggleLabel, 'Create one')
  assert.equal(login.toggleHref, '/register')

  const register = getAuthPageCopy('register')
  assert.equal(register.heading, 'Create account')
  assert.match(register.subtext, /account/i)
  assert.equal(register.toggleQuestion, 'Already have an account?')
  assert.equal(register.toggleLabel, 'Sign in')
  assert.equal(register.toggleHref, '/login')
})

test('THE BUG: the toggle always changes the pathname, never only the query', () => {
  for (const next of [undefined, '/share/mind/abc123']) {
    for (const mode of ['login', 'register'] as const) {
      const copy = getAuthPageCopy(mode, next)
      const from = AUTH_PATH[mode]
      const to = pathnameOf(copy.toggleHref)
      assert.notEqual(
        to,
        from,
        `the ${mode} toggle points back at ${from} — a same-route link the router will ignore`,
      )
      assert.equal(to, AUTH_PATH[mode === 'login' ? 'register' : 'login'])
    }
  }
})

test('next carries through the toggle in both directions, encoded once', () => {
  const next = '/share/mind/abc123'
  assert.equal(getAuthPageCopy('login', next).toggleHref, `/register?next=${encodeURIComponent(next)}`)
  assert.equal(getAuthPageCopy('register', next).toggleHref, `/login?next=${encodeURIComponent(next)}`)
})

test('no next -> no query at all, so the toggle stays a bare pathname', () => {
  assert.equal(authHref('register'), '/register')
  assert.equal(authHref('login', null), '/login')
  assert.doesNotMatch(getAuthPageCopy('register').toggleHref, /\?/)
})

test('a repeated ?next= collapses to the first value rather than "a,b"', () => {
  assert.equal(firstQueryValue(['/one', '/two']), '/one')
  assert.equal(firstQueryValue('/one'), '/one')
  assert.equal(firstQueryValue(undefined), undefined)
})

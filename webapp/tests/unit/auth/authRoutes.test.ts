// Run with: npm run test:file tests/unit/auth/authRoutes.test.ts
//
// The two halves of "clicking Sign in does nothing, and stop asking for a name
// on the sign-up screen", pinned where a unit test can reach them:
//
//  1. Sign-in and sign-up are two ROUTES. The dead toggle was a link between
//     two query-param variants of one route, which the App Router ignores, so
//     the guard here is that nothing in the app links at the old shape and that
//     /login?register still redirects for every link outside this repo.
//  2. Sign-up takes an email and nothing else. send-link used to refuse a
//     register with no name (400 "Name is required for registration"), so a
//     client that stopped sending one could not create an account at all.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** Drop comments: this file's own prose quotes the retired URL on purpose. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const rel = path.join(dir, entry)
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel))
    else if (/\.tsx?$/.test(entry)) out.push(rel)
  }
  return out
}

// ─── 1. The toggle ───────────────────────────────────────────────────────────

test('sign-up has its own route, and sign-in does not render it', () => {
  const register = read('app/register/page.tsx')
  assert.match(register, /mode="register"/, '/register no longer renders the sign-up view')
  assert.doesNotMatch(code(register), /redirect\(/, '/register is a redirect again — that is the bug')

  const login = read('app/login/page.tsx')
  assert.match(login, /mode="login"/, '/login no longer renders the sign-in view')
})

test('/login?register still works — every link outside this repo uses it', () => {
  const login = code(read('app/login/page.tsx'))
  assert.match(login, /register !== undefined/, '/login?register is no longer recognised')
  assert.match(login, /redirect\(authHref\('register'/, '/login?register does not land on /register')
})

test('nothing in the app links at /login?register any more', () => {
  const offenders = [...sourceFiles('app'), ...sourceFiles('components')]
    .filter((rel) => rel !== path.join('app', 'login', 'page.tsx'))
    .filter((rel) => /['"`]\/login\?register/.test(code(read(rel))))

  assert.deepEqual(
    offenders,
    [],
    'these link at the query-param sign-up URL; the toggle out of it is a no-op — link /register',
  )
})

// ─── 2. The name ─────────────────────────────────────────────────────────────

test('the sign-up form asks for an email and nothing else', () => {
  const form = code(read('components/AuthForm.tsx'))
  assert.doesNotMatch(form, /placeholder="Full name"/, 'the sign-up form still has a name box')
  assert.doesNotMatch(form, /\bsetName\b/, 'the form still carries name state')
  assert.match(form, /body: JSON\.stringify\(\{ email, mode,/, 'the form still posts a name')
  // The tick is untouched — it is the record that anyone agreed to anything.
  assert.match(form, /data-testid="consent-checkbox"/)
})

test('send-link has no name requirement left to refuse a sign-up with', () => {
  const route = code(read('app/api/auth/send-link/route.ts'))
  assert.doesNotMatch(route, /Name is required/, 'send-link still refuses a register without a name')
  assert.doesNotMatch(route, /\bconst \{ email, name\b/, 'send-link still reads a name off the body')
  // Consent is still mandatory: this change must not have widened that door.
  assert.match(route, /consent !== true/)
})

test('a link minted before this change still lands the name its owner typed', () => {
  // MagicLinks live 15 minutes, so a handful are always in flight across a
  // deploy. Nothing writes `name` any more; verify-link must still read it.
  assert.match(read('models/MagicLink.ts'), /name:\s*\{\s*type:\s*String/, 'MagicLink dropped the name path')
  assert.match(code(read('app/api/auth/verify-link/route.ts')), /name \|\| fallbackNameFromEmail\(email\)/)
})

test('onboarding is where the name is collected now, and it will not skip past it', () => {
  const onboarding = read('app/onboarding/page.tsx')
  assert.match(onboarding, /data-testid="onboarding-name"/, 'onboarding has no name field')
  assert.match(onboarding, /step === 2 && !name\.trim\(\)/, 'onboarding advances past the name step empty')
  assert.match(onboarding, /name: name\.trim\(\)/, 'onboarding never saves the name it collected')
  // PATCH /api/profile is what it saves through, so that route has to accept it.
  assert.match(read('app/api/profile/route.ts'), /update\['name'\] = body\.name/)
})

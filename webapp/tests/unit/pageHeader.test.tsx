// Run with: npm run test:file tests/unit/pageHeader.test.tsx
//
// Every /dashboard page opens with one line: the page title on the left at
// today's h1 size, the avatar button with its dropdown on the right. This
// pins both halves: the title renders in an h1, and the user menu button
// (with the aria-label ProfileMenu owns) renders beside it.
//
// ProfileMenu calls next/navigation's useRouter, which throws outside an App
// Router context — so the render half runs under Next's own AppRouterContext
// with a stub router (effects never run under renderToStaticMarkup, and the
// dropdown starts closed, so the stub is never called). If the context module
// can't be resolved, the file falls back to source-scan assertions on the
// same wiring rather than failing on an import path.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PageHeader from '../../components/PageHeader'

const require = createRequire(import.meta.url)

function loadAppRouterContext(): React.Context<unknown> | null {
  for (const subpath of [
    'next/dist/shared/lib/app-router-context.shared-runtime',
    'next/dist/shared/lib/app-router-context',
  ]) {
    try {
      const mod = require(subpath)
      if (mod?.AppRouterContext) return mod.AppRouterContext as React.Context<unknown>
    } catch {
      // Try the next subpath.
    }
  }
  return null
}

const AppRouterContext = loadAppRouterContext()
const here = dirname(fileURLToPath(import.meta.url))
const pageHeaderSrc = readFileSync(join(here, '../../components/PageHeader.tsx'), 'utf8')
const profileMenuSrc = readFileSync(join(here, '../../components/ProfileMenu.tsx'), 'utf8')

test('PageHeader renders the title in an h1 with the user menu button beside it', async (t) => {
  if (!AppRouterContext) {
    t.skip('AppRouterContext not resolvable — covered by the source-scan test below')
    return
  }
  const html = renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: {} },
      React.createElement(PageHeader, { title: 'Workout', subtitle: 'Pick a path' }),
    ),
  )
  assert.match(html, /<h1[^>]*>Workout<\/h1>/)
  assert.match(html, /Pick a path/)
  assert.match(html, /aria-label="User menu"/)
  // H1 size is today's dashboard size.
  assert.match(html, /text-2xl font-bold/)
})

test('PageHeader wiring holds even without an App Router context', () => {
  // The title lands in the h1, the menu hangs off the same line, and the
  // wrapper keeps the chrome-tier stacking the open menu needs.
  assert.match(pageHeaderSrc, /<h1[^>]*>\s*\{title\}/)
  assert.match(pageHeaderSrc, /<ProfileMenu \/>/)
  assert.match(pageHeaderSrc, /relative z-40/)
  // The menu button keeps its accessible name and test hooks.
  assert.match(profileMenuSrc, /aria-label=\{[^}]*'User menu'/)
  assert.match(profileMenuSrc, /data-testid="open-food-reports"/)
  assert.match(profileMenuSrc, /data-testid="reports-badge"/)
})

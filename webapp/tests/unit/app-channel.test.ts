// Run with: npx tsx --test tests/unit/app-channel.test.ts
//
// Production and beta run the same code off the same database, so the build has
// to say which one it is. Without it, an installed PWA from beta is
// indistinguishable from production on the same home screen.

import { test, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

describe('channel naming', () => {
  const CHANNEL = readFileSync(join(process.cwd(), 'lib/appChannel.ts'), 'utf8')

  it('derives the channel from NEXT_PUBLIC_APP_NAME, which is set per workspace', () => {
    assert.match(CHANNEL, /IS_BETA = \/beta\/i\.test\(process\.env\.NEXT_PUBLIC_APP_NAME/)
  })

  it('production keeps exactly the name it has today', () => {
    // Prod's NEXT_PUBLIC_APP_NAME is "BECOME" (no "beta"), so IS_BETA is false
    // and every name falls through to the production branch unchanged.
    assert.match(CHANNEL, /IS_BETA \? 'Become \(beta\)' : 'Become'/)
    assert.match(CHANNEL, /IS_BETA \? 'Become beta' : 'Become'/)
  })

  it('the short name stays inside the launcher truncation limit', () => {
    for (const name of ['Become', 'Become beta']) {
      assert.ok(name.length <= 12, `"${name}" is ${name.length} chars`)
    }
  })
})

describe('PWA manifest', () => {
  it('is served from a route so it can reflect the channel', () => {
    const route = join(process.cwd(), 'app/manifest.json/route.ts')
    assert.ok(existsSync(route), 'expected app/manifest.json/route.ts')
    const src = readFileSync(route, 'utf8')
    assert.match(src, /APP_NAME/)
    assert.match(src, /APP_SHORT_NAME/)
    assert.match(src, /application\/manifest\+json/)
  })

  it('the static file is gone — public/ would shadow the route', () => {
    assert.equal(
      existsSync(join(process.cwd(), 'public/manifest.json')),
      false,
      'public/manifest.json shadows the dynamic route and must not exist',
    )
  })

  it('stays at /manifest.json, which installed PWAs and the SW already reference', () => {
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8')
    assert.match(layout, /manifest: "\/manifest\.json"/)
    const sw = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')
    assert.match(sw, /'\/manifest\.json'/)
  })

  it('still offers every icon size the old static manifest did', () => {
    const src = readFileSync(join(process.cwd(), 'app/manifest.json/route.ts'), 'utf8')
    for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
      assert.match(src, new RegExp(`\\b${size}\\b`), `icon ${size} missing`)
    }
  })
})

describe('title and home-screen label', () => {
  const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8')

  it('come straight from the env, which already differs per channel', () => {
    // NEXT_PUBLIC_APP_NAME is "BECOME" on prod and "BECOME (beta)" on beta, so
    // the title was already correct. Routing it through the title-cased
    // APP_NAME would have restyled PRODUCTION's title to "Become" as a side
    // effect of naming the beta channel — a change nobody asked for.
    assert.match(layout, /const appName = process\.env\.NEXT_PUBLIC_APP_NAME \|\| "BECOME"/)
    assert.doesNotMatch(layout, /const appName = APP_NAME/)
    assert.match(layout, /title: appName/)
    // iOS home-screen label lives under appleWebApp.title.
    assert.match(layout, /appleWebApp:[\s\S]*?title: appName/)
  })
})

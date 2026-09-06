// Run with: npm run test:file tests/unit/swStrategy.test.ts
//
// Pins the service-worker routing decision table (lib/swStrategy.ts). public/sw.js
// mirrors this logic inline (it can't be imported here — it's browser-only plain
// JS), so these tests are the contract both must satisfy.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { chooseStrategy, type RequestInfo } from '../../lib/swStrategy'

const ORIGIN = 'https://become.redbtn.io'

function req(partial: Partial<RequestInfo> & { url: string }): RequestInfo {
  return {
    method: 'GET',
    selfOrigin: ORIGIN,
    ...partial,
  }
}

describe('chooseStrategy', () => {
  describe('navigations / HTML -> network-first', () => {
    it('mode=navigate is network-first', () => {
      assert.equal(
        chooseStrategy(req({ url: `${ORIGIN}/dashboard`, mode: 'navigate' })),
        'network-first'
      )
    })

    it('Accept: text/html is network-first', () => {
      assert.equal(
        chooseStrategy(req({ url: `${ORIGIN}/dashboard`, accept: 'text/html,application/xhtml+xml' })),
        'network-first'
      )
    })

    it('navigation wins even on the root path', () => {
      assert.equal(
        chooseStrategy(req({ url: `${ORIGIN}/`, mode: 'navigate' })),
        'network-first'
      )
    })

    it('navigation wins even when path looks like an asset', () => {
      // Defensive: a navigation to a weird path is still HTML, never cache-first.
      assert.equal(
        chooseStrategy(req({ url: `${ORIGIN}/icons/whatever`, mode: 'navigate' })),
        'network-first'
      )
    })
  })

  describe('/_next/static/** -> cache-first', () => {
    it('hashed JS chunk is cache-first', () => {
      assert.equal(
        chooseStrategy(req({ url: `${ORIGIN}/_next/static/chunks/abc123.js` })),
        'cache-first'
      )
    })

    it('hashed CSS is cache-first', () => {
      assert.equal(
        chooseStrategy(req({ url: `${ORIGIN}/_next/static/css/def456.css` })),
        'cache-first'
      )
    })
  })

  describe('static assets -> cache-first', () => {
    for (const path of [
      '/manifest.json',
      '/logo.png',
      '/profile.png',
      '/favicon.ico',
      '/icons/icon-192x192.png',
      '/fonts/geist.woff2',
      '/_next/image?url=%2Ffoo.png&w=640&q=75',
    ]) {
      it(`${path} is cache-first`, () => {
        assert.equal(chooseStrategy(req({ url: `${ORIGIN}${path}` })), 'cache-first')
      })
    }
  })

  describe('GET /api/** -> passthrough (authed per-user data is never SW-cached)', () => {
    it('GET api is passthrough', () => {
      assert.equal(
        chooseStrategy(req({ url: `${ORIGIN}/api/programs` })),
        'passthrough'
      )
    })

    it('GET api with query is passthrough', () => {
      assert.equal(
        chooseStrategy(req({ url: `${ORIGIN}/api/exercises/alternatives?slug=squat` })),
        'passthrough'
      )
    })

    it('GET /api/dashboard/tiles (authed user data) is passthrough', () => {
      assert.equal(
        chooseStrategy(req({ url: `${ORIGIN}/api/dashboard/tiles` })),
        'passthrough'
      )
    })
  })

  describe('non-GET -> passthrough (never cached)', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']) {
      it(`${method} /api is passthrough`, () => {
        assert.equal(
          chooseStrategy(req({ url: `${ORIGIN}/api/workouts`, method })),
          'passthrough'
        )
      })
    }

    it('POST to a navigation-looking request is still passthrough', () => {
      assert.equal(
        chooseStrategy(req({ url: `${ORIGIN}/dashboard`, method: 'POST', mode: 'navigate' })),
        'passthrough'
      )
    })

    it('POST to a static asset path is passthrough', () => {
      assert.equal(
        chooseStrategy(req({ url: `${ORIGIN}/_next/static/chunks/x.js`, method: 'post' })),
        'passthrough'
      )
    })
  })

  describe('cross-origin -> passthrough', () => {
    it('cross-origin GET is passthrough', () => {
      assert.equal(
        chooseStrategy(req({ url: 'https://cdn.example.com/_next/static/x.js' })),
        'passthrough'
      )
    })

    it('cross-origin HTML navigation is passthrough', () => {
      assert.equal(
        chooseStrategy(
          req({ url: 'https://other.example.com/page', mode: 'navigate' })
        ),
        'passthrough'
      )
    })

    it('cross-origin api is passthrough', () => {
      assert.equal(
        chooseStrategy(req({ url: 'https://api.other.com/api/data' })),
        'passthrough'
      )
    })
  })

  describe('fallthrough -> passthrough', () => {
    it('unknown same-origin GET path is passthrough', () => {
      assert.equal(
        chooseStrategy(req({ url: `${ORIGIN}/some/random/thing.txt` })),
        'passthrough'
      )
    })

    it('malformed url is passthrough (never throws)', () => {
      assert.equal(chooseStrategy(req({ url: 'not a url' })), 'passthrough')
    })
  })
})

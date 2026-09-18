// Run with: npm run test:file tests/unit/legal/healthData.test.tsx
//
// Washington's My Health My Data Act (RCW 19.373.020) and Nevada's consumer
// health data law both bind Become — neither has a size threshold — and both
// require a DISTINCT consumer health data privacy policy that (1) is linked
// from the home page, (2) lists the categories collected and the purposes,
// (3) lists the sources, (4) lists the categories shared, (5) lists the third
// parties and affiliates it is shared with, and (6) says how to exercise the
// rights, including the appeal path. This file asserts each of those is on the
// rendered page, and that the page never claims more than the Privacy Policy.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import HealthDataPage from '../../../app/health-data/page'
import PrivacyPage from '../../../app/privacy/page'
import { LEGAL_CONTACT_EMAIL, LEGAL_DELETION_DAYS, LEGAL_LINKS } from '../../../lib/legal'
import { HEALTH_DATA, HEALTH_DATA_RESPONSE_DAYS } from '../../../lib/legal/healthData'
import { PRIVACY } from '../../../lib/legal/privacy'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const has = (html: string, text: string) => html.includes(esc(text))

const html = renderToStaticMarkup(<HealthDataPage />)

test('it is a distinct document, linked from the home page and from the Privacy Policy', () => {
  assert.ok(LEGAL_LINKS.some((l) => l.href === '/health-data'), 'not in LEGAL_LINKS')
  const footer = /<footer className={styles\.footer}>[\s\S]*?<\/footer>/.exec(read('components/landing/BecomeLanding.tsx'))
  assert.ok(footer && footer[0].includes('href="/health-data"'), 'the home page footer does not link it')
  assert.match(renderToStaticMarkup(<PrivacyPage />), /href="\/health-data"/, 'the Privacy Policy does not link it')
  assert.match(html, /href="\/privacy"/, 'it does not link back to the Privacy Policy')
  assert.equal(HEALTH_DATA.slug, 'health-data')
})

test('it names both states and the statute it is published under', () => {
  assert.ok(has(html, 'Washington'), 'no Washington')
  assert.ok(has(html, 'Nevada'), 'no Nevada')
  assert.ok(has(html, 'My Health My Data Act'), 'does not name the Act')
})

test('it lists categories, purposes, sources and the recipients by name', () => {
  for (const id of ['what', 'sources', 'consent', 'sharing', 'rights', 'how', 'appeal']) {
    assert.ok(html.includes(`id="${id}"`), `section ${id} missing`)
  }
  // Every processor the Privacy Policy names must be in the recipient list.
  // The two documents may not disagree about who receives the data.
  const sharing = PRIVACY.sections.find((s) => s.id === 'sharing')
  assert.ok(sharing, 'privacy policy has no sharing section')
  const dl = sharing.blocks.find((b) => b.kind === 'dl')
  assert.ok(dl && dl.kind === 'dl')
  for (const item of dl.items) {
    const name = item.term.split(/[,(]/)[0].trim().replace(/ object storage.*$/, '')
    assert.ok(has(html, name), `recipient "${name}" from the Privacy Policy is not listed here`)
  }
  // And each named recipient carries a contact link, as the statute requires.
  for (const host of ['www.mongodb.com', 'redbtn.io', 'policies.google.com', 'stripe.com']) {
    assert.match(html, new RegExp(`href="https://${host.replace(/\./g, '\\.')}[^"]*"`), `no contact link for ${host}`)
  }
})

test('the rights section states every statutory right and the deadlines', () => {
  for (const phrase of ['To confirm', 'To withdraw consent', 'To have it deleted', 'Not to be discriminated against']) {
    assert.ok(has(html, phrase), `missing right: ${phrase}`)
  }
  assert.ok(has(html, `within ${LEGAL_DELETION_DAYS} days`), 'deletion window differs from the Privacy Policy')
  assert.ok(has(html, `within ${HEALTH_DATA_RESPONSE_DAYS} days`), 'no response window')
  assert.ok(has(html, 'appeal'), 'no appeal path')
  assert.ok(has(html, 'atg.wa.gov'), 'no Washington Attorney General contact')
  assert.ok(has(html, LEGAL_CONTACT_EMAIL), 'no contact address')
})

test('it claims no more than the Privacy Policy does', () => {
  assert.ok(has(html, 'We do not share consumer health data with anyone for their own purposes'))
  assert.ok(has(html, 'We do not sell consumer health data'))
  assert.ok(has(html, 'do not collect precise geolocation'))
  assert.ok(has(html, 'do not use geofencing'))
  assert.doesNotMatch(html, /HIPAA[- ](compliant|certified)/i)
  assert.doesNotMatch(html, /\bguaranteed\b|money[- ]back/i)
})

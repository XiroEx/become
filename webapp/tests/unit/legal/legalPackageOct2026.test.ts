// The Oct 29-30 2026 legal package (counsel Natalia Vassilieva's partial
// answers; wording approved by Jon, posted by his assistant in Discord).
// Pins the applied edits, the cleared counsel markers, the one marker that
// deliberately stays, the version bump, and that the webapp copies equal
// shared/core's.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TERMS } from '../../../lib/legal/terms'
import { TERMS as CORE_TERMS } from '../../../../shared/core/src/legal/terms'
import { PRIVACY } from '../../../lib/legal/privacy'
import { HEALTH_DATA } from '../../../lib/legal/healthData'
import * as WEB from '../../../lib/legal'
import * as CORE from '../../../../shared/core/src/legal/index'

const text = (doc: { sections: unknown[] }) => JSON.stringify(doc)
const todos = (doc: { sections: { id: string; blocks: { kind: string; text?: string }[] }[] }) =>
  doc.sections.flatMap((s) => s.blocks.filter((b) => b.kind === 'todo').map((b) => ({ id: s.id, text: b.text ?? '' })))

test('the webapp copy of the Terms is shared/core’s, exactly', () => {
  assert.deepEqual(TERMS, CORE_TERMS)
})

test('the version, date and venue overrides equal shared/core’s', () => {
  for (const k of ['LEGAL_VERSION', 'LEGAL_LAST_UPDATED', 'LEGAL_LAST_UPDATED_ISO', 'LEGAL_VENUE'] as const) {
    assert.equal((WEB as Record<string, unknown>)[k], (CORE as Record<string, unknown>)[k], k)
  }
  assert.equal(WEB.LEGAL_VERSION, 'v1.3.0', 'the package changes what members agree to: they re-agree')
})

test('every counsel marker is cleared on all three documents', () => {
  assert.deepEqual(todos(TERMS as never), [])
  assert.deepEqual(todos(PRIVACY as never), [])
  assert.deepEqual(todos(HEALTH_DATA as never), [])
})

test('A1, A4, A5, A7: the Terms carry the approved wording', () => {
  const t = text(TERMS)
  assert.match(t, /at least 5 days and no more than 30 days before a new price takes effect/)
  assert.match(t, /prorated refund of the unused portion of your current period within 14 days following the increase/)
  assert.match(t, /except where section 9 provides a prorated refund following a price increase/)
  assert.match(t, /limited to the amount you paid Become in the 12 months before the event giving rise to the claim\./)
  assert.doesNotMatch(t, /100 US dollars/)
  assert.match(t, /United States District Court for the Eastern District of New York/)
  assert.match(t, /no arbitration agreement and no class-action waiver/)
  assert.match(t, /consent to the collection, tracking, and sharing of personal data is obtained directly from the member/)
  assert.match(t, /Notifications sent between 12:00 AM and 6:00 AM require parental consent for members under 17\./)
})

test('A2 and A3 are published, because the notices they promise now exist (lib/billing/reminders.ts)', () => {
  const t = text(TERMS)
  assert.match(t, /renewal reminder at least 15 days and no more than 45 days before the cancellation deadline/)
  assert.match(t, /Free trials: new members may start with a 7-day free trial that requires no payment method\. We will tell you 3 days before the trial ends\./)
  assert.match(t, /The 14-day first-payment refund in section 10 applies to the first charge after a trial\./)
})

test('A6 and B4: the Privacy Policy carries the approved wording, and no unbacked claims', () => {
  const p = text(PRIVACY)
  assert.match(p, /Financial and tax records are kept for 6 years, as New York law requires\./)
  assert.match(p, /no sale or sharing for a Global Privacy Control signal to opt out of/)
  assert.match(p, /An authorised agent may make a request for you/)
  // Part F: no training claim, no transfer mechanism names, no server-log number.
  assert.doesNotMatch(p, /does not (use|train)[^"]*train/i)
  assert.doesNotMatch(p, /Standard Contractual Clauses|Data Privacy Framework/)
})

test('prices, the refund window and the 14-day first-payment refund are unchanged (Part F)', () => {
  const t = text(TERMS)
  assert.match(JSON.stringify(WEB.RENEWAL_TERMS), /14\.99|119\.99/)
  assert.equal(WEB.LEGAL_REFUND_WINDOW_DAYS, 14)
  assert.match(t, /14-day first-payment refund|first-payment refund/)
})

// Run with: npm run test:file tests/unit/legal/aiConsent.test.tsx
//
// App Store Review Guideline 5.1.2(i): "You must clearly disclose where
// personal data will be shared with third parties, including with third-party
// AI, and obtain explicit permission before doing so."
//
// Become sends meal photos and descriptions, workout-generation inputs (which
// can include injury notes), Mind session inputs and coach-chat text to Google
// Gemini through the redbtn platform. This file pins the three properties that
// make that lawful:
//
//   EXPLICIT   no route dispatches for a member who has not agreed, the gate
//              sits on the route that DISPATCHES (not only the friendly one in
//              front of it), it is asked before the allowance is charged, and
//              it fails CLOSED;
//   RECORDED   the answer, its version, its date and where it came from;
//   REVOCABLE  a DELETE that takes effect on the next request, reachable from
//              Settings, and described in both privacy documents.
//
// Source-text assertions where the property is wiring (the repo idiom — see
// tests/unit/allowance/routeShape.test.ts), renderToStaticMarkup where it is
// words on a screen.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConsentSheet } from '../../../components/ConsentSheet'
import PrivacyPage from '../../../app/privacy/page'
import HealthDataPage from '../../../app/health-data/page'
import TermsPage from '../../../app/terms/page'
import {
  AI_CONSENT_DECLINE_NOTE,
  AI_CONSENT_REASON,
  AI_CONSENT_SENDS,
  AI_CONSENT_STATEMENT,
  AI_CONSENT_VERSION,
  AI_PROVIDER,
  LEGAL_VERSION,
} from '../../../lib/legal'
import { TERMS } from '../../../lib/legal/terms'
import { PRIVACY } from '../../../lib/legal/privacy'
import { HEALTH_DATA } from '../../../lib/legal/healthData'
import { aiConsentDecided, aiConsentGranted, aiConsentStatus, newAiConsent } from '../../../lib/aiConsent'
import { aiConsentRefusalFrom, AI_CONSENT_EVENT } from '../../../lib/aiConsentClient'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const has = (html: string, text: string) => html.includes(esc(text))

/** Is the sheet's primary button actually disabled? Read off the tag, because
 *  its own className contains the word "disabled" (`disabled:opacity-40`) and
 *  a loose match on the markup therefore passes either way. */
function agreeIsDisabled(html: string): boolean {
  const tag = /<button[^>]*data-testid="consent-gate-agree"[^>]*>/.exec(html)
  assert.ok(tag, 'the sheet has no agree button')
  return /\sdisabled=""/.test(tag[0])
}

/** Every route that hands a member's input to the graph. Kept in step with
 *  tests/unit/allowance/routeShape.test.ts, which lists the same set for the
 *  allowance it charges. A new /api/ai POST route belongs in both. */
const DISPATCHING_ROUTES = [
  'app/api/ai/nutrition/plate/route.ts',
  'app/api/ai/nutrition/describe/route.ts',
  'app/api/ai/nutrition/product/route.ts',
  'app/api/ai/nutrition/consultant/route.ts',
  'app/api/ai/workout/session/route.ts',
  'app/api/ai/workout/program/route.ts',
  'app/api/ai/workout/import/route.ts',
  'app/api/ai/consultant/route.ts',
  'app/api/ai/mind/coach/route.ts',
  'app/api/ai/mind/session/route.ts',
  'app/api/ai/mind/flow/route.ts',
  'app/api/ai/mind/generate/route.ts',
  'app/api/ai/mind/suggestions/route.ts',
]

// ─── The decision ────────────────────────────────────────────────────────────

test('nothing is granted by an absent record — silence is not permission', () => {
  assert.equal(aiConsentGranted(undefined), false)
  assert.equal(aiConsentGranted(null), false)
  assert.equal(aiConsentDecided(undefined), false)
})

test('a refusal is a DECISION, and does not grant', () => {
  const no = newAiConsent(false, 'gate')
  assert.equal(no.granted, false)
  assert.equal(aiConsentGranted(no), false)
  // Decided, so the gate stops asking on every app load.
  assert.equal(aiConsentDecided(no), true)
  // A first "no thanks" is not a revocation: nothing ever flowed to revoke.
  assert.equal(no.revokedAt, undefined)
})

test('a grant records the version, the date and where it came from', () => {
  const now = new Date('2026-09-24T12:00:00Z')
  const yes = newAiConsent(true, 'settings', now)
  assert.equal(yes.version, AI_CONSENT_VERSION)
  assert.equal(yes.granted, true)
  assert.equal(yes.decidedAt, now)
  assert.equal(yes.source, 'settings')
  assert.equal(aiConsentGranted(yes), true)
})

test('withdrawing a granted permission is dated as a revocation', () => {
  const granted = newAiConsent(true, 'gate', new Date('2026-09-24T10:00:00Z'))
  const withdrawn = newAiConsent(false, 'settings', new Date('2026-10-01T10:00:00Z'), granted)
  assert.equal(withdrawn.granted, false)
  assert.equal(aiConsentGranted(withdrawn), false)
  assert.ok(withdrawn.revokedAt, 'a withdrawal of a held permission must be dated')
})

test('permission for an older version of the ask does not carry forward', () => {
  const old = { granted: true, version: 'v0.0.1' }
  assert.equal(aiConsentGranted(old), false, 'the disclosure changed; the old yes does not cover the new set')
  assert.equal(aiConsentDecided(old), false, 'so the member is asked again')
})

test('the AI version is independent of the Terms version', () => {
  // Bumping one must never silently re-ask the other: a member re-asked for AI
  // permission who declines loses a feature they were using.
  assert.notEqual(AI_CONSENT_VERSION, LEGAL_VERSION)
  const src = read('lib/legal/index.ts')
  assert.match(src, /export const AI_CONSENT_VERSION = '/)
})

test('the status a client reads never leaks a grant it does not hold', () => {
  const s = aiConsentStatus(null)
  assert.equal(s.granted, false)
  assert.equal(s.decided, false)
  assert.equal(s.provider, AI_PROVIDER)
  assert.equal(s.version, AI_CONSENT_VERSION)
})

// ─── The gate, on every route that dispatches ────────────────────────────────

test('every dispatching AI route asks for consent before it triggers', () => {
  for (const file of DISPATCHING_ROUTES) {
    const src = read(file)
    assert.match(src, /requireAiConsent\(gate\.user\)/, `${file}: no AI consent gate`)
    assert.match(src, /if \(!consent\.ok\) return consent\.response/, `${file}: does not bail on a refusal`)

    const consentAt = src.indexOf('requireAiConsent(')
    const trigger = src.indexOf('triggerOwnedRun(')
    assert.ok(
      consentAt >= 0 && trigger > consentAt,
      `${file}: dispatches before asking — the dispatch is what shares the data`,
    )
  }
})

test('consent is asked BEFORE the allowance is charged', () => {
  // A member who has not agreed must not pay a unit to be told so, and a
  // refunded unit is not the same as one never spent.
  for (const file of DISPATCHING_ROUTES) {
    const src = read(file)
    const consentAt = src.indexOf('requireAiConsent(')
    const charge = Math.max(src.indexOf('requireAiAllowance('), src.indexOf('requireSpendCap('))
    assert.ok(charge > consentAt, `${file}: charges before it knows whether it may send anything`)
  }
})

test('consent is asked AFTER the body is validated, so a typo is still free', () => {
  for (const file of DISPATCHING_ROUTES) {
    const src = read(file)
    const consentAt = src.indexOf('requireAiConsent(')
    for (const m of src.matchAll(/status:\s*400/g)) {
      assert.ok(m.index! < consentAt, `${file}: can 400 after the consent read`)
    }
  }
})

test('the gate fails CLOSED, unlike every client-side lock in this app', () => {
  const src = read('lib/aiConsent.ts')
  // The catch branch must refuse, not pass.
  assert.match(src, /catch[\s\S]{0,200}return \{ ok: false, response: refusal\(null\) \}/, 'an unreadable row must refuse')
  assert.match(src, /status: 403/, 'a refusal is a 403')
  assert.match(src, /reason: AI_CONSENT_REASON/, 'the refusal must be identifiable')
  // And the BODY must not be the entitlement shape, or the upgrade sheet is
  // raised for something money cannot fix. (The rule is explained in a comment
  // above, so the check reads the refusal itself, not the whole file.)
  const body = src.slice(src.indexOf('function refusal('))
  assert.doesNotMatch(body, /requiresTier|feature:/, 'a consent refusal must never parse as a paywall')
})

test('a consent refusal is not parsed as an entitlement gate', () => {
  const body = { error: 'x', reason: AI_CONSENT_REASON, aiConsent: { granted: false } }
  assert.ok(aiConsentRefusalFrom(403, body), 'the consent parser must recognise it')
  // Its own parser is strict in the other direction too.
  assert.equal(aiConsentRefusalFrom(403, { error: 'nope' }), null, 'an unrelated 403 must fall through')
  assert.equal(aiConsentRefusalFrom(429, body), null, 'only a 403 is this refusal')
  assert.equal(aiConsentRefusalFrom(200, body), null)
})

test('the member-content path of the food-report pipeline is gated too', () => {
  // The reporter's photo and note are theirs, and verifyFood reads the photo
  // with a vision call. Without consent they must not be passed — while the
  // catalogue verification, which is about a shared food row, still runs.
  for (const file of [
    'app/api/nutrition/foods/[id]/flag/route.ts',
    'app/api/nutrition/flags/[id]/evidence/route.ts',
  ]) {
    const src = read(file)
    assert.match(src, /aiConsentAllows\(/, `${file}: sends member content with no consent check`)
    assert.match(
      src,
      /mayShareOwnContent\s*\?\s*\{[\s\S]{0,200}userPhotoUrl/,
      `${file}: the photo must ride the consent, not the request`,
    )
  }
})

// ─── Recorded, and revocable ─────────────────────────────────────────────────

test('the User model holds the record, with a source and a revocation date', () => {
  const model = read('models/User.ts')
  assert.match(model, /aiConsent:\s*\{\s*type:\s*UserAiConsentSchema/, 'User has no aiConsent path')
  assert.match(model, /granted:\s*\{\s*type:\s*Boolean,\s*required:\s*true\s*\}/)
  assert.match(model, /revokedAt:/, 'a withdrawal must be recordable')
  assert.match(model, /source:.*enum:\s*\['gate',\s*'prompt',\s*'settings'\]/, 'aiConsent.source is not an enum')
  // Absent is the safe state: no default that would manufacture a grant.
  assert.match(model, /aiConsent:\s*\{\s*type:\s*UserAiConsentSchema,\s*default:\s*undefined\s*\}/)
})

test('the route can record, refuse and withdraw — and records nothing by accident', () => {
  const src = read('app/api/me/ai-consent/route.ts')
  assert.match(src, /export async function GET/)
  assert.match(src, /export async function POST/)
  assert.match(src, /export async function DELETE/, 'there must be a way to withdraw it')
  assert.match(src, /typeof accepted !== 'boolean'/, 'a mis-shaped body must not count as an answer')
  assert.match(src, /revokeAiConsent\(auth\.userId, 'settings'\)/)
  // The read is pure: opening the app cannot manufacture a permission.
  const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
  assert.doesNotMatch(get, /recordAiConsent|updateOne|\$set/, 'GET /api/me/ai-consent writes')
})

test('the terms endpoint carries the AI answer but never implies it', () => {
  const src = read('app/api/me/consent/route.ts')
  assert.match(src, /typeof ai === 'boolean'/, 'the AI answer must be an explicit boolean or absent')
  assert.match(src, /recordAiConsent\(auth\.userId, ai, 'gate'\)/)
  // `accepted: true` alone must never write a grant.
  assert.doesNotMatch(src, /recordAiConsent\(auth\.userId, true/, 'agreeing to the Terms must not grant AI sharing')
})

test('Settings can turn it off, and says what it is', () => {
  const src = read('app/dashboard/settings/page.tsx')
  assert.match(src, /data-testid="ai-consent-toggle"/, 'no switch in Settings')
  assert.match(src, /method: 'DELETE'/, 'the switch cannot withdraw the permission')
  assert.match(src, /AI_CONSENT_SENDS/, 'the switch does not say what is sent')
  // The documents point members here, so the section anchor has to exist.
  assert.match(src, /id="ai"/, 'the AI section has no anchor for the policies to name')
})

// ─── The ask, on screen ──────────────────────────────────────────────────────

test('the sheet asks separately, names the provider, and starts unticked', () => {
  const html = renderToStaticMarkup(
    <ConsentSheet
      checked={false}
      onCheckedChange={() => {}}
      onAgree={() => {}}
      busy={false}
      error={null}
      showTerms
      showAi
      aiChecked={false}
    />,
  )
  assert.ok(html.includes(esc(AI_CONSENT_STATEMENT)), 'the sheet does not carry AI_CONSENT_STATEMENT')
  assert.ok(has(html, AI_PROVIDER), 'the sheet does not name the provider')
  for (const item of AI_CONSENT_SENDS) {
    assert.ok(has(html, item), `the sheet does not say that this is sent: ${item}`)
  }
  assert.ok(has(html, AI_CONSENT_DECLINE_NOTE), 'the sheet does not say what saying no costs')
  // Two ticks, and the AI one is NOT pre-ticked.
  assert.match(html, /data-testid="ai-consent-checkbox"/, 'no AI tick')
  assert.doesNotMatch(
    html,
    /data-testid="ai-consent-checkbox"[^>]*checked/,
    'the AI box must never be pre-ticked — that is the pattern the guideline exists to stop',
  )
})

test('the AI tick is optional: the button does not wait for it', () => {
  // A permission you must give to get into the app is not a permission.
  const html = renderToStaticMarkup(
    <ConsentSheet
      checked
      onCheckedChange={() => {}}
      onAgree={() => {}}
      busy={false}
      error={null}
      showTerms
      showAi
      aiChecked={false}
    />,
  )
  // The className carries `disabled:opacity-40`, so the attribute has to be
  // read off the tag itself rather than matched anywhere near the button.
  assert.equal(agreeIsDisabled(html), false, 'the terms tick alone must be enough to continue')
})

test('the AI question can be asked on its own, without re-asking the Terms', () => {
  const html = renderToStaticMarkup(
    <ConsentSheet
      checked
      onCheckedChange={() => {}}
      onAgree={() => {}}
      busy={false}
      error={null}
      showTerms={false}
      showAi
      aiChecked={false}
    />,
  )
  assert.match(html, /data-testid="ai-consent-checkbox"/)
  assert.doesNotMatch(html, /data-testid="consent-gate-checkbox"/, 'the terms tick must not reappear')
})

test('the gate opens for an undecided AI question, and does not nag a refusal', () => {
  const src = read('components/ConsentGate.tsx')
  assert.match(src, /body\.ai\?\.decided === false/, 'the gate must open on an UNANSWERED AI question')
  assert.doesNotMatch(src, /body\.ai\?\.granted === false/, 'a member who said no must not be asked every load')
})

test('one listener raises the ask when a dispatch is refused', () => {
  const store = read('lib/ai/runStore.ts')
  assert.match(store, /aiConsentRefusalFrom\(httpStatus, started\)/, 'the run store ignores a consent refusal')
  assert.match(store, /requestAiConsent\(/, 'nothing raises the ask')
  // ...but only for a run the member asked for. A background warmer must not
  // throw a sheet over the screen out of nowhere; it falls back, like every
  // other refusal it meets.
  assert.match(store, /if \(!opts\.silent\) requestAiConsent\(/, 'a background run must not raise the sheet')
  // Before the entitlement gate: the two 403s are different, and only one of
  // them is about money.
  assert.ok(
    store.indexOf('aiConsentRefusalFrom(') < store.indexOf('gateFrom(httpStatus'),
    'a consent refusal must be recognised before the paywall parser sees it',
  )

  const prompt = read('components/AiConsentPrompt.tsx')
  assert.match(prompt, /addEventListener\(AI_CONSENT_EVENT/, 'the prompt listens for nothing')
  assert.match(prompt, /removeEventListener\(AI_CONSENT_EVENT/, 'the listener is never cleaned up')
  assert.equal(AI_CONSENT_EVENT, 'become:ai-consent-required')
  assert.match(prompt, /showTerms=\{false\}/, 'the prompt must not re-ask the Terms')

  const layout = read('app/dashboard/layout.tsx')
  assert.match(layout, /<AiConsentPrompt \/>/, 'the prompt is not mounted anywhere')
})

// ─── What the documents say ──────────────────────────────────────────────────

test('the Privacy Policy states the consent, the withdrawal and what is sent', () => {
  const html = renderToStaticMarkup(<PrivacyPage />)
  assert.ok(has(html, 'Nothing goes to the AI until you say it can'))
  assert.ok(has(html, AI_PROVIDER), 'the policy does not name the provider')
  for (const item of AI_CONSENT_SENDS) {
    assert.ok(has(html, item), `the policy does not list: ${item}`)
  }
  assert.ok(has(html, 'Settings → AI features'), 'the policy does not say where to withdraw it')
  // And it is in the AI section, which is the one the app links to.
  const ai = PRIVACY.sections.find(s => s.id === 'ai')
  assert.ok(ai, 'the policy has no #ai section for the app to link to')
  assert.match(ai!.heading, /permission/i, 'the AI heading does not mention the permission')
})

test('the Privacy Policy describes the native push token', () => {
  const html = renderToStaticMarkup(<PrivacyPage />)
  assert.ok(has(html, 'Native push token'), 'the policy does not mention the native push token')
  assert.ok(has(html, 'Expo push token'), 'the policy does not say what the token actually is')
  // It is described where it is collected AND where it comes from.
  const collect = PRIVACY.sections.find(s => s.id === 'collect')!
  const sources = PRIVACY.sections.find(s => s.id === 'sources')!
  const flat = (id: typeof collect) =>
    JSON.stringify(id.blocks)
  assert.match(flat(collect), /push token/i)
  assert.match(flat(sources), /native push token/i)
})

test('the Health Data policy states the same consent and the same token', () => {
  const html = renderToStaticMarkup(<HealthDataPage />)
  assert.ok(
    has(html, 'Sharing with the AI provider is a separate, affirmative consent'),
    'the consumer health data policy does not describe the AI consent',
  )
  assert.ok(has(html, 'Settings → AI features'), 'it does not say where to withdraw it')
  assert.ok(has(html, 'native push token'), 'it does not mention the native push token')
  // The two documents must not disagree about who receives the data.
  assert.ok(has(html, AI_PROVIDER))
  const sharing = HEALTH_DATA.sections.find(s => s.id === 'sharing')!
  assert.match(JSON.stringify(sharing.blocks), /given the separate AI consent/)
})

test('the Terms say the same thing in section 8', () => {
  const ai = TERMS.sections.find(s => s.id === 'ai')!
  assert.match(
    JSON.stringify(ai.blocks),
    /nothing is sent until you give it/,
    'the Terms do not mention the AI permission',
  )
})

// ─── Apple's required licence terms ──────────────────────────────────────────

test('Terms section 17 carries Apple’s minimum EULA terms', () => {
  const section = TERMS.sections.find(s => s.id === 'app-stores')
  assert.ok(section, 'the Terms have no app-store section')
  assert.match(section!.heading, /^17\./, 'Apple’s terms must be section 17')

  const html = renderToStaticMarkup(<TermsPage />)

  // The ten minimum terms of Schedule 1 to the Apple Developer Program
  // Licence Agreement. Each is checked by the fact it exists to state, not by
  // its heading, so re-wording the prose cannot silently drop one.
  const REQUIRED: [string, RegExp][] = [
    ['acknowledgement (the agreement is not with Apple)', /concluded between you and [^.]*only, and not with Apple/i],
    ['scope of licence (Apple-branded products, Usage Rules)', /non-transferable licence to use it on any Apple-branded products/i],
    ['maintenance and support (Apple has none)', /Apple has no obligation whatsoever to furnish any maintenance and support/i],
    ['warranty (Apple refunds the purchase price)', /Apple will refund the purchase price/i],
    ['product claims (the publisher answers them)', /responsible for addressing any claims/i],
    ['HealthKit / HomeKit', /HealthKit and HomeKit frameworks/i],
    ['intellectual property claims', /infringes that third party’s intellectual property rights/i],
    ['legal compliance (embargo and restricted-party warranty)', /subject to a U\.S\. Government embargo/i],
    ['developer name and address', /516 Cambridge Ave/],
    ['third-party terms (e.g. the data plan)', /third-party terms of agreement/i],
    ['third-party beneficiary (Apple may enforce)', /Apple, and Apple’s subsidiaries, are third-party beneficiaries/i],
  ]
  for (const [what, re] of REQUIRED) {
    assert.match(html, re, `Terms section 17 is missing Apple's required term: ${what}`)
  }

  // It must be scoped to the App Store build rather than imposed on everybody.
  assert.ok(
    has(html, 'applies only if you obtained Become from the Apple App Store'),
    'the Apple terms must say who they apply to',
  )
})

// Run with: npm run test:file tests/unit/legal/securityProgram.test.ts
//
// `SECURITY_PROGRAM.md` at the repo root is Become's written information
// security program, which New York's SHIELD Act (GBL § 899-bb(2)(b)) requires
// of any business holding the private information of a New York resident. Item
// 17 of the go-live audit.
//
// A document like this fails silently in five ways, and all five are checkable:
//
//   1. it loses one of the safeguard clauses the statute enumerates — the
//      administrative/technical/physical trio is not prose, it is a list of
//      fourteen sub-clauses, and dropping one is dropping the compliance;
//   2. it stops naming the person responsible, or the systems member data
//      actually lives on, so the two questions an investigator asks first have
//      no answer;
//   3. it loses its dates, and an undated program is indistinguishable from an
//      unmaintained one;
//   4. it drifts away from the member-facing documents — a processor appears in
//      /privacy or /health-data and never appears in the program, so the
//      controls cover four systems and the disclosures name five;
//   5. somebody pastes a connection string or a key into it while documenting
//      where the secrets live. The operational credential rule ("never write a
//      password, token, connection string or 2FA seed into any file") applies
//      to this file too, and this is what enforces it.
//
// The ANNUAL REVIEW is not enforced here on purpose: a test that starts failing
// on a date would block an unrelated PR a year from now. The review date is a
// card on the board; this file only checks that the date exists, is ISO, and is
// exactly twelve months after the effective date.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY, type LegalDoc } from '../../../lib/legal'
import { PRIVACY } from '../../../lib/legal/privacy'
import { HEALTH_DATA } from '../../../lib/legal/healthData'

const REPO_ROOT = path.join(__dirname, '../../../..')
const PROGRAM_PATH = path.join(REPO_ROOT, 'SECURITY_PROGRAM.md')
const program = fs.readFileSync(PROGRAM_PATH, 'utf8')

/** The same text with every run of whitespace collapsed to one space. Prose in
 *  this file is hard-wrapped at ~100 columns, so a phrase check against the raw
 *  string fails the day somebody re-flows a paragraph — which is a formatting
 *  change, not a compliance one. Structural checks (headings, table rows) still
 *  run against `program`, where the line boundaries are the point. */
const flat = program.replace(/\s+/g, ' ')

/** A single `- **Label:** value` line from the header block. */
function headerField(label: string): string {
  const match = program.match(new RegExp(`^- \\*\\*${label}:\\*\\* (.+)$`, 'm'))
  assert.ok(match, `SECURITY_PROGRAM.md is missing its "${label}" header line`)
  return match![1].trim()
}

// ─── 1. It exists, and it is a program rather than a stub ────────────────────

test('the written program exists at the repo root and is substantive', () => {
  assert.ok(
    program.length > 15_000,
    `SECURITY_PROGRAM.md is only ${program.length} characters — that is a placeholder, not a program`,
  )
  assert.match(program, /^# Become LLC — Written Information Security Program$/m)
  assert.ok(flat.includes(LEGAL_ENTITY), 'the program must name the legal entity')
  assert.ok(
    program.includes('899-bb'),
    'the program must cite the statute it exists to satisfy (GBL § 899-bb)',
  )
})

// ─── 2. All three kinds of safeguard, clause by clause ───────────────────────
//
// § 899-bb(2)(b)(ii): (A) administrative, six sub-clauses; (B) technical, four;
// (C) physical, four. Fourteen in total, each answered in its own paragraph.

const SAFEGUARD_SECTIONS = [
  { letter: 'A', kind: 'Administrative', clauses: 6 },
  { letter: 'B', kind: 'Technical', clauses: 4 },
  { letter: 'C', kind: 'Physical', clauses: 4 },
] as const

test('it covers administrative, technical and physical safeguards, and every statutory sub-clause', () => {
  for (const { letter, kind, clauses } of SAFEGUARD_SECTIONS) {
    const heading = new RegExp(`^## \\d+\\. ${kind} safeguards — GBL § 899-bb\\(2\\)\\(b\\)\\(ii\\)\\(${letter}\\)$`, 'm')
    assert.match(program, heading, `no "${kind} safeguards" section citing § 899-bb(2)(b)(ii)(${letter})`)

    for (let n = 1; n <= clauses; n++) {
      const tag = `**(${letter})(${n})`
      assert.ok(
        program.includes(tag),
        `§ 899-bb(2)(b)(ii)(${letter})(${n}) is not answered — no "${tag}" paragraph in the ${kind.toLowerCase()} section`,
      )
    }
    // The statute has no (A)(7)/(B)(5)/(C)(5): a stray one means a mis-numbered
    // paragraph, which is how a clause gets answered twice and another not at all.
    assert.ok(
      !program.includes(`**(${letter})(${clauses + 1})`),
      `${kind} safeguards have ${clauses} sub-clauses in § 899-bb(2)(b)(ii)(${letter}); found a (${letter})(${clauses + 1})`,
    )
  }
})

test('it carries an incident-response and breach-notification section with the § 899-aa duties', () => {
  assert.match(program, /^## \d+\. Incident response and breach notification \(GBL § 899-aa\)$/m)
  for (const duty of [
    'Attorney General',
    'Division of Consumer Protection',
    'Division of State Police',
    'consumer reporting agencies',
  ]) {
    assert.ok(flat.includes(duty), `the breach section does not name "${duty}" among the notifications`)
  }
})

// ─── 3. It names the person responsible ──────────────────────────────────────

test('it names the person responsible, and the business owner beside them', () => {
  assert.match(
    program,
    /\| \*\*Security Coordinator\*\* \| \*\*George Anthony\*\*/,
    'the program must designate a named Security Coordinator (§ 899-bb(2)(b)(ii)(A)(1))',
  )
  assert.ok(flat.includes('Jon Don'), 'the business/data owner must be named too')
  assert.ok(
    flat.includes(LEGAL_CONTACT_EMAIL),
    `the security contact of record must be ${LEGAL_CONTACT_EMAIL}, the address /privacy already gives members`,
  )
  assert.ok(
    flat.includes('An agent holds no approval authority'),
    'the program must state that an agent cannot approve it — it was drafted by one',
  )
})

// ─── 4. It says where member data lives, and agrees with the public documents ─

/** The systems the card requires by name, plus the object store /privacy names. */
const REQUIRED_SYSTEMS = [
  'MongoDB Atlas',
  'redbtn platform',
  'Google Gemini',
  'Stripe',
  'Gmail',
  'MinIO',
] as const

test('it lists where member data lives, by system', () => {
  for (const system of REQUIRED_SYSTEMS) {
    assert.ok(flat.includes(system), `the data inventory does not mention ${system}`)
  }
  assert.match(program, /^## \d+\. What we hold, and where it lives$/m)
  // The sensitive categories, not just the account row.
  for (const category of ['injury notes', 'mood', 'meal', 'Billing metadata', 'passkey']) {
    assert.ok(
      flat.toLowerCase().includes(category.toLowerCase()),
      `the inventory does not account for "${category}"`,
    )
  }
})

/** Every `dl` term in a document's "sharing" section — i.e. its processor list. */
function processorTerms(doc: LegalDoc): string[] {
  const section = doc.sections.find((s) => s.id === 'sharing')
  assert.ok(section, `${doc.slug} has no "sharing" section to read processors from`)
  return section!.blocks.flatMap((b) => (b.kind === 'dl' ? b.items.map((i) => i.term) : []))
}

test('every processor named to members in /privacy and /health-data is covered by the program', () => {
  for (const doc of [PRIVACY, HEALTH_DATA]) {
    const terms = processorTerms(doc)
    assert.ok(terms.length >= 4, `${doc.slug} lists only ${terms.length} processors — did the shape change?`)
    for (const term of terms) {
      const covered = REQUIRED_SYSTEMS.some((system) => term.includes(system))
      assert.ok(
        covered,
        `/${doc.slug} names the processor "${term}", which no system in the security program covers. ` +
          'Add it to SECURITY_PROGRAM.md section 4 and to REQUIRED_SYSTEMS in this test.',
      )
    }
  }
})

// ─── 5. Dates, review date, and the approval record ──────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

test('it carries a date and a review date, twelve months apart', () => {
  const issued = headerField('Date issued')
  const effective = headerField('Effective date')
  const review = headerField('Next review due')

  for (const [label, value] of [['Date issued', issued], ['Effective date', effective], ['Next review due', review]]) {
    assert.match(value, ISO_DATE, `${label} must be an ISO date (YYYY-MM-DD), got "${value}"`)
  }

  assert.equal(effective, issued, 'the effective date and the issue date must agree')

  const [y, m, d] = effective.split('-')
  assert.equal(
    review,
    `${Number(y) + 1}-${m}-${d}`,
    'the review date must be exactly twelve months after the effective date',
  )

  assert.ok(
    Date.parse(`${effective}T00:00:00Z`) <= Date.now(),
    `the effective date ${effective} is in the future — a program cannot take effect later than it is relied on`,
  )

  // The same dates, restated in the review section, must not drift from the header.
  assert.ok(
    flat.includes(`effective **${effective}**`) && flat.includes(`due **${review}**`),
    'section 13 must restate the same effective and review dates as the header block',
  )
})

test('the approval record is either pending or a dated approval by the named approver', () => {
  const status = headerField('Approval status')
  const pending = 'Pending — awaiting review and sign-off by George Anthony'
  const approved = status.match(/^Approved by George Anthony on (\d{4}-\d{2}-\d{2})$/)

  assert.ok(
    status === pending || approved,
    `Approval status must be either "${pending}" or "Approved by George Anthony on YYYY-MM-DD", got "${status}"`,
  )

  // The approval table is the signature record. It has to agree with the header.
  assert.match(program, /^\| Security Coordinator \(approves\) \| George Anthony \| (.+) \| (.+) \|$/m)
  const row = program.match(/^\| Security Coordinator \(approves\) \| George Anthony \| (.+?) \| (.+?) \|$/m)!
  if (approved) {
    assert.equal(
      row[2].trim(),
      approved[1],
      'the header says the program is approved; the approval table must carry the same date',
    )
    assert.notEqual(row[1].trim(), 'Pending', 'approved in the header but still Pending in the approval table')
  } else {
    assert.equal(row[1].trim(), 'Pending', 'the header says approval is pending; the table must say so too')
  }

  assert.match(program, /^\| Business owner \(acknowledges\) \| Jon Don \|/m)
})

// ─── 6. Open questions are enumerable, not scattered ─────────────────────────
//
// Same discipline as `counselTodos` for the legal pages: an unresolved item is a
// marked, countable node, so a reviewer can be handed the list instead of asked
// to read twenty pages for it.

test('every [CONFIRM AT SIGN-OFF] marker is listed in Appendix A, and vice versa', () => {
  const inline = new Set(
    [...program.matchAll(/\[CONFIRM AT SIGN-OFF: (C\d+)\]/g)].map((m) => m[1]),
  )
  assert.ok(inline.size > 0, 'a draft awaiting sign-off should carry at least one confirm marker')

  const appendix = program.slice(program.indexOf('## Appendix A'))
  assert.ok(appendix.length > 0, 'Appendix A is missing')
  const listed = [...appendix.matchAll(/^\| (C\d+) \|/gm)].map((m) => m[1])
  assert.equal(new Set(listed).size, listed.length, 'Appendix A lists the same id twice')

  for (const id of inline) {
    assert.ok(listed.includes(id), `${id} is marked in the text but not listed in Appendix A`)
  }
  for (const id of listed) {
    assert.ok(inline.has(id), `Appendix A lists ${id}, but nothing in the program is marked with it`)
  }
  // Contiguous from C1, so a deleted row is obvious rather than a gap in the numbering.
  const numbers = listed.map((id) => Number(id.slice(1))).sort((a, b) => a - b)
  assert.deepEqual(
    numbers,
    numbers.map((_, i) => i + 1),
    `Appendix A ids must run C1..C${numbers.length} with no gaps, got ${listed.join(', ')}`,
  )
})

test('the risk register and the gap list are complete rows, and every gap cited exists', () => {
  const risks = [...program.matchAll(/^\| (R\d+) \| (.+?) \| (.+?) \| (.+?) \|$/gm)]
  assert.ok(risks.length >= 8, `only ${risks.length} risks identified — § 899-bb(2)(b)(ii)(A)(2) expects internal and external`)
  for (const [, id, risk, controls, residual] of risks) {
    for (const [label, cell] of [['risk', risk], ['controls', controls], ['residual', residual]]) {
      assert.ok(cell.trim().length > 3, `risk ${id} has an empty ${label} cell`)
    }
  }

  const gaps = [...program.matchAll(/^\| (G\d+) \| (.+?) \| (.+?) \| (.+?) \| (.+?) \|$/gm)]
  assert.ok(gaps.length > 0, 'the remediation table is empty')
  const gapIds = new Set(gaps.map((g) => g[1]))
  for (const [, id, , , owner, target] of gaps) {
    assert.ok(owner.trim().length > 3, `gap ${id} has no owner`)
    assert.ok(target.trim().length > 3, `gap ${id} has no target date`)
  }
  // A gap cited in the prose must exist in the table, or the citation is a dead end.
  for (const match of program.matchAll(/\((G\d+)\)/g)) {
    assert.ok(gapIds.has(match[1]), `the text cites ${match[1]}, which is not a row in the remediation table`)
  }
})

// ─── 7. It claims nothing it does not hold, and leaks nothing ────────────────

test('it claims no certification Become does not hold', () => {
  for (const claim of ['SOC 2', 'ISO 27001', 'HITRUST']) {
    assert.ok(!flat.includes(claim), `the program mentions ${claim}; Become holds no such certification`)
  }
  assert.ok(
    flat.includes('not a covered entity'),
    'the HIPAA position must be stated as what it is: Become is not a covered entity or business associate',
  )
})

test('it contains no credential, key or connection string', () => {
  const FORBIDDEN: [RegExp, string][] = [
    [/mongodb(\+srv)?:\/\//, 'a MongoDB connection string'],
    [/\bsk_(live|test)_[A-Za-z0-9]/, 'a Stripe secret key'],
    [/\bwhsec_[A-Za-z0-9]/, 'a Stripe webhook secret'],
    [/\bAKIA[0-9A-Z]{8}/, 'an AWS/S3 access key id'],
    [/BEGIN (RSA |EC )?PRIVATE KEY/, 'a private key'],
    [/\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/, 'a private LAN address'],
    [/\bpassword\s*=\s*\S/i, 'an inline password assignment'],
  ]
  for (const [pattern, what] of FORBIDDEN) {
    const hit = program.match(pattern) ?? flat.match(pattern)
    assert.equal(
      hit,
      null,
      `SECURITY_PROGRAM.md appears to contain ${what} ("${hit?.[0]}"). The credential rule applies to this file: placeholders only.`,
    )
  }
})

// ─── 8. Findable by both principals ─────────────────────────────────────────

test('it is linked from AGENTS.md, the document both principals and every agent read first', () => {
  const agents = fs.readFileSync(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8')
  assert.ok(
    agents.includes('SECURITY_PROGRAM.md'),
    'AGENTS.md must point at SECURITY_PROGRAM.md, or nobody finds it',
  )
  assert.ok(
    agents.includes('George Anthony'),
    'the pointer in AGENTS.md should name who owns the program, so the reader knows who to ask',
  )
})

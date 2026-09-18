import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const nodemailer = require('nodemailer')
const dotenv = require('dotenv')

// Tell the grandfathered members what they hold.
//
// Go-live card item 6 (2026-09-10): "The 64 grandfathered members have never
// been told what they hold." scripts/migrate-tiers.mjs promoted them to Plus
// with `grandfathered: true`, and the Terms (section 9) promise that those
// accounts keep Plus permanently, at no charge, with no renewal. Nobody had
// said so to the members themselves. George said go on 2026-09-18.
//
// ONE email per member, ever. The send stamps `grandfatheredNotifiedAt`, and
// the selector excludes anyone who carries it, so a rerun matches nobody and
// a crash mid-run resumes where it stopped rather than starting over.
//
// Recipients are exactly the members the Terms are talking about:
//   grandfathered: true AND tier: 'plus'
// A grandfathered flag on a free-tier row is a contradiction the entitlement
// loader already logs; this script does not email a promise the gates would
// not keep.
//
//   DRY RUN:  node scripts/notify-grandfathered.mjs --prod
//   SEND:     node scripts/notify-grandfathered.mjs --prod --send
//   ONE:      node scripts/notify-grandfathered.mjs --prod --send --only you@example.com
//
// SENDS AS THE APP SENDS. With REDSECRETS_MONGODB_URI and SECRETS_ENCRYPTION_KEY
// in the environment (the production container's own values), the mail
// settings come from the BECOME_RUNTIME_CONFIG payload in redsecrets — the
// same host, user and from-address every sign-in link uses — so this notice
// arrives from Become, not from whatever mailbox happens to be in a shell's
// ~/.env. Without those two, EMAIL_HOST / EMAIL_PORT / EMAIL_USER /
// EMAIL_PASS / EMAIL_FROM from the environment are used (local testing only).
// The member database is PROD_MONGODB_URI (or MONGODB_URI without --prod),
// falling back to the payload's auth.mongoUri. Nothing is printed but masked
// addresses, sender domains and counts.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.local') })
dotenv.config({ path: path.join(process.env.HOME || '', '.env') })

const SEND = process.argv.includes('--send')
const PROD = process.argv.includes('--prod')
const onlyIdx = process.argv.indexOf('--only')
const ONLY = onlyIdx > -1 ? String(process.argv[onlyIdx + 1] || '').trim().toLowerCase() : null

// ─── Resolve configuration the way lib/runtimeConfig.ts does ─────────────────
let payload = {}
if (process.env.REDSECRETS_MONGODB_URI && process.env.SECRETS_ENCRYPTION_KEY) {
  const { MongoClient } = require('mongodb')
  const { SecretsClient } = require('@redbtn/redsecrets')
  const store = new MongoClient(process.env.REDSECRETS_MONGODB_URI)
  await store.connect()
  const secrets = new SecretsClient(store, { database: 'redshared', encryptionKey: process.env.SECRETS_ENCRYPTION_KEY })
  const raw = await secrets.get({ name: 'BECOME_RUNTIME_CONFIG', appName: 'become', scope: 'global' })
  await store.close()
  if (!raw) {
    console.error('BECOME_RUNTIME_CONFIG not found in redsecrets')
    process.exit(1)
  }
  payload = JSON.parse(raw)
  console.log('mail config: from redsecrets (the app’s own)')
} else {
  console.log('mail config: from environment (EMAIL_*)')
}
const mail = {
  host: (payload.email && payload.email.host) || process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number((payload.email && payload.email.port) || process.env.EMAIL_PORT || 587),
  user: (payload.email && payload.email.user) || process.env.EMAIL_USER,
  pass: (payload.email && payload.email.pass) || process.env.EMAIL_PASS,
  from: (payload.email && payload.email.from) || process.env.EMAIL_FROM,
}

const URI = PROD
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || (payload.auth && payload.auth.mongoUri))
  : process.env.MONGODB_URI
if (!URI) {
  console.error(`Missing ${PROD ? 'PROD_MONGODB_URI' : 'MONGODB_URI'}`)
  process.exit(1)
}

const APP_NAME = 'Become'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://becomeurbest.com'
const CONTACT = 'info@becomeurbest.com'
const ADDRESS = 'Become LLC, 516 Cambridge Ave, Westbury, NY 11590, United States'

const mask = (email) => {
  const [local, domain] = String(email).split('@')
  return `${local.slice(0, 2)}…@${domain}`
}
const domainOf = (addr) => String(addr || '').replace(/^.*@/, '').replace(/>.*$/, '') || '(none)'
console.log(`sender: ${mail.from ? mask(mail.from.replace(/^.*<|>.*$/g, '')) : '(EMAIL_FROM unset, will use user)'} via ${mail.host}:${mail.port} as …@${domainOf(mail.user)}`)

function html(name) {
  const greeting = name ? `Hi ${name},` : 'Hi,'
  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your Plus membership</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #18181b; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: #fff; margin: 0; font-size: 28px; font-weight: 700;">${APP_NAME}</h1>
        </div>
        <div style="background: #fff; padding: 40px 30px; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; margin-bottom: 20px;">${greeting}</p>
          <p style="font-size: 16px; margin-bottom: 20px;">
            You were here early, and we want to put in writing what that means.
          </p>
          <p style="font-size: 16px; margin-bottom: 20px;">
            <strong>Your account has Become Plus, permanently, at no charge.</strong> Plus is the full app: unlimited custom exercises, sessions and programs, unlimited custom foods and meals, AI meal estimates and workout generation, the Vision workspace, and everything we add to Plus from here on. It does not expire, it does not renew, and there is nothing to set up or confirm. It is simply yours.
          </p>
          <p style="font-size: 16px; margin-bottom: 20px;">
            Become is opening paid plans to new members. That changes nothing for you. Our Terms say it plainly: accounts with this grant keep Plus permanently, and we will not start charging them. You will never see an upgrade prompt that applies to you, and if one ever appears by mistake, tell us and we will fix it.
          </p>
          <p style="font-size: 16px; margin-bottom: 20px;">
            The only thing we ask is what we have always asked: keep showing up.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${APP_URL}/dashboard" style="display: inline-block; background: #18181b; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Open Become</a>
          </div>
          <p style="font-size: 14px; color: #52525b; margin-bottom: 8px;">
            Questions, or anything wrong with your account? Reply to this email or write to <a href="mailto:${CONTACT}" style="color: #52525b;">${CONTACT}</a>.
          </p>
          <p style="font-size: 16px; margin-top: 24px;">Thank you for being here first.<br>The Become team</p>
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0 20px;">
          <p style="font-size: 12px; color: #a1a1aa; text-align: center; line-height: 1.6; margin: 0;">
            You are receiving this one-time notice because your ${APP_NAME} account holds a complimentary Plus grant.<br>
            ${APP_NAME} is sent by ${ADDRESS}.
          </p>
        </div>
      </body>
    </html>`
}

function text(name) {
  return [
    name ? `Hi ${name},` : 'Hi,',
    '',
    'You were here early, and we want to put in writing what that means.',
    '',
    'Your account has Become Plus, permanently, at no charge. Plus is the full app: unlimited custom exercises, sessions and programs, unlimited custom foods and meals, AI meal estimates and workout generation, the Vision workspace, and everything we add to Plus from here on. It does not expire, it does not renew, and there is nothing to set up or confirm. It is simply yours.',
    '',
    'Become is opening paid plans to new members. That changes nothing for you. Our Terms say it plainly: accounts with this grant keep Plus permanently, and we will not start charging them. If an upgrade prompt ever appears for you by mistake, tell us and we will fix it.',
    '',
    'The only thing we ask is what we have always asked: keep showing up.',
    '',
    `Open Become: ${APP_URL}/dashboard`,
    '',
    `Questions? Reply to this email or write to ${CONTACT}.`,
    '',
    'Thank you for being here first.',
    'The Become team',
    '',
    `You are receiving this one-time notice because your ${APP_NAME} account holds a complimentary Plus grant. ${APP_NAME} is sent by ${ADDRESS}.`,
  ].join('\n')
}

await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 })
const users = mongoose.connection.db.collection('users')

const selector = {
  grandfathered: true,
  tier: 'plus',
  grandfatheredNotifiedAt: { $exists: false },
  ...(ONLY ? { email: ONLY } : {}),
}

const [totalGrandfathered, mismatched, alreadyNotified, recipients] = await Promise.all([
  users.countDocuments({ grandfathered: true }),
  users.countDocuments({ grandfathered: true, tier: { $ne: 'plus' } }),
  users.countDocuments({ grandfathered: true, grandfatheredNotifiedAt: { $exists: true } }),
  users.find(selector, { projection: { email: 1, name: 1 } }).sort({ email: 1 }).toArray(),
])

console.log(`grandfathered: ${totalGrandfathered} | not on plus (skipped): ${mismatched} | already notified: ${alreadyNotified} | to send now: ${recipients.length}`)
for (const r of recipients.slice(0, 5)) console.log(`  ${mask(r.email)}${r.name ? '  (has name)' : ''}`)
if (recipients.length > 5) console.log(`  … and ${recipients.length - 5} more`)

if (!SEND) {
  console.log('DRY RUN — nothing sent. Add --send to send.')
  await mongoose.disconnect()
  process.exit(0)
}

const { host, port, user, pass } = mail
if (!user || !pass) {
  console.error('Missing mail user / pass')
  await mongoose.disconnect()
  process.exit(1)
}
const from = `"${APP_NAME}" <${mail.from || user}>`
const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
await transporter.verify()

// A placeholder name is the email's local part (lib/displayName.ts); greet
// those members without a name rather than with "Hi jsmith84".
const isPlaceholder = (name, email) => !name || name.trim().toLowerCase() === String(email).split('@')[0].toLowerCase()

let sent = 0
let failed = 0
for (const r of recipients) {
  const name = isPlaceholder(r.name, r.email) ? '' : r.name.trim().split(/\s+/)[0]
  try {
    await transporter.sendMail({
      from,
      to: r.email,
      subject: 'Your Become Plus membership, in writing',
      html: html(name),
      text: text(name),
    })
    await users.updateOne({ _id: r._id, grandfatheredNotifiedAt: { $exists: false } }, { $set: { grandfatheredNotifiedAt: new Date() } })
    sent++
    console.log(`sent  ${mask(r.email)}`)
  } catch (err) {
    failed++
    console.log(`FAIL  ${mask(r.email)}  ${err && err.message ? err.message.slice(0, 120) : err}`)
  }
  // Gentle pacing for the SMTP relay.
  await new Promise((res) => setTimeout(res, 1500))
}

console.log(`done: sent ${sent}, failed ${failed}`)
await mongoose.disconnect()
process.exit(failed ? 1 : 0)

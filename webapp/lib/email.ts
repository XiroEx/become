import nodemailer from 'nodemailer'
import { getRuntimeConfig, requireRuntimeSecret } from './runtimeConfig'
import { LEGAL_ADDRESS_LINES, LEGAL_CONTACT_EMAIL } from './legal'
import { unsubscribeUrlFor } from './emailUnsubscribe'

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'BECOME'

/**
 * ─── Email colour, and why every surface here is a flat colour ──────────────
 *
 * The sign-in email arrived unreadable in the Gmail Android app: the wordmark
 * was dark ink on the dark header, so the top of the email was blank.
 *
 * The palette was not the problem — the way the header was PAINTED was. A
 * client's dark mode rewrites the colours it can parse (`color`,
 * `background-color`) and leaves a `background-image` alone. The header's
 * darkness came from `linear-gradient(...)`, which is a background-image, so
 * Gmail flipped the wordmark's `color: #fff` to a dark ink and left the dark
 * gradient exactly where it was. Text and surface moved independently, and
 * that is all it takes.
 *
 * Three rules follow, and `tests/unit/email/contrast.test.ts` enforces them:
 *
 *   1. No text is ever painted over a gradient or an image. Every surface is a
 *      flat `background-color`, so a client that inverts moves the ink and the
 *      surface under it TOGETHER and the contrast survives.
 *   2. Every run of text resolves to a declared `color` AND to an ancestor
 *      with a declared `background-color`. Text inheriting its colour onto a
 *      surface the client picked is the same bug wearing a different hat.
 *   3. Each resolved pair clears WCAG AA — 4.5:1, or 3:1 for large text — in
 *      the light palette, in the dark one, and when both are inverted.
 *
 * `color-scheme: light dark` is the other half of the fix: it tells Apple Mail
 * and Outlook that this message brings its own dark styles, which stops their
 * blanket inversion and hands them EMAIL_DARK below instead.
 */
export const EMAIL_LIGHT = {
  page: '#f4f4f5',
  surface: '#ffffff',
  border: '#e4e4e7',
  headerSurface: '#18181b',
  headerInk: '#ffffff',
  ink: '#27272a',
  /** zinc-600: 7.5:1 on white. The footer used zinc-400 (#a1a1aa) — 2.6:1. */
  muted: '#52525b',
  mutedLink: '#3f3f46',
  buttonSurface: '#18181b',
  buttonInk: '#ffffff',
} as const

export const EMAIL_DARK = {
  page: '#09090b',
  surface: '#18181b',
  border: '#3f3f46',
  headerSurface: '#000000',
  headerInk: '#fafafa',
  ink: '#f4f4f5',
  muted: '#a1a1aa',
  mutedLink: '#d4d4d8',
  buttonSurface: '#fafafa',
  buttonInk: '#18181b',
} as const

/**
 * The dark palette, applied by class. An inline style beats a `<style>` rule,
 * so every override here has to carry `!important` — which is also why each
 * element that can change colour in dark mode needs the matching class. An
 * element left unclassed keeps its light-mode ink on a dark surface.
 */
function darkModeCss(): string {
  return `
          @media (prefers-color-scheme: dark) {
            .b-page { background-color: ${EMAIL_DARK.page} !important; color: ${EMAIL_DARK.ink} !important; }
            .b-header { background-color: ${EMAIL_DARK.headerSurface} !important; }
            .b-header-ink { color: ${EMAIL_DARK.headerInk} !important; }
            .b-card { background-color: ${EMAIL_DARK.surface} !important; border-color: ${EMAIL_DARK.border} !important; }
            .b-ink { color: ${EMAIL_DARK.ink} !important; }
            .b-muted { color: ${EMAIL_DARK.muted} !important; }
            .b-muted-link { color: ${EMAIL_DARK.mutedLink} !important; }
            .b-button { background-color: ${EMAIL_DARK.buttonSurface} !important; color: ${EMAIL_DARK.buttonInk} !important; }
            .b-rule { border-top-color: ${EMAIL_DARK.border} !important; }
          }`
}

const FONT_STACK = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`

interface EmailShellOptions {
  /** The document title, not shown in the body. */
  title: string
  /** The single glyph above the wordmark on engagement mail. Sign-in has none. */
  emoji?: string
  /** The card's inner HTML. */
  content: string
  /** Engagement mail is centred; the sign-in email reads as a letter. */
  center?: boolean
}

/**
 * The one shell every Become email is rendered into: head, wordmark header and
 * card. Shared so the contrast rules above hold in one place rather than in
 * three copies that drift.
 */
export function emailShell({ title, emoji, content, center }: EmailShellOptions): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light dark">
        <meta name="supported-color-schemes" content="light dark">
        <title>${title}</title>
        <style>
          :root { color-scheme: light dark; supported-color-schemes: light dark; }${darkModeCss()}
        </style>
      </head>
      <body class="b-page" style="font-family: ${FONT_STACK}; line-height: 1.6; background-color: ${EMAIL_LIGHT.page}; color: ${EMAIL_LIGHT.ink}; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div class="b-header" style="background-color: ${EMAIL_LIGHT.headerSurface}; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          ${emoji ? `<div style="font-size: 48px; line-height: 1; margin-bottom: 8px;">${emoji}</div>` : ''}
          <h1 class="b-header-ink" style="color: ${EMAIL_LIGHT.headerInk}; margin: 0; font-size: 28px; font-weight: 700;">${appName}</h1>
        </div>
        <div class="b-card" style="background-color: ${EMAIL_LIGHT.surface}; padding: 40px 30px; border: 1px solid ${EMAIL_LIGHT.border}; border-top: none; border-radius: 0 0 12px 12px;${center ? ' text-align: center;' : ''}">${content}
        </div>
      </body>
    </html>
  `
}

/**
 * The footer every outbound email carries (CAN-SPAM, 16 CFR 316): the
 * sender's physical postal address on ALL of them, and a working opt-out on
 * the ones that are not transactional. Sign-in links are transactional — a
 * member cannot opt out of the only way in — so they get the address alone.
 * Streak and milestone mail is engagement mail, so it gets both.
 */
export function emailFooter(opts: { reason: string; unsubscribeUrl?: string }): string {
  const address = LEGAL_ADDRESS_LINES.join(', ')
  const optOut = opts.unsubscribeUrl
    ? ` <a class="b-muted-link" href="${opts.unsubscribeUrl}" style="color: ${EMAIL_LIGHT.mutedLink}; text-decoration: underline;">Unsubscribe</a> from these emails, or change them in Settings.`
    : ''
  return `
          <hr class="b-rule" style="border: none; border-top: 1px solid ${EMAIL_LIGHT.border}; margin: 32px 0 20px;">
          <p class="b-muted" style="font-size: 12px; color: ${EMAIL_LIGHT.muted}; text-align: center; line-height: 1.6; margin: 0;">
            ${opts.reason}${optOut}<br>
            ${appName} is sent by ${address}. Questions: <a class="b-muted-link" href="mailto:${LEGAL_CONTACT_EMAIL}" style="color: ${EMAIL_LIGHT.mutedLink};">${LEGAL_CONTACT_EMAIL}</a>
          </p>`
}

interface EmailAttachment {
  filename: string
  content: Buffer
  contentType: string
  cid: string
}

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  from?: string
  attachments?: EmailAttachment[]
  /** Set on engagement mail: adds the RFC 8058 List-Unsubscribe headers so
   *  Gmail and Apple Mail show their own one-click unsubscribe. */
  unsubscribeUrl?: string
}

export async function sendEmail({ to, subject, html, from, attachments, unsubscribeUrl }: SendEmailOptions) {
  const { email } = await getRuntimeConfig()
  const user = requireRuntimeSecret(email.user, 'email.user')
  const pass = requireRuntimeSecret(email.pass, 'email.pass')
  const transporter = nodemailer.createTransport({
    host: email.host,
    port: email.port,
    secure: email.port === 465,
    auth: { user, pass },
  })
  const mailOptions = {
    from: from ?? `"${appName}" <${email.from || user}>`,
    to,
    subject,
    html,
    ...(attachments?.length ? { attachments } : {}),
    ...(unsubscribeUrl
      ? {
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }
      : {}),
  }

  return transporter.sendMail(mailOptions)
}

const MILESTONE_LABELS: Record<number, string> = {
  3: '3-Day',
  7: '1-Week',
  14: '2-Week',
  30: '1-Month',
  50: '50-Day',
  100: '100-Day',
  200: '200-Day',
  365: '1-Year',
}

export async function sendStreakMilestoneEmail(email: string, milestone: number, streakDays: number, userId: string) {
  const label = MILESTONE_LABELS[milestone] || `${milestone}-Day`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://become.redbtn.io'
  const unsubscribeUrl = await unsubscribeUrlFor(userId)

  const html = emailShell({
    title: `${label} Streak on ${appName}`,
    emoji: '🔥',
    center: true,
    content: `
          <h2 style="font-size: 24px; font-weight: 700; color: #f59e0b; margin: 0 0 8px;">${label} Streak! 🏆</h2>
          <p class="b-ink" style="font-size: 48px; font-weight: 900; color: ${EMAIL_LIGHT.ink}; margin: 16px 0;">${streakDays}</p>
          <p class="b-muted" style="font-size: 16px; color: ${EMAIL_LIGHT.muted}; margin: 0 0 8px;">days in a row.</p>
          <p class="b-muted" style="font-size: 16px; color: ${EMAIL_LIGHT.muted}; margin: 0 0 32px;">You're building something real. Keep showing up — that's what separates the people who change from the ones who wish they had.</p>
          <a class="b-button" href="${appUrl}/dashboard" style="display: inline-block; background-color: ${EMAIL_LIGHT.buttonSurface}; color: ${EMAIL_LIGHT.buttonInk}; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Keep the Streak Going</a>
          ${emailFooter({ reason: `You're receiving this because you hit a streak milestone on ${appName}.`, unsubscribeUrl })}`,
  })

  await sendEmail({
    to: email,
    subject: `🔥 ${label} Streak on ${appName}! You're on fire.`,
    html,
    unsubscribeUrl,
  })
}

export async function sendStreakAtRiskEmail(email: string, streakDays: number, userId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://become.redbtn.io'
  const unsubscribeUrl = await unsubscribeUrlFor(userId)

  const html = emailShell({
    title: `Your ${streakDays}-day streak is at risk`,
    emoji: '⚡',
    center: true,
    content: `
          <h2 style="font-size: 24px; font-weight: 700; color: #ef4444; margin: 0 0 8px;">Your ${streakDays}-day streak is at risk</h2>
          <p class="b-muted" style="font-size: 16px; color: ${EMAIL_LIGHT.muted}; margin: 0 0 32px;">You haven't logged anything today. Log a workout, your weight, your mood — anything counts. Don't let it slip.</p>
          <a href="${appUrl}/dashboard" style="display: inline-block; background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Protect My Streak</a>
          ${emailFooter({ reason: `You're receiving this because you have an active streak on ${appName}.`, unsubscribeUrl })}`,
  })

  await sendEmail({
    to: email,
    subject: `⚡ Don't break your ${streakDays}-day streak on ${appName}`,
    html,
    unsubscribeUrl,
  })
}

/**
 * The sign-in / registration email, as HTML. Pure and exported so the contrast
 * rules can be asserted against the real output rather than against a copy of
 * it: `tests/unit/email/contrast.test.ts` renders this and walks every run of
 * text in it.
 */
export function verificationEmailHtml({ verifyUrl, mode }: { verifyUrl: string; mode: 'login' | 'register' }): string {
  const actionText = mode === 'register' ? 'complete your registration' : 'sign in'
  // No name: sign-up asks for an email and nothing else, and a sign-in link is
  // sent before we know who is on the other end of the address. "Hi," is the
  // honest greeting for both.
  const greeting = 'Hi,'

  return emailShell({
    title: mode === 'register' ? `Complete your ${appName} registration` : `Sign in to ${appName}`,
    content: `
          <p class="b-ink" style="font-size: 16px; color: ${EMAIL_LIGHT.ink}; margin: 0 0 24px;">${greeting}</p>

          <p class="b-ink" style="font-size: 16px; color: ${EMAIL_LIGHT.ink}; margin: 0 0 24px;">
            Click the button below to ${actionText}. This link will expire in 15 minutes.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a class="b-button" href="${verifyUrl}" style="display: inline-block; background-color: ${EMAIL_LIGHT.buttonSurface}; color: ${EMAIL_LIGHT.buttonInk}; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">${mode === 'register' ? 'Complete Registration' : 'Sign In'}</a>
          </div>

          <p class="b-muted" style="font-size: 14px; color: ${EMAIL_LIGHT.muted}; margin: 32px 0 0;">
            If you didn't request this email, you can safely ignore it.
          </p>

          <hr class="b-rule" style="border: none; border-top: 1px solid ${EMAIL_LIGHT.border}; margin: 32px 0;">

          <p class="b-muted" style="font-size: 12px; color: ${EMAIL_LIGHT.muted}; text-align: center; margin: 0;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a class="b-muted-link" href="${verifyUrl}" style="color: ${EMAIL_LIGHT.mutedLink}; word-break: break-all;">${verifyUrl}</a>
          </p>
          ${emailFooter({ reason: `You're receiving this because this address was entered on the ${appName} sign-in screen.` })}`,
  })
}

/**
 * The "you asked us to delete your account" email, as HTML.
 *
 * TRANSACTIONAL, so it carries the postal address and NO unsubscribe link: a
 * member cannot opt out of being told their account is about to be erased, and
 * CAN-SPAM does not ask them to. It is also the ONLY thing standing between a
 * mis-tap and an unrecoverable deletion, so the undo link is the button and the
 * raw URL is printed underneath it — this link is opened on a phone, in a mail
 * app, where "copy and paste this" is sometimes the only thing that works.
 *
 * Pure and exported so the copy and the link can be asserted without SMTP.
 */
export function accountDeletionEmailHtml({
  restoreUrl,
  scheduledPurgeAt,
  graceDays,
}: {
  restoreUrl: string
  scheduledPurgeAt: Date
  graceDays: number
}): string {
  const when = scheduledPurgeAt.toUTCString()
  return emailShell({
    title: `Your ${appName} account is scheduled for deletion`,
    content: `
          <p class="b-ink" style="font-size: 16px; color: ${EMAIL_LIGHT.ink}; margin: 0 0 24px;">Hi,</p>

          <p class="b-ink" style="font-size: 16px; color: ${EMAIL_LIGHT.ink}; margin: 0 0 24px;">
            You asked us to delete your ${appName} account. We have signed you out everywhere,
            stopped every notification, and scheduled your data for permanent deletion on
            <strong>${when}</strong> — ${graceDays} days from now.
          </p>

          <p class="b-ink" style="font-size: 16px; color: ${EMAIL_LIGHT.ink}; margin: 0 0 24px;">
            <strong>Changed your mind?</strong> Use the button below any time before then and your
            account and all of your data come back untouched. After that date it cannot be undone.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a class="b-button" href="${restoreUrl}" style="display: inline-block; background-color: ${EMAIL_LIGHT.buttonSurface}; color: ${EMAIL_LIGHT.buttonInk}; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Keep My Account</a>
          </div>

          <p class="b-muted" style="font-size: 14px; color: ${EMAIL_LIGHT.muted}; margin: 32px 0 0;">
            If you did not ask for this, use the button above straight away and then reply to this
            email so we can look into it.
          </p>

          <hr class="b-rule" style="border: none; border-top: 1px solid ${EMAIL_LIGHT.border}; margin: 32px 0;">

          <p class="b-muted" style="font-size: 12px; color: ${EMAIL_LIGHT.muted}; text-align: center; margin: 0;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a class="b-muted-link" href="${restoreUrl}" style="color: ${EMAIL_LIGHT.mutedLink}; word-break: break-all;">${restoreUrl}</a>
          </p>
          ${emailFooter({ reason: `You're receiving this because a deletion was requested for this ${appName} account.` })}`,
  })
}

export async function sendAccountDeletionEmail(
  email: string,
  opts: { restoreUrl: string; scheduledPurgeAt: Date; graceDays: number },
) {
  await sendEmail({
    to: email,
    subject: `Your ${appName} account will be deleted in ${opts.graceDays} days`,
    html: accountDeletionEmailHtml(opts),
  })
}

/** Sent when the undo link is used. Transactional, and deliberately short. */
export function accountRestoredEmailHtml(): string {
  return emailShell({
    title: `Your ${appName} account was restored`,
    content: `
          <p class="b-ink" style="font-size: 16px; color: ${EMAIL_LIGHT.ink}; margin: 0 0 24px;">Hi,</p>

          <p class="b-ink" style="font-size: 16px; color: ${EMAIL_LIGHT.ink}; margin: 0 0 24px;">
            The deletion of your ${appName} account has been cancelled and nothing was removed.
            Sign in as usual — your training, nutrition and mind history are all where you left them.
          </p>

          <p class="b-muted" style="font-size: 14px; color: ${EMAIL_LIGHT.muted}; margin: 0 0 24px;">
            One thing did change: notifications were switched off the moment the deletion was
            requested, and they stay off until you turn them back on in Settings. We would rather
            leave them off than start pushing to a phone you thought you had said goodbye to.
          </p>

          <p class="b-muted" style="font-size: 14px; color: ${EMAIL_LIGHT.muted}; margin: 32px 0 0;">
            If it was not you who cancelled it, reply to this email and we will look into it.
          </p>
          ${emailFooter({ reason: `You're receiving this because a pending deletion of this ${appName} account was cancelled.` })}`,
  })
}

export async function sendAccountRestoredEmail(email: string) {
  await sendEmail({
    to: email,
    subject: `Your ${appName} account was restored`,
    html: accountRestoredEmailHtml(),
  })
}

export async function sendVerificationEmail(email: string, token: string, mode: 'login' | 'register', baseUrl?: string) {
  const appUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const verifyUrl = `${appUrl}/verify?token=${token}&mode=${mode}`

  await sendEmail({
    to: email,
    subject: mode === 'register' ? `Complete your ${appName} registration` : `Sign in to ${appName}`,
    html: verificationEmailHtml({ verifyUrl, mode }),
  })
}

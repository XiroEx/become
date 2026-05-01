import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'BECOME'

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  from?: string
}

export async function sendEmail({ to, subject, html, from }: SendEmailOptions) {
  const mailOptions = {
    from: from ?? `"${appName}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
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

export async function sendStreakMilestoneEmail(email: string, milestone: number, streakDays: number) {
  const label = MILESTONE_LABELS[milestone] || `${milestone}-Day`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://become.redbtn.io'

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <div style="font-size: 48px; margin-bottom: 8px;">🔥</div>
          <h1 style="color: #fff; margin: 0; font-size: 28px; font-weight: 700;">${appName}</h1>
        </div>
        <div style="background: #fff; padding: 40px 30px; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
          <h2 style="font-size: 24px; font-weight: 700; color: #f59e0b; margin-bottom: 8px;">${label} Streak! 🏆</h2>
          <p style="font-size: 48px; font-weight: 900; color: #18181b; margin: 16px 0;">${streakDays}</p>
          <p style="font-size: 16px; color: #52525b; margin-bottom: 8px;">days in a row.</p>
          <p style="font-size: 16px; color: #52525b; margin-bottom: 32px;">You're building something real. Keep showing up — that's what separates the people who change from the ones who wish they had.</p>
          <a href="${appUrl}/dashboard" style="display: inline-block; background: #18181b; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Keep the Streak Going</a>
          <p style="font-size: 12px; color: #a1a1aa; margin-top: 32px;">You're receiving this because you hit a streak milestone on ${appName}.</p>
        </div>
      </body>
    </html>
  `

  await sendEmail({
    to: email,
    subject: `🔥 ${label} Streak on ${appName}! You're on fire.`,
    html,
  })
}

export async function sendStreakAtRiskEmail(email: string, streakDays: number) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://become.redbtn.io'

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <div style="font-size: 48px; margin-bottom: 8px;">⚡</div>
          <h1 style="color: #fff; margin: 0; font-size: 28px; font-weight: 700;">${appName}</h1>
        </div>
        <div style="background: #fff; padding: 40px 30px; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
          <h2 style="font-size: 24px; font-weight: 700; color: #ef4444; margin-bottom: 8px;">Your ${streakDays}-day streak is at risk</h2>
          <p style="font-size: 16px; color: #52525b; margin-bottom: 32px;">You haven't logged anything today. Log a workout, your weight, your mood — anything counts. Don't let it slip.</p>
          <a href="${appUrl}/dashboard" style="display: inline-block; background: #ef4444; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Protect My Streak</a>
          <p style="font-size: 12px; color: #a1a1aa; margin-top: 32px;">You're receiving this because you have an active streak on ${appName}.</p>
        </div>
      </body>
    </html>
  `

  await sendEmail({
    to: email,
    subject: `⚡ Don't break your ${streakDays}-day streak on ${appName}`,
    html,
  })
}

export async function sendVerificationEmail(email: string, token: string, mode: 'login' | 'register', name?: string, baseUrl?: string) {
  const appUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const verifyUrl = `${appUrl}/verify?token=${token}&mode=${mode}`
  
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const actionText = mode === 'register' ? 'complete your registration' : 'sign in'
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your email</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: #fff; margin: 0; font-size: 28px; font-weight: 700;">${appName}</h1>
        </div>
        
        <div style="background: #fff; padding: 40px 30px; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; margin-bottom: 24px;">${greeting}</p>
          
          <p style="font-size: 16px; margin-bottom: 24px;">
            Click the button below to ${actionText}. This link will expire in 15 minutes.
          </p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${verifyUrl}" style="display: inline-block; background: #18181b; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              ${mode === 'register' ? 'Complete Registration' : 'Sign In'}
            </a>
          </div>
          
          <p style="font-size: 14px; color: #71717a; margin-top: 32px;">
            If you didn't request this email, you can safely ignore it.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
          
          <p style="font-size: 12px; color: #a1a1aa; text-align: center;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${verifyUrl}" style="color: #71717a; word-break: break-all;">${verifyUrl}</a>
          </p>
        </div>
      </body>
    </html>
  `

  await sendEmail({
    to: email,
    subject: mode === 'register' ? `Complete your ${appName} registration` : `Sign in to ${appName}`,
    html,
  })
}

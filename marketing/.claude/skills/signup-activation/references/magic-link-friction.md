# Magic-Link Friction

The five ways Become's passwordless signup loses people, in order of impact, with the copy that fixes
each. Read `webapp/components/AuthForm.tsx` and `webapp/app/verify/page.tsx` before proposing
changes: the flow has more states than it looks like from outside.

## How the flow actually works

1. The user submits an email (and a name, in register mode) in `AuthForm`.
2. `POST /api/auth/send-link` creates a MagicLink document with a token and a session id, short TTL,
   and sends the email through Nodemailer over SMTP.
3. `AuthForm` switches to a "Check your email" state showing the address, and begins polling
   `POST /api/auth/check-session` with the session id every two seconds. The visible state reads
   "Waiting for verification...".
4. The user opens the link, landing on `/verify?token=...&mode=login|register`.
5. `/verify` calls `POST /api/auth/verify-link`, which validates the token, creates the user if new,
   and returns a JWT. The JWT is stored as an HTTP-only cookie and in local storage.
6. `/verify` shows "Account created!" or "Signed in!", detects standalone display mode, and attempts
   `window.close()`.
7. The original polling tab picks up the session and redirects to `/dashboard`.

Step 6 and 7 are where the design assumes one device and two tabs. Reality is often one device, two
browsers, or two devices.

---

## 1. Wrong-tab and wrong-browser confusion

**The failure.** The user submits in Safari, opens the mail app, and taps the link. iOS opens it in
the mail client's in-app browser, which is a separate browser context. Verification succeeds there.
The polling tab in Safari may or may not pick it up. `window.close()` does nothing, because the tab
was not opened by script. The user is left on a success screen inside a browser they are about to
close, with no obvious way into the app.

**Check for:**
- Does the success screen always render an explicit action, independent of `window.close()`?
- Does the flow work if the polling tab was closed?
- Does the flow work if the link is opened on a different device?

**Fixes, in order:**

1. Always show a primary button on `/verify` success. Never rely on the close or the handoff.
   ```
   ❌ Signed in! You can close this tab.
   ✅ Signed in.  [ Open Become ]  You can close this tab.
   ```
2. Tell the user where to look before they leave the page. On the waiting screen:
   ```
   ✅ Open the link on this device to come straight back here.
      Open it anywhere else and it signs you in there instead.
   ```
3. Handle the already-verified case gracefully in the polling tab. If a session appears, redirect
   without asking.

---

## 2. Inbox delay and placement

**The failure.** The link takes minutes, or arrives in Promotions or spam. Sending is Nodemailer over
SMTP, so deliverability is ours to manage. Full rules in `email-lifecycle`.

**Check for:**
- Median delivery time from send to inbox, measured, not assumed.
- SPF, DKIM, and DMARC alignment for the sending domain.
- Whether the waiting screen sets an expectation the delivery time can meet.

**Fixes:**

1. State the expectation, then beat it. If delivery is usually under 30 seconds, say "under a
   minute." Never say "instantly."
2. Name the spam folder before the user thinks of it, in the same breath as the address:
   ```
   ✅ Sent to alex@example.com. It arrives in under a minute.
      Not there? Check spam and promotions.
   ```
3. Keep the magic-link email plain: one link domain, low image weight, a real from-name, clear
   subject. Transactional mail that looks like marketing mail gets filed like marketing mail.
4. Never add an unsubscribe link to the magic-link email. It is transactional.

---

## 3. Expired or reused token

**The failure.** MagicLink documents have a short TTL and auto-delete. A user who checks email an
hour later, or taps the link a second time, gets an error.

**Check for:**
- Is the expiry stated in the email, in plain words?
- Is the error screen a route forward or a dead end?
- Is a reused token distinguishable from an expired one?

**Fixes:**

```
❌ Invalid or expired token.
✅ That link expired.  [ Send me a new one ]
   Links last 15 minutes so nobody else can use them.
```

```
❌ Verification failed.
✅ You're already signed in on this device.  [ Open Become ]
```

Stating the reason for expiry converts an error into a security feature. Do not state a duration in
copy without checking the current TTL in the MagicLink model.

---

## 4. The waiting screen tells the user nothing to do

**The failure.** "Waiting for verification..." with a spinner is honest and passive. The user has
nothing to do and no idea how long.

**Check for:**
- Does the screen name the address, the time, and the fallback?
- Is there a resend, and does it appear only after a sensible wait?
- Is there a way to correct a mistyped address without starting over?

**Fixes:**

1. Three facts on the screen: address, expected time, spam fallback. `AuthForm` already shows the
   address, which is the most important of the three.
2. A resend button that is disabled for the first 30 to 60 seconds, with the wait visible:
   `Resend available in 42s`. An always-live resend produces duplicate emails and invalidated tokens.
3. An "wrong address?" link that returns to the form with the field editable. A typo currently costs
   a full restart.
4. Keep "Waiting for verification..." as the status line. It is accurate. Add the three facts around
   it rather than replacing it with something cuter.

---

## 5. Mail-app in-app browsers and PWA context

**The failure.** In-app browsers inside Gmail, Outlook, and iOS Mail have their own storage,
sometimes block cookies, and cannot install a PWA. A user who verifies there and installs nothing
loses the session when they close the client.

**Check for:**
- Does the session survive being opened in an in-app browser and then in the real browser?
- Does the PWA case behave differently, and is that intentional? `/verify` already checks
  `display-mode: standalone`.
- Are iOS users given the Share then Add to Home Screen instruction, and only iOS users?

**Fixes:**

1. On the `/verify` success screen inside an in-app browser, prefer an explicit action over any
   automatic behaviour, and consider a line: "Opened this from your email app? Tap Open Become to
   continue in your browser."
2. Never chain an install prompt onto the verify screen. Install is asked after an earned win, not
   during authentication.
3. Do not prompt for notification permission during signup. Permission asked before value is a
   permanent no in most browsers.

---

## Copy set for the whole flow

Ready to adapt. Run any change through `copy-editing` before it ships.

| Surface | Copy |
|---|---|
| Register button | `Send my link` |
| Under the field | `No password. We email you a link that signs you in.` |
| Waiting heading | `Check your email` |
| Waiting body | `Sent to {email}. It arrives in under a minute.` |
| Waiting fallback | `Not there? Check spam and promotions.` |
| Waiting status | `Waiting for verification...` |
| Resend, disabled | `Resend available in {n}s` |
| Resend, live | `Send it again` |
| Wrong address | `Wrong address? Change it` |
| Verify success, register | `Account created.` + `[ Open Become ]` |
| Verify success, login | `Signed in.` + `[ Open Become ]` |
| Verify expired | `That link expired.` + `[ Send me a new one ]` |
| Verify reused | `You're already signed in on this device.` + `[ Open Become ]` |
| Email subject | `Your sign-in link` |
| Email button | `Sign in to Become` |
| Email expiry line | `This link works for 15 minutes.` |
| Email safety line | `If you didn't ask for this, you can ignore it.` |

Two rules for every string above: no banned words, and never a claim about how many people use
Become or what results they got. Authentication copy is the least appropriate place in the entire
product for marketing language.

## What we will not do here

- Fake progress bars or an artificial "setting up your account" delay.
- Auto-subscribing to email marketing from a transactional signup without a visible choice.
- Prompting for notifications or install during authentication.
- Confirmshaming a user who abandons the form.
- Any copy implying the free state is temporary or that a price is coming.

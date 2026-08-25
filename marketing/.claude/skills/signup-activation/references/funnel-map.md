# Activation Funnel Map

Nine stages from the landing CTA to a returning user. Each has one definition, one metric, the files
that own it, and the failure signature that identifies it as the leak.

Metric names here are descriptive. The canonical event names and property schema belong to
`analytics-tracking`; agree them there before building a dashboard on this.

---

## Stage 1: CTA clicked

**Definition.** A visitor taps a primary CTA on an entry surface and navigates to `/register` or
`/login`.

**Metric.** CTA clicks per landing session.

**Owns it.** `webapp/components/landing/BecomeLanding.tsx` (`Hero`, `ClosingSection`, `Nav`).

**Failure signature.** High scroll depth, low clicks. The page is being read and not believed. This
is a `landing-cro` problem, not an activation problem.

---

## Stage 2: Email submitted

**Definition.** The user enters an email in `AuthForm` and the send-link request succeeds.

**Metric.** Send-link requests per `/register` view.

**Owns it.** `webapp/components/AuthForm.tsx`, `webapp/app/register/page.tsx`,
`webapp/app/login/page.tsx`, `POST /api/auth/send-link`.

**Failure signature.** Users arrive at `/register` and leave without submitting. Causes, in order of
likelihood: the passwordless mechanic is unexplained so the form reads as a mailing-list capture;
the register form asks for a name as well as an email, and the extra field costs more than it
returns; three sign-in paths (link, Google, passkey) present a choice the user did not want to make.

**Cheapest fix.** One line under the field explaining what happens next: "We email you a link that
signs you in. No password."

---

## Stage 3: Link delivered

**Definition.** The magic-link email lands in the primary inbox within a minute.

**Metric.** Deliveries per send, and median delivery time. Requires SMTP-side visibility.

**Owns it.** `webapp/lib/email.ts`, Nodemailer over SMTP, the MagicLink model.

**Failure signature.** Send-link succeeds and link-clicked never follows, at a rate that does not
match any UI explanation. Almost always Promotions placement, a spam folder, or SPF/DKIM/DMARC
alignment. Deliverability rules live in `email-lifecycle`.

**Cheapest fix.** The waiting screen names the spam folder before the user has to think of it.

---

## Stage 4: Link clicked

**Definition.** The user opens the link and lands on `/verify?token=...&mode=login|register`.

**Metric.** Link clicks per delivery.

**Owns it.** the email body, `webapp/app/verify/page.tsx`.

**Failure signature.** Delivered and never clicked. Causes: subject line unclear about what the email
is; the link is not the obvious primary action in the email body; the token expired before the user
came back. MagicLink documents carry a short TTL with automatic cleanup, so a user who checks email
later gets an error rather than a link.

**Cheapest fix.** Subject that names the action ("Your sign-in link"), one button in the body, and
the expiry stated in plain words.

---

## Stage 5: Account created and session established

**Definition.** `POST /api/auth/verify-link` validates the token, the user record exists, and a JWT
is issued.

**Metric.** Successful verifications per link click.

**Owns it.** `webapp/app/verify/page.tsx`, `POST /api/auth/verify-link`, `webapp/lib/auth.ts`.

**Failure signature.** Clicks that do not become sessions. Almost always the expired-token path or a
second click on an already-consumed link.

**Cheapest fix.** Turn both errors into routes forward: a resend button on the expiry screen, and a
"you are already signed in, open Become" state for a reused token.

---

## Stage 6: Returned to a usable session

**Definition.** The user is inside the app on the device they intend to use, on `/dashboard` or
`/onboarding`.

**Metric.** Sessions that reach `/dashboard` per successful verification.

**Owns it.** `webapp/app/verify/page.tsx` (the handoff), `webapp/components/AuthForm.tsx` (the
polling tab).

**Failure signature.** Verification succeeds and no dashboard view follows. This is the tab-handoff
problem. The verify page attempts `window.close()`, which only works on script-opened tabs, and it
detects standalone display mode for the PWA case. In the common real path, a user opens the link in
their mail client's in-app browser and ends on a success screen inside a browser they will close.

**Cheapest fix.** Always render an explicit primary action on the success screen. Never depend on
`window.close()` or on the other tab noticing.

---

## Stage 7: Onboarding completed

**Definition.** All five steps submitted: Goals, Background, Body & nutrition, Equipment, Review.

**Metric.** Completion rate overall and per step. Step-level is the only version that is actionable.

**Owns it.** `webapp/app/onboarding/page.tsx`.

**Failure signature.** A cliff at one step. Watch step 3 (body stats and nutrition direction), which
is the most personal and the most computational. The flow computes real targets from the answers
rather than falling back to schema defaults, which is the right design; the copy has to make that
visible or the step reads as pure data collection.

**Cheapest fix.** Add the payoff to the step counter: what this step changes on screen.

---

## Stage 8: First meaningful action

**Definition.** The user creates something that is theirs. Pick one and hold it constant:

| Candidate | Cost to the user | Notes |
|---|---|---|
| First mood check-in | One tap, via `DailyCheckInModal` | Lowest friction win in the app |
| First generated session | Two or three taps, Generate sheet | Instant, personal, and demonstrates the AI |
| First plate photographed | Two or three taps plus a meal | The most persuasive mechanic |
| First set logged | Four or more taps plus a gym | The truest activation, and the slowest |
| Program enrolled | Two or three taps | Commits the week, pays off later |

**Metric.** Percentage of accounts reaching the chosen action within 24 hours.

**Owns it.** `webapp/app/dashboard/`, the hub routes.

**Failure signature.** Onboarding completes and nothing follows. The dashboard is a menu with no
single next action.

**Cheapest fix.** One dominant next action on the first dashboard view, chosen from the answers just
given, plus a scheduled session so day 2 has a trigger.

---

## Stage 9: Day-7 return

**Definition.** Any session on a distinct day within seven days of account creation.

**Metric.** Day-7 return rate by signup cohort.

**Owns it.** `email-lifecycle` (day 0 to 7 sends), `push-notifications` (nudges), the product itself.

**Failure signature.** Strong day 0, empty day 2 onward. Either nothing was scheduled, or nothing
reminded them, or the first session did not produce a record worth returning to.

**Cheapest fix.** Leave session one with a scheduled next session and a single day-2 nudge. One
channel per day, coordinated between email and push so both do not fire together.

---

## What the database already answers

Before instrumenting anything new, check what is already recorded. `UserProgress` holds weight
history, mood history, workout logs with sets, active programs with progress, and streak count.
`Schedule` holds training days, start date, and scheduled workouts with status. The nutrition
collections hold meal logs. Stages 7 through 9 are largely answerable from existing data with no new
events at all. `analytics-tracking` owns the queries.

Stages 2 through 6 are the ones that genuinely need instrumentation, because they happen across an
email client and possibly two devices.

## Reading the funnel

1. Compute each stage as a rate against the stage above it, not against the top.
2. Find the single worst rate. Fix that one.
3. Re-measure before touching the next stage. Two simultaneous fixes cannot be attributed.
4. At Become's volume, most stage rates are small-N. `ab-testing` owns the honest call about when a
   difference is readable and when the answer is to ship the better-reasoned version and watch a
   sequential window.
5. Production and beta share one database. Segment by channel or route or the numbers blend silently.

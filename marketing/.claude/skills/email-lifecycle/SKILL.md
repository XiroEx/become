---
name: email-lifecycle
description: Designs and writes Become's email program — the magic-link and verification transactional set, the welcome and activation sequence, week-one habit emails, the weekly recap send, lapsed-user win-back, and re-engagement — with subject lines, preview text, send timing, trigger and suppression logic, and plain deliverable HTML because sending runs through Nodemailer SMTP. Use when the user says "write a welcome email," "our emails don't get opened," "win-back sequence," "email people who haven't logged a workout," "what should the recap email say," "set up onboarding emails," or "the magic link email looks bad." For in-app and browser nudges see push-notifications; for the activation flow the emails support see signup-activation; for the launch announcement send see launch-campaign.
metadata:
  version: 1.0.0
  batch: lifecycle-launch
---

# Email Lifecycle

You are Become's lifecycle email owner. Your goal is to send the fewest emails that move a real
person from a submitted address to a logged workout, and to keep the one email we cannot afford
to break landing in the inbox.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a lifecycle email spec plus finished copy: a sequence table (trigger, timing, goal
metric, suppression), the full body copy for each email, subject and preview-text alternates,
and the trigger logic an engineer can implement. Done means every email in the set has a named
trigger, a single action, a suppression rule, and copy that is true at the moment it sends.

Become's signup is a magic link, so **the email address is the identity**. Every account exists
because someone opened an inbox and clicked. There is no unreachable user and no "email
opt-in rate" to grow. That raises the stakes: email is not one channel among several, it is the
front door, and a deliverability failure is an authentication outage.

## When to use

- Writing or fixing a transactional email: magic link, verification, streak milestone.
- Building the day 0 to day 7 activation sequence for new signups.
- Designing a recap, habit, or win-back send and its suppression rules.
- Diagnosing low opens, low clicks, or spam placement.
- Deciding whether a message should be email at all rather than a push.

**Not this skill:**

- Browser nudges, permission prompts, streak-at-risk pings → `push-notifications`.
- The in-product flow the emails support (verify handoff, onboarding, first log) → `signup-activation`.
- A one-time announcement blast tied to a launch date → `launch-campaign`.
- Landing page or ad copy → `copywriting`.
- Defining the open, click, or activation events themselves → `analytics-tracking`.

## Process

### Assessment gate (do all six before writing a word)

1. **Which lifecycle stage?** Transactional, activation, habit, reactivation, or broadcast. The
   stage sets the tone ceiling, the length, and whether an unsubscribe link is required.
2. **What triggers it, precisely?** Name the event and the delay. "New user" is not a trigger.
   "Account created, plus 24 hours, and no workout logged" is.
3. **What data do we actually have?** Check the model before personalizing. `UserProgress`
   holds weight history, mood history, workout logs, streak count, and active programs;
   `Schedule` holds training days and per-day slot status; the nutrition collections hold meal
   logs. If a number is not in there, it cannot go in the email.
4. **What is the single action?** One link, one verb. If you cannot name it, the email is a
   newsletter and probably should not send.
5. **What already exists?** Read `webapp/lib/email.ts` first. `sendEmail`, `sendVerificationEmail`,
   `sendStreakMilestoneEmail`, and `sendStreakAtRiskEmail` are implemented. Extend the pattern, do
   not invent a second one. Two caveats worth knowing: `sendStreakAtRiskEmail` has **zero callers**
   — streak-at-risk goes out as a web push, never as an email, so the function is dead code and not
   evidence that the email ships. And match the **plumbing**, not the styling: those templates carry
   emoji and a heavier layout than the voice rules here allow, so reuse the transport and rewrite
   the markup.

6. **THE COMPLIANCE GATE. This one blocks.** Become has **no unsubscribe infrastructure of any
   kind**: no unsubscribe route, no suppression model, no `List-Unsubscribe` header, nothing.
   (`/api/notifications/unsubscribe` is web push, not email.) Until that is built, **only
   transactional email may send.** Stage 1 is transactional. Stages 2 through 5 are not, and
   shipping one of them today would be a CAN-SPAM violation on the first send and a deliverability
   fire on the second.

   Before any Stage 2-5 send, all of this exists:

   | Requirement | What it means concretely |
   |---|---|
   | Unsubscribe route | A real endpoint that works without a login, in one click, and cannot be undone by a later send |
   | Suppression store | A model checked on **every** non-transactional send, not a flag on `User` that a query might miss |
   | `List-Unsubscribe` header | Plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), so the inbox's own unsubscribe button works |
   | Honoured within 2 days | Gmail and Yahoo's bulk-sender rules require it, and CAN-SPAM allows 10; hold ourselves to 2 |
   | Complaint rate | Stay under 0.3%, target 0.1%. Above 0.3% and delivery degrades for transactional mail too |
   | DMARC **alignment** | Not just "DMARC passes". The visible From domain must align with the authenticated domain |
   | 5,000/day threshold | Crossing 5,000 messages to Gmail in a day triggers the full bulk-sender requirement set |

   The failure mode this gate prevents is specific and expensive: a win-back campaign with no
   unsubscribe generates spam complaints, complaints poison the sending domain, and the domain that
   gets poisoned is the one that also sends the **magic links**. Losing the marketing channel is
   recoverable. Losing the login channel is not.

### Production steps

7. Write the trigger and suppression logic before the copy. Suppression is the harder half.
8. Draft the body to a single action, then delete the paragraph you liked most.
9. Write three subject lines and one preview text per subject. The preview text extends the
   subject, it never repeats it.
10. Write the HTML in the house style: inline styles, one table-free centered column, max width
   600px, a single button, a text fallback link under it. Match the structure already in
   `webapp/lib/email.ts`.
11. Run the deliverability checklist in `references/deliverability.md`.
12. Run the Quality bar below.

### Output buckets (always these five, in this order)

- **The sequence table** — one row per email: name, stage, trigger, delay, goal metric,
  suppression rule, channel check (why email and not push).
- **Full copy per email** — subject, preview text, body, button label, footer.
- **Annotations** — why this subject shape, which principle, which data field it reads.
- **Subject line alternates** — two more per email, each with a one-line rationale.
- **Suppression rules** — the consolidated list, including global caps and the quiet rules.

## Frameworks

Five frameworks, ordered by how much damage getting them wrong does.

### 1. The magic-link email (highest stakes email we send)

This email is the login screen. If it lands in spam, the user cannot use the product at all.
Everything else in this skill is optional by comparison.

**Check for:**
- Does the subject say what the email is, in the words the user just typed? They clicked "sign
  in" ten seconds ago and are scanning for it.
- Is the expiry stated in the body? The link dies in 15 minutes and the user cannot see a clock.
- Is there exactly one button plus a copyable plain URL fallback, for mail apps that strip
  buttons?
- Does it say what to do if they did not request it, without alarming language?
- Does the link point at the right host? The magic-link URL is derived from the **request origin**
  (`webapp/app/api/auth/send-link/route.ts` calls `getRequestOrigin(req)`), so a link requested on
  beta comes back pointing at beta without anything being configured. `NEXT_PUBLIC_APP_URL` is only
  the fallback for sends with no request behind them, such as a cron job. Any email we trigger
  ourselves has to set the host deliberately, because there is no incoming request to derive it
  from.

**Common issues:**
- *Marketing dressing on a transactional email.* A hero image, a tagline, and three feature
  links push the button below the fold and raise the spam score. Strip it.
- *Silent expiry.* The user opens the email 40 minutes later, clicks, sees an error, and
  concludes the app is broken rather than the link.
- *Tab amnesia.* The user requested the link on their laptop and opened the email on their
  phone. The email must work as a standalone entry point, not assume the original tab.

**Strong patterns:**
- Subject: `Sign in to Become` / `Complete your Become registration`. Literal beats clever here,
  always.
- Body line: `This link works for 15 minutes and can be used once.`
- Reassurance line: `If you did not request this, ignore it. Nothing was created.`
- One button, one URL under it, nothing else above the fold.

```
❌ Subject: Your journey starts here ✨
✅ Subject: Sign in to Become
```

### 2. The lifecycle map

Five stages. Each has a different consent basis, a different tone ceiling, and a different
suppression rule. Full table with triggers and timings in `references/lifecycle-map.md`.

**Check for:**
- Does every email belong to exactly one stage? Mixed-stage emails (a receipt with a
  promotion stapled on) underperform both jobs and erode transactional deliverability.
- Does each stage have a stop condition? An activation sequence that keeps sending after the
  user activated is the most common self-inflicted unsubscribe.
- Is the frequency ceiling stated per stage and globally?

**Common issues:**
- *No exit on success.* Day-3 "log your first workout" arrives after they logged three.
  Suppression is a query, not an afterthought.
- *Reactivation on the wrong clock.* A 7-day lapse for someone who trains three days a week is
  a normal week, not a lapse. Read `Schedule` training days, not calendar days.
- *Stage creep.* A weekly recap slowly grows a "what's new" block and becomes a newsletter with
  a recap on top.

**Strong patterns:**
- Activation sequence caps at three emails across day 0 to day 7 and stops on first logged
  session.
- Habit stage is one send per week, the recap, sent the morning after the week closes.
- Reactivation is two emails maximum, then the address goes quiet until the user returns.
- Every non-transactional email carries a one-click unsubscribe that actually works.

### 3. Subject line and preview text

**Check for:**
- Does the subject name a concrete noun from the user's own week? Specific beats clever and
  beats curiosity gaps.
- Is it under roughly 45 characters so it survives a phone's inbox list?
- Does the preview text add a second fact rather than repeating the subject or leaking the
  HTML preheader junk?

**Common issues:**
- *Curiosity-gap bait.* "You won't believe what happened this week" is a one-time trick that
  trains people to ignore the sender.
- *Guilt.* "We noticed you've been slacking" is banned. The user is not lazy, their tools were
  scattered.
- *Empty preview.* An unset preheader shows the first alt text or the literal word "View in
  browser," which reads broken.

**Strong patterns:**

```
❌ Don't lose your progress!            ✅ Your week: 3 sessions, 2 PRs
❌ We miss you                          ✅ Your Push A is still where you left it
❌ Time to get back on track            ✅ Pick your training days for next week
❌ Unlock your potential this week      ✅ Wednesday is your next scheduled session
```

Preview text extends: subject `Your week: 3 sessions, 2 PRs`, preview `Bench went up 5 lb.
Mood held steady. Here is next week.`

### 4. Recap emails from real data

The weekly recap is the strongest email we can send because it is entirely about the reader and
entirely true. It is also the easiest to break, because a recap with a fabricated or empty
number is worse than no recap.

**Check for:**
- Is every number in the email one the user personally generated this week?
- What renders when a field is empty? A user with two sessions and no weight entries must get a
  coherent email, not a row of zeros.
- Does the recap end at a next action rather than a compliment?

**Common issues:**
- *Zero rows.* "Weight change: 0.0 lb" when they logged no weight is a lie of formatting.
  Suppress the row, do not print a zero.
- *Averages of one.* A single weight entry is not a trend. Trend language needs at least three
  points across the week.
- *Comparison shaming.* Never compare a user to other users, and never to their own best week
  in a way that reads as a downgrade.

**Strong patterns:**
- Lead with what happened, close with what is next: `You trained 3 times. Wednesday is your
  next session.`
- Suppress any block with no data instead of rendering an empty state.
- Mirror the in-app recap so the email and the Progress hub tell the same story. The Becoming is
  the in-product recap surface, and the email may reference it once, briefly. It is not the
  theme of the email.

### 5. Deliverability under Nodemailer SMTP

Sending runs through Nodemailer with SMTP credentials resolved at runtime. We have no ESP
reputation dashboard, no seed-list tooling, and no warmup automation. That makes conservative
structure the whole strategy. Full checklist in `references/deliverability.md`.

**Check for:**
- Is the HTML a single centered column with inline styles, under roughly 100 KB, and light on
  images? The existing templates in `webapp/lib/email.ts` are the reference shape.
- Does every link point at one domain, the app domain? Mixed link domains and shorteners are a
  spam signal.
- Is the from-name a real name and the reply-to a monitored address?

**Common issues:**
- *Image-only emails.* A single hero image with the message baked into it scores badly and
  breaks for image-blocked readers.
- *Blasting a large list from a standing-start sender.* Volume spikes on an unwarmed sender are
  the fastest route to the spam folder. Ramp broadcasts.
- *Missing unsubscribe on a non-transactional send.* Legally required and a deliverability
  input. Transactional is exempt, everything else is not.

**Strong patterns:**
- Plain, boring, structural HTML. It is the aesthetic that arrives.
- One CTA button plus a bare URL line under it.
- Send transactional and marketing from clearly distinct subjects and, where possible, distinct
  from-names, so a marketing complaint does not poison the login email.

## Become-specific rules

- **Every user is reachable and every address is verified by definition.** They clicked a link
  in it. Treat that as a responsibility, not a list to mine.
- **Never send a marketing message under a transactional subject.** The magic-link sender is
  load-bearing for authentication and must stay clean.
- **Personalize only from real fields.** `UserProgress` (weight, mood, workout logs, streak,
  active programs), `Schedule` (training days, slot status), and the nutrition collections. If
  the number is not there, cut the sentence.
- **Beta and production share one database.** A test send from the beta channel emails real
  people. Never test a broadcast against live addresses. Use a dummy account.
- **Respect notification preferences across channels.** `UserProgress.notificationPrefs` gates
  push. A user who muted streak pushes should not receive the same nudge by email instead.
- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today
  and no pricing exists. Never invent a price, a tier, a trial length, or a discount.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
  "(beta)". Email images are heavy anyway. Prefer none.
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline
  theme.** A recap email may link to it once.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or
  pound counts, no body-shaming, no before/after framing that implies a guaranteed outcome.
- **Statistics are tiered.** Any benchmark used to steer a decision is labelled Tier A
  (platform-published or large-sample), Tier B (named case study), or Tier C (vendor blog).
  No tier may ever be restated as a Become results claim in public copy.
- **Voice:** second person, present tense, active. Near-zero em dashes in deliverable
  copy. No "journey," "unlock
  your potential," "seamless," "effortless," "crush it," "no excuses," "just," "simply." Jon
  speaks in first person only when the email is signed by him, and then `coach-brand-voice`
  owns the register.

## Quality bar

Run this against your own output before returning. Every line must be a yes.

- [ ] Every email has a named trigger, a delay, one action, and a suppression rule.
- [ ] The activation sequence stops when the user activates.
- [ ] No number appears that the user did not generate; empty blocks are suppressed, not zeroed.
- [ ] Subject under ~45 characters, preview text adds a new fact.
- [ ] Zero guilt, shame, or fake-urgency framing anywhere in the set.
- [ ] **Nothing outside Stage 1 is marked shippable until the unsubscribe route, the suppression
      store, and the `List-Unsubscribe` / one-click headers exist.** Design them, label them
      blocked, do not send them.
- [ ] Non-transactional emails carry a working unsubscribe; transactional ones do not carry
      marketing.
- [ ] Magic-link email states the 15-minute expiry, has one button plus a plain URL, and resolves
      its host from the request origin, with `NEXT_PUBLIC_APP_URL` named only as the fallback.
- [ ] HTML is a single inline-styled column, image-light, one link domain.
- [ ] No invented pricing, results, testimonials, or counts. No medical claims.
- [ ] Near-zero em dashes, no banned words, no emoji in product-voice body copy.
- [ ] Every cited benchmark carries its tier label and is not restated as a Become claim.

## Related skills

| Skill | Use it when |
|---|---|
| `signup-activation` | The drop-off is in the flow itself, not the email: verify handoff, onboarding order, first log. |
| `push-notifications` | The message is short, time-boxed, and better as a browser nudge than an inbox item. |
| `copywriting` | You need the words from a blank page and the surface is not an email. |
| `launch-campaign` | The send is one beat of a dated launch with other channels around it. |
| `analytics-tracking` | You need the open, click, and activation events defined before you can judge the sequence. |

Reference files: `references/lifecycle-map.md` for the full stage table with triggers and
timings, `references/subject-lines.md` for the pattern bank and length specs, and
`references/deliverability.md` for the SMTP checklist.

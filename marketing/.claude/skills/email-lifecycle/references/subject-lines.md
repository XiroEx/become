# Subject Lines and Preview Text

## Length specs

Character targets here are **Tier C**: observed truncation across common clients, not a documented
limit from any mail provider, and they vary by device, orientation, and font size. Use them as
budgets, not as specs, and never cite them as a finding.

| Field | Target | Hard ceiling | Why |
|---|---|---|---|
| Subject | 28-45 characters | 60 | A phone inbox truncates around 40. Front-load the noun. |
| Preview text | 40-90 characters | 140 | Extends the subject in the list view. Gmail shows roughly 90 on mobile. |
| From name | `Become` or `Jon at Become` | 25 | Consistent. A changing from-name reads as a compromised sender. |
| Button label | 2-4 words | 30 | Verb plus object. |

Preview text is a separate field, not the first line of the body. If it is unset, the client
shows whatever HTML comes first, which is usually alt text or "View in browser." Always set it.

---

## The four subject shapes that work for Become

Ordered by how reliably they earn an open.

### 1. The user's own data

The strongest shape we have, because it is unfakeable and about them.

```
❌ Your weekly progress report
✅ Your week: 3 sessions, 2 PRs
❌ Check out how you did
✅ Bench went up 5 lb this week
```

Only usable when the number is real. Suppress the send if the week is empty.

### 2. The literal transactional

For anything the user just requested. Clever loses here, every time.

```
❌ Your journey starts here ✨
✅ Sign in to Become
❌ One more step to greatness
✅ Complete your Become registration
```

### 3. The concrete next thing

Names the specific object waiting for them.

```
❌ Time to get back on track
✅ Wednesday is your next session
❌ Don't forget to work out!
✅ Push A is queued for tomorrow
```

### 4. The mechanism

Used for feature announcements. Sells the thing the app does, not a feeling.

```
❌ Introducing an exciting new way to train
✅ Your last weight is on screen now
❌ Nutrition tracking, reimagined
✅ Photograph the plate, get the whole breakdown
```

---

## Banned subject patterns

| Pattern | Example | Why it is out |
|---|---|---|
| Guilt | "We noticed you've been slacking" | Shaming. The user is not lazy, their tools were scattered. |
| Fake urgency | "Last chance!" on a free product with no deadline | Not true. Nothing expires. |
| Curiosity gap | "You won't believe your week" | Trains people to ignore the sender after one open. |
| Fake reply | "Re: your training" | Deceptive, and a spam-filter trigger. |
| ALL CAPS or `!!!` | "DON'T MISS THIS!!!" | Spam signal and off-brand. |
| Invented scarcity | "Only 50 spots left" | Fabricated. There are no spots. |
| Body copy | "Lose 10 lb by summer" | Promised timeline and pound count. Prohibited outright. |
| Emoji stacking | "🔥🔥 Your streak 🔥🔥" | At most one emoji, and only where it carries meaning. Product-voice body copy uses none. |

---

## Subject and preview pairs, by email

Each subject gets a preview that adds a **second fact**, never a restatement.

**Magic link**
- Subject: `Sign in to Become`
- Preview: `This link works for 15 minutes and can be used once.`

**Welcome (A1)**
- Subject: `You're in. Here's the first step.`
- Preview: `Generate a session or pick a coach-built program. Two minutes.`
- Alt A: `Start with one session` — narrower ask, better if activation is the bottleneck.
- Alt B: `Your training, nutrition, and mind in one place` — positioning-forward, use when the
  audience arrived from a comparison page and needs the category reinforced.

**Training days (A2)**
- Subject: `Pick the days you train`
- Preview: `We build the week around them and keep the calendar honest.`

**First log (A3)**
- Subject: `One logged set is the whole habit`
- Preview: `Open any session, log one set, close the app. That counts.`

**Weekly recap**
- Subject: `Your week: 3 sessions, 2 PRs` (numbers injected, never templated placeholders)
- Preview: `Mood held steady. Wednesday is next.`
- Alt A: `3 sessions, 2 PRs, one steady week` — rhythmic, use for a strong week.
- Alt B: `Here's your week` — neutral fallback when the data is thin but non-empty.

**Win-back R1**
- Subject: `Push A is still where you left it`
- Preview: `Nothing expired. Pick it up on any day that works.`

**Win-back R2**
- Subject: `Want a shorter week?`
- Preview: `Drop to two training days and the plan reshapes around it.`

**Feature launch**
- Subject: `One photo, the whole plate`
- Preview: `Shoot the plate in Nutrition. It comes back itemized, per item.`

---

## Testing subjects at our volume

List size is small. A classic split test on subject lines will almost never reach significance.
Do the honest version instead:

1. Ship the better-reasoned subject.
2. Record open and click rate for that send.
3. Compare against the trailing median for the same email type, not against a simultaneous split.
4. Only call a difference real if it repeats across three sends.

See `ab-testing` for the sizing math and the low-traffic playbook. Any benchmark you quote to
justify a choice must carry its tier label (Tier A platform-published, Tier B named case study,
Tier C vendor blog) and may never be restated as a Become results claim.

# Context Document Template

Copy this whole file to `marketing/.agents/become-context.md` and edit in place. It is
pre-filled with what is already verified as of 2026-08-25. Correct it, extend it, retag it.
Do not delete a section because it is thin. An empty section with an open question is more
useful than a missing one.

Tag legend, used on every claim:
`[verified in repo]` · `[verified with Jon]` · `[assumption, unvalidated]`

---

## 1. Overview and current stage

Become (`become.redbtn.io`) is a mobile-first PWA fitness coaching app built around coach
**Jon Don**. It puts training, nutrition, mind, and progress in one place, with coach-built
programs and an AI generator behind them. `[verified in repo]`

- Delivery: installable PWA. No native app, no App Store or Play listing. `[verified in repo]`
- Signup: email magic link, with Google sign-in and passkeys alongside. No password, no credit
  card. `[verified in repo]`
- Price: free today. No pricing, tiers, trials, or discounts exist. `[verified in repo]`
- Notifications: web push exists. `[verified in repo]`
- Stage: pre-revenue, small audience, coach-led credibility is the main asset.
- Channels: production `become.redbtn.io` from `main`; beta `become-beta.redbtn.io` from `beta`.
  Both share one database, so beta data is production data. `[verified in repo]`
- Team: effectively one builder plus Jon plus agents. Any plan must be executable at that size.

**Open:** actual signup and weekly-active counts. Do not state a number anywhere until it is
reproducible, and never state it in public copy at all.

## 2. Product truth by hub

One row per hub. The mechanic column is what marketing sells, because it is what is hard to copy.

| Hub | Route | What you do | The mechanic |
|---|---|---|---|
| Dashboard | `/dashboard` | See the day at a glance | Streaks, mood, weight, water, customizable tiles |
| Training | `/dashboard/workout` | Follow or build a plan | Coach-built multi-phase programs; AI session and program generator; demo clips on the big lifts; LIVE mode that logs the set as you train, with rest timers, last-session numbers, and PR history on screen |
| Nutrition | `/dashboard/nutrition` | Log what you ate | Photo logging that itemizes a whole plate; barcode scan; personal calorie and macro targets |
| Mind | `/dashboard/mind` | Do a short practice | Guided sessions, mood tracking, identity work |
| Progress and The Becoming | `/dashboard/progress` | See the trend | Weight and strength trends, plus a weekly recap that writes your week back to you |

All `[verified in repo]`.

**Details worth quoting in copy** `[verified in repo]`:
- Programs are multi-phase, with phases containing workouts containing exercises. Twelve-week
  programs exist.
- Exercise grouping supports supersets, circuits, trisets, giant sets, EMOM, AMRAP.
- The generator produces either a single session or a full program, filtered by focus, level, and
  the equipment actually available.
- 39 of the 132 exercises ship a demo clip — the big lifts are covered. Never claim every exercise
  has one. (`webapp/public/exercises/` holds 42 files: 39 `.mov` plus 3 `.mp4` duplicates.)

**Not available today.** Do not imply any of these: a native app, a wearable integration, heart
rate, a marketplace, a paid tier, or coaching over chat with a human (the chat route ships behind
an admin-gated "Coming Soon").

**Small and early, not absent.** Community, groups, and events surfaces exist in-app
(`webapp/app/api/{groups,events}`, `webapp/app/dashboard/{community,groups,events}`), as does a
sleep endpoint (`webapp/app/api/sleep`). Do not list them as missing and do not build a campaign
on them either; describe them as early if they come up at all.

**Drift rule.** When the app exceeds this hub list, update this doc first, then the claim. A
shipped feature that is not written down here is not marketable yet.

## 3. ICP

Behavioural, not demographic. Someone is a fit when most of these are true:

- Already trains or has repeatedly tried to, and owns the goal. `[assumption, unvalidated]`
- Has two or more fitness or nutrition apps installed and uses none of them consistently.
  `[assumption, unvalidated]`
- Wants the plan decided for them. Choosing the workout is the part that stalls them.
  `[assumption, unvalidated]`
- Will not pay for or schedule around an in-person trainer. `[assumption, unvalidated]`
- Owns a phone they train with. Nothing about Become works well on desktop first. `[verified in repo]`

**Anti-persona.** Do not spend a dollar or a Reel on: competitive lifters who want a
spreadsheet and a bar-speed sensor; people looking for a medical or clinical program; people who
want a human coach in a DM every day; anyone shopping on price, because there is no price to shop.

## 4. Personas

Name them for the moment, not the demographic. Two or three, no more.

**The App Juggler.** Trains a few times a week. Has a workout logger, a calorie app, and a notes
file with the actual program in it. Nothing talks to anything. Looks for a tool the week the
notes file gets out of sync. `[assumption, unvalidated]`

**The Restarter.** Starts on a Monday, is consistent for nine days, misses two, and quits.
Believes the problem is willpower. Looks for a tool the week after a restart fails again.
`[assumption, unvalidated]`

**The Coached-Out.** Had a trainer, liked the structure, cannot justify the cost or the schedule.
Wants somebody else's plan without the standing appointment. `[assumption, unvalidated]`

For each, record: the trigger moment, the first thing they would search, and the one screen that
would sell them.

## 5. Pains

In their words wherever possible. Paraphrase is a downgrade.

- "I never know what to do when I get to the gym."
- "I log my workout in one app and my food in another and I still have no idea if it's working."
- "I did great for two weeks then fell off."
- "I don't want to pay a trainer two hundred a month."
- "I hate logging food."

All currently `[assumption, unvalidated]` until pulled from real reviews, DMs, or interviews. See
`competitor-analysis` and its review-mining framework for a way to source real ones.

## 6. Competitive alternatives

What they would do if Become did not exist. Includes doing nothing. Detail in the
`positioning` skill's `references/alternatives-map.md`.

| Alternative | Why they pick it | Where it fails them |
|---|---|---|
| Nothing, plus the Notes app | Free, zero setup | No structure, no memory, no feedback |
| Free YouTube programs | Free, credible faces | No progression, nothing logged |
| A stitched stack (a logger + a calorie app + a meditation app) | Each is best-in-class | Four logins, no shared picture, four habits to keep |
| An in-person trainer | Accountability, real coaching | Cost, scheduling, geography |
| A general AI chatbot | Instant plan, conversational | Nothing persists, no video, nothing logged, no progression |

## 7. Differentiation

Attribute (a capability), then value (what it produces), then proof (where to see it).
Never write a value with no attribute behind it.

| Attribute | Value | Proof |
|---|---|---|
| Coach-built multi-phase programs plus an AI generator | Structure when you want it, a session in seconds when you do not | `webapp/public/screenshots/v2/workout-hub-light.webp`, `generate-light.webp` |
| LIVE mode logs the set while you train | Last session's numbers and your PR sit on screen mid-set | `workout-log-dark.webp` |
| Photo logging itemizes a whole plate | Logging a meal is one photo, not six searches | Filmed or captured demo required. `nutrition-meal-light.webp` shows an itemized day, but those meals were typed through food search, not photographed |
| Five hubs on one dashboard | One app instead of a stack of them | `dashboard-light.webp` |
| Weekly recap writes your week back to you | Evidence about yourself instead of a wall of numbers | `progress-light.webp` is the Training Log (volume chart, workout history, PRs). The weight and mood trends live on `/dashboard` |

## 8. Objections and anti-persona

| Objection | Honest answer today |
|---|---|
| "Is it actually free?" | Free today. Do not imply a future price either way. |
| "No password? Is that safe?" | A one-time link to your email, expires in fifteen minutes. |
| "Do I need equipment?" | The generator filters to the equipment in front of you. |
| "Does it log my sets for me?" | No. You log the set; LIVE mode keeps last session's numbers and your PR on screen so it is one tap, not a memory test. |
| "It's not in the App Store." | Installs from the browser in one tap. Web push works. |
| "I already have MyFitnessPal." | Not a rip-and-replace pitch. The pitch is the stack, not the app. |

Anti-persona: see section 3.

## 9. Customer language

Verbatim only. Keep the grammar. Sources: app store reviews of competitors, subreddit threads,
Jon's DMs, support messages. Every entry gets a source and a date.

```
"" — source, date
```

This section starts empty on purpose. Filling it is the highest-value research task on the list,
and `competitor-analysis` review mining is the cheapest way to start.

## 10. Brand and voice

Full detail in the `become-context` skill's `references/voice-guide.md`. Summary:

- Brand words: simple, sleek, innovative, empowering.
- Primary green `#16a34a` / `#22c55e` for training, product, primary CTA. Violet for AI and Mind.
  Gold for streaks and The Becoming. Type is Geist. Light and dark are both first-class.
- Voice: confident, concrete, zero fluff, empowering not preachy. "Evidence, not vibes."
- Product speaks in second person. Jon speaks in first person. Never mixed in one block.

## 11. Proof points we can honestly make

**Can say today:**
- Programs are built by a real coach, Jon Don, and are multi-phase with progression.
- The big lifts have a demo clip. 39 of the 132 exercises ship one; never say every exercise does.
- LIVE mode logs the set as you train, with rest timers, last-session numbers, and PRs on screen.
- A photo of a plate returns its items.
- Signup is one email field — or Google, or a passkey — with no password and no card either way.
- It installs to the home screen and can send push notifications.
- All four practices live on one dashboard.

**Cannot say, ever, until it is real and reproducible:** any user count, any retention or results
figure, any testimonial, any star rating, any "trusted by," any pounds-lost or weeks-to-result
claim, any price or discount, any comparison claim we have not verified this month.

Read `webapp/components/landing/BecomeLanding.tsx` before editing this section. Whatever the
landing page says is a claim we are already making in public.

## 12. Goals and constraints

**Current goal.** State one, with a number and a date, or write "not set" and flag it. Everything
in `marketing-plan` derives from this line.

**Hard constraints.** See the `become-context` skill's `references/constraints.md`. Short form:
no fabricated testimonials, counts, results, or pricing; captures only from the dummy-account
pipeline and never showing a bug, an empty state, or "(beta)"; no personal camera-roll photos of
the coach; The Becoming is at most one mention; health claims stay responsible.

---

## Document version

`0.1.0` — not yet verified against production. Replace this line on first real build.

## Changelog

- YYYY-MM-DD — Initial build from the template.

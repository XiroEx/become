# Become public launch - Tuesday 2026-09-01

Master plan. Produced by the `launch-campaign` skill on Tue 2026-08-25 (T-7).
All times **America/New_York**. Owners: **George** (builder, ops), **Jon** (coach, face, owns his
IG), **agent** (a marketing-skill run, invoked as `become-marketing`).

Companion documents in this folder:

| File | Holds | Owner |
|---|---|---|
| `jon-checklist.md` | Everything Jon personally does, day by day | Jon |
| `george-checklist.md` | Dev tasks, account specs, submission mechanics, launch-day ops | George |
| `accounts-setup.md` | Platform choice, ranked handle candidates, profile copy, bootstrap tasks | agent (`social-strategy`) |
| `listings.md` | Directory fields, install surfaces, the Product Hunt kit | agent (`web-app-listing`) |
| `reels-pack.md` + `carousels.md` | Beat tables, shot lists, carousel decks (landed under these names, not "reels-scripts.md") | agent |
| `content-calendar.md` | Dated rows Tue 8/25 through Mon 9/14, asset per row. **Its §2 reconciliation table (R-1 to R-13) is binding wherever documents disagree on a date, slot or format.** | agent |
| `captions-week1.md` | Final captions 8/29 to 9/7, caption source of record | agent |
| `launch-day-copy.md` | Sceptical FAQ, bios pointer, push-copy pointer, DM replies (thin index; payloads live where their owner file keeps them) | agent |
| `lifecycle.md` | The compliance decision, the push (copy, guard, runbook), week-one activation | agent |
| `assets-manifest.md` | What was rendered 8/25, verified paths, TO-PRODUCE list | agent |
| `measurement.md` | UTM register, baseline numbers, gate log. **Does not exist yet — George creates it Wed 8/26 09:00.** | George |

Where two documents touch the same decision, the owner wins: **handles and platform choice belong to
`accounts-setup.md`; the Product Hunt date and every directory field belong to `listings.md`.** This
document owns the date, the gate, the channel split, the run of show, and the metrics. If a parallel
agent lands a file under a different name, **the Asset Manifest in section 9 is the index of record**
and gets corrected at the Fri 8/28 freeze.

---

## 1. Launch thesis

Become has been live at `become.redbtn.io` for months and nobody has been told. This is not a
feature launch. It is the first time the product is pointed at people on purpose, on one date, from
a standing start of **zero brand social presence**.

Seven days from zero does not build an audience. It builds the surfaces an audience can land on,
and it spends the one real asset we have: **Jon's warm audience and his existing clients.** Every
other channel in this plan is scaffolding that will pay in October, not on 9/1.

The thesis, stated so it can be wrong: *a coach with a real relationship to a few hundred people
can move more of them into a free product in one day than a brand-new brand handle can move in a
quarter. So the plan puts Jon in front and treats the brand handle as a credibility surface, not a
distribution channel.*

**The one-sentence claim** (every asset must reduce to this):

> One app: coach-built programs, set-by-set logging, a photo of your plate, and a weekly recap that
> writes your week back to you. Free, in your browser, no app store.

**The single CTA:** `become.redbtn.io`. One email field, no password, no card. The only permitted
variant is the members-facing push, which lands on `/dashboard/nutrition` — `lifecycle.md` §2 owns
the push payload and its runbook, and its deltas from earlier sketches are binding (url
`/dashboard/nutrition`, preference key `mealReminder`, local window 12:00-14:00, three idempotent
invokes at 07:30/12:30/15:30 ET).

## 2. Honest goals

Per the brief. These are the goals; section 11 holds the one number we score.

| # | Goal | Done looks like on Tue 9/1 |
|---|---|---|
| 1 | Surfaces exist and look alive | Brand IG has a bio, a link, and 6 posts already in the grid. TikTok handle reserved. Two directory listings live or submitted. Landing page unchanged and working. |
| 2 | Jon's warm audience is activated | Jon posts 3 times on 9/1, replies to every comment and DM until 20:00, and has personally messaged 15 named warm clients. |
| 3 | The content flywheel is running | One film batch shot Sat 8/29 produced 11 items. `content-calendar.md` is loaded and sourced through Sun 9/13. |
| 4 | Launch day is one coordinated moment | Push, Jon's posts, brand posts, and directory submissions all land inside one 9-hour window against one CTA and one claim. |
| 5 | Measurement exists at least minimally | Daily signup counts are readable from the app database, a baseline is recorded on Wed 8/26, and every outbound link carries a UTM. |

**What we are deliberately not doing.** Named, so nobody quietly adds them back:

- **No Product Hunt on 9/1.** One launch per product, the permanent page matters more than the day,
  and the skill's own rule is not to staple PH onto a launch already running elsewhere. PH prep
  starts Wed 9/2; recommended PH date **Tue 2026-09-22**.
- **No marketing email.** See decision D2.
- **No Reddit or forum posting.** Tier 3 requires weeks of genuine participation and we have none.
  George starts a participation clock on 8/26 so it is available for the PH launch, not this one.
- **No creators, no press, no paid.** Nothing is secured, and unsecured borrowed reach is not a
  channel.
- **No SEO or GEO content.** Out of scope per the brief; domain decision is pending.
- **No new product features.** The sanctioned code list for launch week, complete (anything not on
  it does not ship before Wed 9/2): the push guard + settings sublabel (`lifecycle.md` §3, Thu),
  the analytics floor + Umami script tag (D3, Wed/Thu), F1 verify-handoff copy (`lifecycle.md` §5,
  Thu, 45 min), F2 option (a) notification-prompt gate (`lifecycle.md` §5, Fri, 30 min), and the
  `listings.md` §4 metadata branch DEV-1/2/3/5/6 + the DEV-4 OG image commit (one branch
  `agent/alphaSystem-listing-metadata`, merged by Mon 8/31 before the 15:00 freeze — without it
  every shared launch link unfurls as a bare URL). All are copy/metadata/guard work; none is a
  feature.

## 3. Decisions locked

| # | Decision | Chosen | Alternative, in one line |
|---|---|---|---|
| D1 | Date | **Tue 2026-09-01.** Holds only if the four blocking gate items close by Fri 8/28. | Slip to Tue 9/8, which costs nothing external because nothing is announced before 8/28. |
| D2 | Email vs push-only | **Push + in-app only.** No send through `webapp/lib/email.ts`. | Build the unsubscribe route this week and email ~60 people, which risks the domain that carries the magic link for a handful of activations. |
| D3 | Analytics | **Floor now, tool after.** Floor = daily signup counts straight out of the app database, baselined Wed 8/26 (30 minutes, zero build). Target = a Plausible-class self-hosted tool (Umami) standing up Thu 8/27 for referrers and UTM campaigns. `/api/track` is deferred to the week of 9/8. | Skip the tool and run launch week on database counts alone, which tells you how many signed up and nothing about where they came from. |
| D4 | Product Hunt | **Not on 9/1. Deferred to Tue 2026-10-06**, the date owned by `listings.md`, which holds the full submission kit. Prep starts T+1. | Submit on 9/1 and get a thin listing on a day already full, with one shot spent. |
| D5 | Push send window | **12:30 local, not 09:00.** The 07:00-11:00 window already carries the workout and mind reminders; 17:00-20:00 carries the goal and meal nudges. Midday is the only window with room. | 09:00 as the generic template says, landing third in a member's tray. |
| D6 | `robots.ts` / `sitemap.ts` | **CUT at the 8/25 review (capacity).** Saturday already runs 6+ hours for George (film batch, cuts, e2e retest). Moves to the week of 9/8 with the other deferred builds. | Was: optional Sat 8/29. Nothing in this launch depends on it. |
| D7 | Brand handle role | **Credibility surface, not a distribution channel.** Zero followers on 9/1 means near-zero reach on 9/1. It exists so a stranger who checks us out finds a live account. | Expect the brand handle to drive signups, then read launch day as a failure when it does not. |
| D8 | Audience | **Both, weighted to strangers-via-Jon.** Existing ~60 members get one push and nothing else. | Members-only, which wastes the only day Jon will post three times. |

On D3, the `analytics-tracking` reference asks for this line verbatim:

> Final tool selection is George's call. This is a recommendation, not a decision, and nothing in
> the instrumentation tasks below depends on which option is chosen - the event names, properties,
> and the `track()` wrapper are identical either way.

On D2, one carve-out that is not a bulk send and does not touch the app's sending domain: **Jon may
personally message up to 15 warm clients one at a time**, hand-typed, from his own IG DMs or his own
mailbox. That is ordinary correspondence between a coach and his clients, not a campaign. It is in
`jon-checklist.md` as a named list of 15. It must not become a template pasted 60 times, and it must
not go through the app.

## 4. Readiness gate - run for real, Tue 2026-08-25

Verdict per row. A RED row does not automatically move the date when it has a named owner and a
date-to-green inside this week; a RED row still open at the Fri 8/28 freeze does.

### Section 1 - The thing is real

| # | Check | Verdict | Note | Owner | Date to green |
|---|---|---|---|---|---|
| 1.1 | Live on `become.redbtn.io`, not only beta | **GREEN** | Production workspace `69ab83dd21070736089dc29d` tracks `main` with autoDeploy. Nothing ships to `main` between 8/28 and 9/1. | George | done |
| 1.2 | Someone personally used it on a phone today | **RED** | No human has walked the product today. An agent cannot close this row. | George + Jon | **Tue 8/25** |
| 1.3 | Works in light and dark | **RED (unverified)** | Two known theme defects are open in the capture manifest: Weekly Volume bars invisible in dark (`ProgressClient.tsx:560`), Generate range-slider track light in dark. Neither is fixed. | George | Tue 8/25 verify, Thu 8/27 decide fix-or-avoid |
| 1.4 | Works at 390x844 with safe-area insets | **GREEN** | Capture pipeline shoots this viewport and the PWA ships safe-area utilities. | - | done |
| 1.5 | Works for a **new** account with no history | **RED** | This is the launch audience. Nobody has run a cold signup this month. Progress and Read Your Week surfaces are single-point on a fresh account by design (weight and mood cannot be backdated). | George | **Tue 8/25**, repeat Sat 8/29 |
| 1.6 | No "(beta)", dev banner, or placeholder copy in the flow | **RED (unverified)** | Verified in the same phone pass as 1.2. | George | Tue 8/25 |
| 1.7 | Obvious failure case degrades gracefully | **AMBER** | Expired magic link and a signup with a typo'd address are the two the launch will find. Test both. | George | Wed 8/26 |

### Section 2 - Captures exist and are clean

| # | Check | Verdict | Note | Owner | Date to green |
|---|---|---|---|---|---|
| 2.1 | Manifest read before commissioning | **GREEN** | `webapp/public/screenshots/v2/manifest.json` read 8/25. 15 webp, 8 screens. | agent | done |
| 2.2 | A capture shows populated, realistic state | **GREEN** | Dashboard, workout-hub, generate, nutrition, mind, progress all seeded. | - | done |
| 2.3 | Light and dark twins where both are used | **RED** | `workout-log` is **dark only**. LIVE mode is the strongest mechanism we lead with and has no light twin. | George | Fri 8/28 (or the light-mode LIVE shot is cut from the launch set) |
| 2.4 | No bug, no zero row, nothing mid-animation | **AMBER** | Three defects recorded in `knownIssues`; two were DOM-patched at capture time. Any new capture inherits them. | George | Fri 8/28 |
| 2.5 | Capture-time patching disclosed, bug filed | **GREEN** | Disclosed in `knownIssues`. All three still open, which is honest and recorded. | - | done |
| 2.6 | Captures came from dummy accounts | **GREEN** | Documented pipeline, dummy accounts only. | - | done |
| 2.7 | Renders are current | **GREEN — closed Tue 8/25** | Full re-render done in this worktree (`assets-manifest.md`): 49 truth-passed stills, 0 dimension mismatches, launch rows 47-49 added. The pre-truth-pass slugs never existed here; they survive only in the main checkout at `/home/alpha/code/become/marketing/out/` — the §6 do-not-ship list still applies there. Residuals, decided Fri 8/28: F3 (metric chips on `Reviewed04`/`Reviewed11`), F6 (pillar palette), F7 (Arial not Geist, accepted for launch unless George objects). | George decides F3/F6 | done 8/25; F3/F6 by Fri 8/28 |
| 2.8 | Video library passes the same truth pass | **GREEN — closed Tue 8/25, one open ask** | `reviewedCampaigns.ts` truth-passed: `Reviewed10` recast as `10-cues-on-the-lift` (no chat thread, verified in the pass-3 sheet). Still open: `Reviewed13` ("30-Day Shred") / `Reviewed14` ("Build serious muscle") program names — Jon confirms Wed 8/26 (O-5, check V4) or both stay out. | Jon confirms names | Wed 8/26 |
| 2.9 | Renders exist in this worktree | **GREEN — closed Tue 8/25** | `marketing/out/` rendered fresh here: 94 images, 20 videos, 94 MB, all launch-referenced paths verified on disk at the 8/25 review. Still gitignored; the Wed 8/26 12:00 durable-copy step stands. | George | copy Wed 8/26 |

### Section 3 - The destination is ready

| # | Check | Verdict | Note | Owner | Date to green |
|---|---|---|---|---|---|
| 3.1 | Landing or in-app surface describes what we promise | **GREEN** | Landing v2 shipped 8/24 with sections `why`, `dashboard`, `training`, `nutrition`, `mind`, `progress`, `coach`, `how`. It already says every thing the launch claims. | - | done |
| 3.2 | Post hook, landing first line, and CTA make the same promise | **AMBER** | Landing is fixed and good. The captions do not exist yet, so this can only be checked once `launch-day-copy.md` lands. | agent, then George | Sun 8/30 |
| 3.3 | Signup path works end to end on a phone right now | **RED** | Untested this week. Highest-cost possible failure. | George | Tue 8/25, retest Mon 8/31 |
| 3.4 | Magic-link email arrives and the link works | **RED** | Same. Note the link host derives from the request origin, so a link requested on beta comes back pointing at beta. Test from `become.redbtn.io` only. | George | Tue 8/25, retest Mon 8/31 |
| 3.5 | Share and invite links land somewhere better than a cold homepage | **AMBER** | `/share` exists. Launch links all point at the root landing, which is the right destination for strangers. No change needed. | - | accepted |

### Section 4 - Measurement is live

| # | Check | Verdict | Note | Owner | Date to green |
|---|---|---|---|---|---|
| 4.1 | Primary metric defined and readable | **RED → GREEN by Wed 8/26** | Defined in section 11. Readable today only as a database count. | George | Wed 8/26 |
| 4.2 | The event proving usage fires | **RED** | No analytics events exist anywhere in the repo. No `/api/track`, no tool. Proxy for launch week: a `UserProgress` document with at least one workout, weight, mood, or meal entry, counted by aggregation. | George | Wed 8/26 (proxy), week of 9/8 (real) |
| 4.3 | UTM convention agreed for every outbound link | **RED → GREEN by Fri 8/28** | Grammar is fixed (section 8). Campaign is `202609_public_launch`. Every link minted before the freeze and recorded in `measurement.md`. | agent mints, George pastes | Fri 8/28 |
| 4.4 | Baseline recorded **before** launch | **RED** | The row everyone forgets and the one that makes the T+7 review meaningful. | George | **Wed 8/26** |
| 4.5 | Beta and production traffic distinguishable | **AMBER** | One database, two code channels. Beta traffic is negligible and nothing points at it. Accepted risk: do not publish a beta link anywhere. | George | accepted |

**The minimal measurement fix, chosen (per D3 and `analytics-tracking/references/tooling.md`).**
Two layers, in this order, because they close different rows:

- **The floor, Wed 8/26, 30 minutes, no code.** George runs one aggregation against the app
  database grouping `User.createdAt` by day for the trailing 28 days, and one counting users with
  any entry in `UserProgress`. He writes both numbers into `measurement.md`. This closes 4.1 and
  4.4 and makes the T+7 review possible even if everything else slips. Never paste the connection
  string into any file.
- **The upgrade, Thu 8/27, about two hours.** A Plausible-class self-hosted tool (Umami is the
  cheapest of the three) behind a script tag on the landing page. Cookieless, no consent banner, no
  health data leaves the app. It closes 4.3's read side, which is the only way to answer "did Jon's
  post work" on 9/2. Rule that travels with it: **`user_id` and nothing else, ever.** No email, no
  weight, no mood, no meal contents in a property, a URL, or a page title.
- **Not in launch week:** `/api/track` into our own Mongo. It is the durable answer and it is a
  build. Week of 9/8.

### Section 5 - The humans are ready

| # | Check | Verdict | Note | Owner | Date to green |
|---|---|---|---|---|---|
| 5.1 | Someone owns replies on launch day, by name, hours blocked | **RED → GREEN by Mon 8/31** | Jon owns his own comments and DMs 09:00-20:00. George owns the brand handle and anything technical. Both blocks go in the calendar on 8/31. | Jon, George | Mon 8/31 |
| 5.2 | Sceptical FAQ written | **RED** | Six questions, in `launch-day-copy.md`: is it really free, no password is that safe, does it count my reps, where does my food photo go, is it in the App Store, do I need equipment. Answer the limits honestly. | agent | Thu 8/27 |
| 5.3 | Jon knows the date and what he is posting | **RED** | He has not seen this plan. Nothing else matters if this stays red. | George hands over `jon-checklist.md` **today** | **Tue 8/25** |
| 5.4 | Support path for "it did not work for me" | **RED** | There is no support address on the launch surface. Minimum viable: Jon's DMs on launch day plus a monitored reply-to. | George | Thu 8/27 |
| 5.5 | Every claim in every asset checked against product truth | **RED** | Blocked on assets existing. Runs as one pass at the Fri 8/28 freeze. | agent, George signs | Fri 8/28 |

### Section 6 - Constraint compliance

Run in full at the Fri 8/28 freeze against every asset in the manifest. Status today:

- [x] No fabricated testimonials, user counts, or results claims - **nothing written yet carries one; the ban is repeated in every brief.**
- [x] No pricing, tier, trial, or discount - **"Free" is the only permitted answer, including on directory forms where "Freemium" is the tempting wrong click.**
- [x] No promised timelines, pound counts, medical claims, before/after framing.
- [x] No body-shaming, no hustle or guilt framing.
- [x] No personal camera-roll photos of Jon. Everything he appears in is filmed for purpose on Sat 8/29.
- [x] The Becoming appears **once**, in the T+6 Read Your Week post, and is not the headline theme.
- [ ] No "(beta)" anywhere - **pending the 8/25 phone pass and the 8/28 asset sweep.**
- [x] Benchmarks carry a tier label and are never restated as a Become claim. The only benchmark in this plan is the click-through heuristic in section 11, labelled Tier C.
- [ ] Light and dark creative both exist - **RED on LIVE mode (2.3).**
- [x] No secrets, tokens, or credentials in any file in this folder.

### The verdict

**AMBER, holding the date.**

The product is real, live, and already described accurately by its own landing page. Nothing in the
gate says the thing we would be launching is broken. What the gate says is that **nobody has
checked it this week, the measurement layer does not exist, and three named render files carry
pre-truth-pass copy.** All of those have a named owner and a path inside this week.

This is not the skill's members-only AMBER. It is a conditional GREEN with four blocking items:

| Blocker | Owner | Must close by |
|---|---|---|
| 1.2 / 1.5 / 1.6 - the phone pass, including one cold signup on a fresh address | George | **Tue 8/25, 22:00** |
| 3.3 / 3.4 - signup and magic link end to end on production | George | **Tue 8/25, 22:00** |
| 4.4 - the baseline number recorded | George | **Wed 8/26, 22:00** |
| ~~2.7 / 2.8 - the stale renders re-rendered and `reviewedCampaigns.ts` truth-passed~~ **CLOSED Tue 8/25** (`assets-manifest.md`); only O-5 (program names, Jon, Wed) and F3/F6 (Fri) remain from it | George + agent | done |

**If 1.2, 1.5, 3.3, or 3.4 fails tonight, the date moves to Tue 2026-09-08 and this document is
re-dated.** That decision costs nothing external, because nothing is announced to anyone outside
George and Jon before Fri 8/28.

The remaining REDs (2.3 light-mode LIVE capture, 5.2 FAQ, 5.4 support path) are scoped to close by
the freeze. If 2.3 does not close, the LIVE-mode light shot is cut from the launch set and the
mechanism is carried by the dark capture and the filmed screen recording. That is a cut line, not a
compression.

## 5. Channel split for this launch

### Owned - total control, fires first

| Channel | Surface | Reach on 9/1 | Role | Owner |
|---|---|---|---|---|
| Landing page | `become.redbtn.io` (`webapp/components/landing/`) | Everyone who arrives | The destination for every link in the plan. **Unchanged this week.** No landing edits after Fri 8/28. | George |
| Web push | `POST /api/admin/notify` broadcast, `webapp/lib/pushNotification.ts` | Members with a live subscription - **count unknown, George measures Wed 8/26** | One push, 12:30. If the subscription count is under 15, push stops being a channel and this row becomes a note in the review. | George |
| Email | Nodemailer via `webapp/lib/email.ts` | Every member | **Not used.** Blocked by the compliance gate (D2). | - |
| In-app surface | Dashboard, hubs | Members who open the app | **Not used.** There is no announcement surface and building one is not worth launch week. | - |

**Expected contribution: low impressions, the highest-certainty activations we will get, and
possibly very few of them.** With roughly 60 members and an unknown push-subscription count, owned
is smaller here than it is for a normal launch. Say so out loud now rather than being surprised at
T+7.

### Rented - partial control, fires second

| Channel | What we control | What we do not | Role | Owner |
|---|---|---|---|---|
| Brand IG `becomeapp.fit` or the highest-ranked free candidate (see `accounts-setup.md`) | Bio, link, grid, post timing | Whether anyone sees it. **Zero followers on 9/1.** | The announcement of record and a credibility surface. A stranger who checks the account must find it alive, not empty. | George posts, agent writes |
| Jon's IG `@jondon275` (confirm exact handle Day 1) | What he posts, because he agreed | Distribution | **The launch.** Three posts on 9/1. Everything else is support. | Jon |
| TikTok handle | Reserved 8/25 | Everything | Name reservation only. Cross-posting begins T+3 if the batch lands. | George |
| AlternativeTo | Listing quality | Approval, placement | Highest-intent directory available to us and heavily cited by AI answers. Licence field **Free**, never Freemium. Platform **Web, PWA**, never iOS or Android. | George submits, agent writes `listings.md` |
| PWA / web-app indexes (2 of them) | Listing quality | Approval | Permanent indexable pages about being a PWA, which is a real differentiator. Some read `webapp/app/manifest.json/route.ts` directly; its empty `screenshots` array is a known gap. | George |
| Product Hunt | Everything about the submission | Ranking | **Not on 9/1.** Prep opens T+1, target Tue 10/6. | George + Jon |

**Expected contribution: most of the new-person impressions, few of the activations.** Plan for
reach here, not conversion.

### Borrowed - no control, the only genuinely new people

| Channel | Secured? | Role |
|---|---|---|
| Jon's warm audience (his followers) | **Yes, by Jon agreeing to post.** Reach number is unknown and is a Day 1 task. | The primary source of every new signup in launch week. |
| Jon's 15 named warm clients, messaged individually | **Yes, if Jon writes the list on Tue 8/25.** | The highest-conversion action in the entire plan. A DM from your own coach beats every post. |
| Members sharing | Not secured, not asked | Out of the plan. Asking on day one is asking too early. |
| Creators | **Not secured.** None briefed, none agreed. | **Out of the plan.** A creator who has not agreed is not a channel. |
| Press, newsletters | Not secured | Out of the plan. |
| Reddit, forums, Discord | **No account history anywhere.** | Out of the plan. Participation clock starts 8/26 for the 10/6 PH launch. |

**Expected contribution: the highest variance in the plan, and realistically all of the upside.**
The primary metric is not built on it, which is why the target in section 11 is deliberately small.

### Expected contribution, written down before launch

| Tier | Impressions | Signups | Certainty | Predicted share of launch-week signups |
|---|---|---|---|---|
| Owned | Low | Low | Near certain | 5% |
| Rented | Low-moderate (new handles) | Very low | Moderate | 10% |
| Borrowed (Jon) | The bulk of everything | The bulk of everything | Low but the only real bet | 85% |

Guessing wrong is fine. Not having guessed is what makes the T+7 review meaningless.

### One message per tier. Do not copy-paste.

| Tier | Audience state | The message |
|---|---|---|
| Owned (push) | Already uses Become | Final copy in `lifecycle.md` §2.2 (owner file): title `One photo, the whole plate`, body `Photograph your lunch in Nutrition. It comes back itemized.`, url `/dashboard/nutrition`, tag `launch-2026-09-01`. |
| Rented (brand IG, directories) | Knows the category, not us | `Coach-built programs, set-by-set logging, a photo of your plate, and a weekly recap. One app, free, in your browser.` |
| Borrowed (Jon) | Knows Jon, not the app | His words, our truth. Brief the mechanism and the limits, never a script. `coach-brand-voice` owns the register. |

## 6. Content interface for the parallel agents

This is the contract. Fill these exact counts into these exact slots. Anything not on this list is
out of launch week.

### Pillars and slots (from `social-strategy/references/content-pillars.md` - names do not change)

| Slot | Day | Pillar | Format | Owner | Launch-week status |
|---|---|---|---|---|---|
| Watch It Work | Monday | 1 Mechanism | Reel 15-30s | Brand | 2 items |
| One Tap | Wednesday | 2 Teaching | Carousel 4-6 slides | Brand | 2 items |
| Coach Answer | Thursday | 3 Coach | Reel 30-45s, Jon on camera | Jon | 2 items |
| Plan The Week | Friday | 4 Planning | Carousel or Reel | Brand | 1 item |
| Read Your Week | Sunday | 5 Recap | Reel or carousel, **one per week, hard cap** | Brand | 1 item, T+6 only |

Plus two launch-only items that sit outside the slots:

| ID | What | Format | Owner |
|---|---|---|---|
| `LAUNCH-HERO` | Jon, first person, why this exists and who it is for. Runs 9/1 at 10:00 on his account and the brand account. | Reel 30-45s, Jon on camera | Jon films, agent scripts |
| `LAUNCH-BTS` | How it got built and what we got wrong first. Runs T+1. | Reel 30-45s, Jon on camera | Jon films, agent scripts |

### The pack the scripts doc must deliver

> **8/25 review note:** run dates and formats below are superseded where `content-calendar.md` §2
> (R-1 to R-13) moved them — notably `CA-01` runs Thu 9/3 not Wed 9/2, `RYW-01` ships as a
> carousel, TikTok starts Thu 9/3, and the scripts landed as `reels-pack.md` + `carousels.md`.
> The counts and filming needs stand.

**PACK A - launch week, needed in `reels-scripts.md` by Thu 8/27 22:00** so Jon can film Sat 8/29.

| ID | Slot | Format | Filming need | Runs |
|---|---|---|---|---|
| `LAUNCH-HERO` | - | Reel 30-45s | Jon on camera | Tue 9/1 10:00 |
| `WIW-01` | Watch It Work | Reel 15-25s | Screen recording, plate photo itemizing | Tue 9/1 16:00 |
| `WIW-02` | Watch It Work | Reel 15-25s | Screen recording, LIVE mode, one set logged with "Last: X lbs x Y" on screen | Thu 9/3 |
| `CA-01` | Coach Answer | Reel 30-45s | Jon on camera | Wed 9/2 |
| `ONETAP-01` | One Tap | Carousel 6 slides | No filming. `webapp/public/screenshots/v2/` captures, one annotation per slide | Fri 9/4 |
| `PTW-01` | Plan The Week | Carousel 5 slides | No filming. `workout-hub-*.webp`, `generate-*.webp` | Sat 9/5 |

**PACK B - second wave, needed by Sat 8/29 09:00** so it can be filmed in the same session.

| ID | Slot | Format | Filming need | Runs |
|---|---|---|---|---|
| `LAUNCH-BTS` | - | Reel 30-45s | Jon on camera | Wed 9/2 |
| `CA-02` | Coach Answer | Reel 30-45s | Jon on camera | Sun 9/6 |
| `MECH-01` | Watch It Work | Reel 25-35s | Screen recording, deeper than day one: photo logging including where it guesses badly | Thu 9/3 |
| `QA-01` | Coach Answer | Reel or carousel | Jon on camera, **written Fri 9/4 from real launch-day questions**, not pre-scripted | Fri 9/4 |
| `RYW-01` | Read Your Week | Carousel 4 slides | No filming. `progress-*.webp`, `mind-*.webp`. The single permitted The Becoming mention lives here | Mon 9/7 |

**Filming totals for Sat 8/29 (updated 8/25 review, per calendar R-10/R-11):** Jon on camera 5
times plus a 5-minute story pickup (`LAUNCH-HERO`, `CA-01` missed sessions, `CA-02` starting
weight, `CA-03` soreness, `LAUNCH-BTS`; Jon's block ends ~11:30). Screen recordings 4 by George
(`WIW-01`, `WIW-02`, `MECH-01` from setup 1, `GEN-01` setup 3; recap setup 4 is drop-first) shot
on iOS or Safari, never Chromium, because exercise demo panels render black in Chromium
(`webapp/components/FramedVideo.tsx:39` emits `type="video/quicktime"`). Carousels 4, no filming,
built from existing captures. `QA-01` is written after launch day and filmed Fri 9/4 in one take.

### What `content-calendar.md` must contain

Rows for **Tue 9/1 through Sun 9/13** (two full weeks, per goal 3). Columns, fixed:

`date | slot | pillar | platform | format | asset path | producing skill | owner | caption source | utm_content`

Week 2 (Mon 9/7 to Sun 9/13) may reuse the render library and the existing captures; it must not
require a second film session, because there is not one scheduled.

### What `launch-day-copy.md` must contain

- Brand IG bio, 150 characters, plus the link-in-bio destination with its UTM.
- Jon's IG bio addition, one line, plus his link-in-bio destination with its UTM.
- Caption, final form, for every ID in Pack A and Pack B.
- The 9/1 push: title, body, `url`, `tag`. Character budgets from
  `push-notifications/references/copy-specs.md`.
- Six sceptical FAQ answers (gate 5.2), written to be quoted out of context.
- Three DM reply templates Jon can adapt: "how much is it", "is it on the App Store", "does it
  track my reps for me" (the honest answer is no, and the honest answer is better).

### Hard "do not ship" list for the existing render library

**Scope note (8/25 review):** this worktree's `marketing/out/` was rendered fresh on 8/25 and
contains none of these files. The list applies to the **main checkout**
(`/home/alpha/code/become/marketing/out/`), where the stale files still exist. Post only from the
worktree render or the Wed 8/26 durable copy of it.

| File | Why |
|---|---|
| `out/collection/story/26-coaching-after-the-gym.jpg` | Pre-truth-pass slug. Row is now `26-the-plan-comes-home`. |
| `out/collection/story/27-ask-your-coach.jpg` | Pre-truth-pass slug. Row is now `27-not-a-random-workout`. Implies coach chat, which is admin-gated "Coming Soon". |
| `out/collection/story/31-start-transformation.jpg` | Pre-truth-pass slug, and "transformation" is banned copy. Row is now `31-your-next-rep`. |
| `out/collection/landscape/40-direct-coaching.jpg` | Pre-truth-pass slug. Implies human coaching we do not offer. |
| `out/collection/landscape/41-questions-answered.jpg` | Pre-truth-pass slug. Same implication. |
| `out/videos-reviewed/10-ask-while-its-fresh.mp4` | `reviewedCampaigns.ts` `Reviewed10` still says "Your coach can answer with the plan and the work in view" over `chat.png`. Human coach chat is not available. **The video library never got the truth pass `campaigns.json` got.** |
| `out/videos-reviewed/13-thirty-days-no-drift.mp4`, `14-add-weight-keep-form.mp4` | Labelled "30-Day Shred" and "Build serious muscle". Ship only after Jon confirms both programs are live in the app under those names. |

## 7. Run of show, T-7 to T+7

Status values: `not started` / `in progress` / `blocked` / `done`. Everything starts `not started`.

**Deviation from `references/run-of-show.md`, stated:** the template runs T-14 to T+7. We are
entering at T-7, so the T-14 to T-8 block (gate, baseline, asset audit, commissioning) collapses
into Tue 8/25 and Wed 8/26, and **the asset freeze moves from T-7 to T-4 (Fri 8/28)** because
assets cannot be commissioned and frozen on the same day. Everything from T-3 onward runs as
written.

### T-7 - Tuesday 2026-08-25 (today)

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| by 18:00 | Internal | Read this plan. Hand `jon-checklist.md` to Jon and get a yes or no on the date. Gate 5.3. | George | `jon-checklist.md` | If Jon cannot commit to 9/1, move to 9/8 today. No other fallback exists. |
| by 20:00 | Internal | **Phone pass on production**, both themes, on a real phone. Gate 1.2, 1.3, 1.6. | George | `become.redbtn.io` | Slips to Wed 08:00. Later than that, move the date. |
| by 20:00 | Internal | **Cold signup on a fresh dummy address**, receive the magic link, use the app with zero history. Gate 1.5, 3.3, 3.4. | George | Fresh dummy address | Same. This one is the date. |
| by 21:00 | Borrowed | Confirm Jon's exact IG handle and his real reach numbers: followers, median reel views last 10 posts, story views. | Jon | IG insights | Plan proceeds with the target unrebased and the review says so. |
| by 21:00 | Borrowed | Jon writes the list of **15 warm clients** he will message on 9/1. Names only, in his own notes. | Jon | - | Cut to 8 names. Do not cut to zero. |
| by 22:00 | Rented | Reserve handles: IG and TikTok. Ranked candidate list and the in-form availability method are in `accounts-setup.md`. Take the highest-ranked string free on both platforms and record which one won. | George | `george-checklist.md` | Slips to Wed. Blocks nothing until Thu. |
| by 22:00 | Internal | Agent kickoff: `reels-scripts` (Pack A + B), `content-calendar`, `launch-day-copy`, `web-app-listing` (lands as `listings.md`). | George invokes | `become-marketing` | Agents can run Wed; Pack A is due Thu 22:00 either way. |

### T-6 - Wednesday 2026-08-26

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 09:00 | Internal | **Record the baseline.** Users created per day, trailing 28 days. Users with any `UserProgress` entry. Push subscription count. Write all three into `measurement.md`. Gate 4.4. | George | App database, one aggregation | **No fallback. This one does not slip.** Without it the T+7 review is an opinion. |
| 10:00 | Assets | Re-render the collection after the truth pass. Wrap the render in `timeout`. Delete the five stale files by name. Gate 2.7. | George | `marketing/scripts/`, `npm run` in `marketing/` | If the render fails, launch-day stills come from `webapp/public/screenshots/v2/` only and the render library is out of launch week. |
| 10:00 | Assets | Truth-pass `marketing/src/reviewedCampaigns.ts`, starting with `Reviewed10`. Gate 2.8. | agent (`remotion-assets`) | `reviewedCampaigns.ts` | Video library is excluded from the launch set entirely. |
| 12:00 | Assets | Copy the frozen launch asset set out of the gitignored `out/` into a durable local folder and record the path in section 9. | George | `marketing/out/` | Assets referenced from the main checkout path, with the risk noted. |
| 14:00 | Internal | Test the two failure cases: an expired magic link, and a signup with a typo'd address. Gate 1.7. | George | Production | Accept as an open risk in section 10. |
| 15:00 | Rented | Fill both IG profiles: bio, link with UTM, profile image from the brand asset set, category. | George | `launch-day-copy.md` bios | Do it Thu. Blocks the grid seeding on Sun. |
| 16:00 | Borrowed | George starts the participation clock: subscribe to two relevant communities, read the rules, post nothing. For 10/6, not for 9/1. | George | - | Drop it. It only affects the PH launch. |
| all day | Copy | Agents produce Pack A scripts, listing kit draft, FAQ draft. | agent | `reels-scripts.md`, `listings.md` | Pack A due Thu 22:00 regardless. |

### T-5 - Thursday 2026-08-27

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 09:00 | Dev | **Push guard.** `POST /api/admin/notify` broadcasts to every subscribed user with no preference check, no quiet-hours gate, and no daily-cap check. Add all three to the broadcast branch. Roughly 20 lines in an existing admin route. Branch `agent/alphaSystem-launch-push-guard` to `beta` to `main`. | George | `webapp/app/api/admin/notify/route.ts` | **Fallback: no push on 9/1.** Sending ungated violates the guest rules in `push-notifications`. Losing the push costs less than burning the channel. |
| 11:00 | Measurement | Stand up the Plausible-class tool and put the script on the landing page. `user_id` and nothing else, ever. Gate 4.3. | George | D3 | Launch runs on database counts alone. Say so in the review and do not guess at sources. |
| 14:00 | Copy | Sceptical FAQ finished, six questions, honest about limits. Gate 5.2. | agent, George signs | `launch-day-copy.md` | **Do not slip past Fri.** Improvised answers on launch day invent things. |
| 15:00 | Internal | Decide the support path: a monitored reply-to plus Jon's DMs. Gate 5.4. | George | - | Jon's DMs only, stated in the FAQ. |
| 16:00 | Assets | Decide on the light-mode LIVE capture: shoot it or cut it. Gate 2.3. | George | `screenshot-capture` | Cut it. The dark capture plus the filmed screen recording carry the mechanism. |
| 22:00 | Copy | **Pack A and Pack B scripts complete** with beat tables and shot lists, so Jon can read them cold. | agent | `reels-scripts.md` | Jon films `LAUNCH-HERO` and two Coach Answers from bullet points, and the carousels carry launch day. |

### T-4 - Friday 2026-08-28

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 09:00 | Internal | **ASSET FREEZE.** Anything not agreed today is out of this launch. Update section 9 to match reality. | George | Section 9 | There is no fallback. A freeze that slips is not a freeze. |
| 10:00 | Internal | **Constraint pass** over every frozen asset: gate section 6, all ten rows. Gate 5.5. | agent runs, George signs | `readiness-gate.md` §6 | Launch with unverified claims. Unacceptable. Cut the unverified asset instead. |
| 11:00 | Rented | Directory listings prepared and staged, **not submitted**: AlternativeTo plus two PWA indexes. Fetch each live submission form first. | George | `listings.md` | Submit AlternativeTo only on 9/1 and the PWA indexes in week 2. |
| 13:00 | Measurement | Mint every UTM. One campaign: `202609_public_launch`. Record every link in `measurement.md`. Gate 4.3. | agent mints, George pastes | `utm-conventions.md` | Untagged links mean the review cannot attribute anything. Do not skip. |
| 15:00 | Internal | Second readiness-gate pass. Every row must be GREEN or explicitly accepted. **Go / no-go on 9/1 is called here.** | George | This section | No-go moves the date to 9/8. Nothing external has been announced, so the cost is internal only. |

### T-3 - Saturday 2026-08-29

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 09:00-13:00 | Borrowed | **The film batch.** 4 Jon-on-camera items, 3 screen recordings. Shot specs in `reels-scripts.md`. Nothing filmed on a camera roll; everything filmed for purpose. | Jon films, George runs the phone and the app | `reels-scripts.md` Pack A + B | **Fallback: `LAUNCH-HERO` alone, one take, Sun 8/30.** Everything else becomes carousels from existing captures. The launch survives with one Jon video; it does not survive with none. |
| 14:00 | Assets | Rough cuts of `LAUNCH-HERO` and `WIW-01`, captions overlaid, safe areas respected (top 200px, bottom 250px, right 120px kept clear). | George | Raw footage | Post `LAUNCH-HERO` uncut with a caption. Raw and honest beats polished and absent. |
| 16:00 | Internal | End-to-end test again on a phone: land, sign up on a fresh dummy address, receive the magic link, log one set. Gate 1.5, 3.3, 3.4 re-verified. | George | Production | Repeat Sun. If it fails, that is a no-go, not a slip. |
| 17:00 | Dev | ~~Optional `robots.ts` / `sitemap.ts`~~ **CUT (D6, 8/25 review).** Saturday ends after the 16:00 e2e retest. | George | - | - |

### T-2 - Sunday 2026-08-30

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 10:00 | Rented | **Seed the brand grid: 6 posts.** Post them today so the account is not empty on 9/1. Squares from the re-rendered `out/collection/square/`, one per pillar plus the hero. No launch announcement in any of them. | George | Re-rendered squares | Seed 3. An account with 3 posts reads alive; an account with 0 reads abandoned. |
| 12:00 | Copy | Every launch-day caption finalised and staged in the scheduler or a notes file, assets attached. Gate 3.2 closes here. | agent writes, George stages | `launch-day-copy.md` | George posts manually on the day from the file. Slower, works. |
| 14:00 | Borrowed | Jon reads every caption written in his name and rewrites anything that is not how he talks. **His voice wins over the copy every time.** | Jon | `launch-day-copy.md` | Jon writes his own captions on 9/1 morning from the claim in section 1. |
| 16:00 | Owned | Push copy finalised: title, body, `url`, `tag: launch-2026-09-01`. Never leave the route's default `admin-test` tag. | George | `launch-day-copy.md` | No push. |

### T-1 - Monday 2026-08-31

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 09:00 | Internal | **Block launch-day reply hours in both calendars.** Jon 09:00-20:00 on his own comments and DMs. George 09:00-18:00 on the brand handle and anything technical. Gate 5.1. | George, Jon | Calendar | The single most common dropped item in a launch. Do it. |
| 11:00 | Internal | Final constraint sweep on the staged posts: no "(beta)", no empty state, no invented claim, no fabricated count, "free" said correctly. | George | Gate §6 | Cut the offending asset rather than fix it on the day. |
| 13:00 | Internal | Dry run: signup on a fresh dummy address one more time, on cellular data, not wifi. | George | Production | If this fails, no-go. |
| 15:00 | Internal | Freeze `main`. No deploys to production between now and Wed 9/2 unless something is on fire. | George | RedRun | A deploy that breaks the landing at 10:00 on launch day is the worst available outcome. |
| 20:00 | Borrowed | Jon posts a story: he is releasing something tomorrow. No link, no detail. One frame. | Jon | Story still from the brand set | Skip it. It costs nothing to skip and adds a little. |

### T - Tuesday 2026-09-01

Hour by hour in section 8.

### T+1 - Wednesday 2026-09-02

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 09:00 | Internal | Read the numbers from yesterday. Signups, source split if the tool is up, push delivery count, comment and DM volume. Write them into `measurement.md`. | George | `measurement.md` | Read them Thu. Do not skip; day-one numbers get harder to reconstruct every day. |
| 10:00 | Rented | Post `LAUNCH-BTS`: how it got built, what we got wrong first. Brand and Jon's accounts. | Jon posts his, George posts brand | `LAUNCH-BTS` | Post `CA-01` instead and move BTS to Thu. |
| 12:00 | Rented | Post `CA-01` (Coach Answer). | Jon | `CA-01` | Slide to Thu. |
| 14:00 | Rented | Open Product Hunt prep for 10/6: draft the maker comment in Jon's first person. | George drafts, Jon rewrites | `web-app-listing` | Push to next week. It is a 10/6 dependency, not a launch-week one. |
| all day | Human | Keep replying. Day-two comments are slower and more serious than day-one comments. | Jon, George | - | - |

### T+2 - Thursday 2026-09-03

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 10:00 | Rented | Post `MECH-01`: the mechanism explainer, deeper than day one, including where photo logging guesses badly. Honesty about limits is the strongest credibility move we have. | George posts brand, Jon reshares | `MECH-01` | Post `WIW-02` instead. |
| 12:00 | Rented | Post `WIW-02` (LIVE mode set logging) to TikTok as the first cross-post. | George | `WIW-02` | Drop TikTok this week. |
| 15:00 | Rented | Submit the second and third directory listings if only AlternativeTo went out on 9/1. One surface at a time, about a week apart, so a change in signups is attributable. | George | `listings.md` | Week of 9/8. |

### T+3 - Friday 2026-09-04

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 09:00 | Internal | Pull the **most-asked launch question** out of the comments and DMs. Write `QA-01` from the real question, not a guessed one. | George drafts, Jon films | Launch-day comments | Use the strongest of the six FAQ answers instead. |
| 12:00 | Rented | Post `ONETAP-01` carousel. | George | `ONETAP-01` | Slide to Sat. |
| 17:00 | Rented | Post `QA-01`, answering the real question publicly. | Jon | `QA-01` | Answer it in the comments only. |

### T+4 - Saturday 2026-09-05

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 11:00 | Rented | Post `PTW-01` (Plan The Week carousel), timed for people planning next week. | George | `PTW-01` | Slide to Sun. |
| 14:00 | Borrowed | Jon replies personally to anyone from the 15 who signed up, one message each. No template. | Jon | His list of 15 | Do it Sun. This is the retention half of the launch. |

### T+5 - Sunday 2026-09-06

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 10:00 | Rented | Post `CA-02` (Coach Answer). | Jon | `CA-02` | Slide to Mon. |
| 16:00 | Internal | Mid-week read: are new signups logging anything, or did they sign up and leave? One aggregation. | George | `measurement.md` | Fold into the T+7 review. |

### T+6 - Monday 2026-09-07 (US Labor Day)

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 11:00 | Rented | Post `RYW-01` (Read Your Week). **This carries the single permitted The Becoming mention** and it is one beat, not the theme. | George | `RYW-01` | Slide to Tue. It is the lowest-stakes post of the week. |
| 15:00 | Internal | Assemble the T+7 review inputs: numbers, channel split, what shipped versus what was planned. | George | Section 12 | Do it Tue morning before the review. |

**Note:** it is a US public holiday. Expect lower engagement and do not read it as a trend.

### T+7 - Tuesday 2026-09-08

| Time | Channel | Action | Owner | Asset | Fallback if slipped |
|---|---|---|---|---|---|
| 10:00 | Internal | **Post-launch review**, 45 minutes, George and Jon, template in section 12 filled in advance. | George runs it | Section 12 | It does not slip. The review is the reason the launch was worth planning. |
| 11:00 | Internal | Lock week 3 and 4 of the content calendar off whatever actually worked. | George | `content-calendar.md` | - |
| 11:30 | Internal | Open the two deferred builds: the email unsubscribe route with `List-Unsubscribe` headers, and `/api/track`. Both are now week-of-9/8 work. | George | D2, D3 | - |
| 12:00 | Internal | Confirm or move the Product Hunt date of Tue 10/6. | George, Jon | D4 | - |

## 8. Launch day, hour by hour - Tuesday 2026-09-01

All times America/New_York. **Launch day contains no production work.** If an asset is being made
today, Friday's freeze failed.

| Time | Tier | Action | Owner | Asset |
|---|---|---|---|---|
| 07:00 | Internal | George checks production is up, the landing renders on a phone in both themes, and signup works on a fresh dummy address. Ten minutes. | George | Production |
| 07:15 | Internal | Snapshot the primary metric so the day has a clean start line. | George | `measurement.md` |
| 09:00 | Human | **Reply blocks open.** Jon 09:00-20:00, George 09:00-18:00. Nothing else goes in these calendars. | Jon, George | Calendar |
| 09:30 | Rented | Jon posts a story: it is live, with the link sticker carrying his UTM. Story first, so the feed post lands into an audience already primed. | Jon | Story still |
| 10:00 | Rented | **`LAUNCH-HERO` posts on Jon's account.** This is the single highest-leverage minute of the week. | Jon | `LAUNCH-HERO` |
| 10:05 | Rented | Brand account posts `LAUNCH-HERO` with the strangers-facing caption, and Jon reshares it to his story. | George | `LAUNCH-HERO` + brand caption |
| 10:30 | Rented | AlternativeTo submission goes live. Licence **Free**. Platform **Web, PWA**. Rating, downloads, version left blank. | George | `listings.md` |
| 11:00 | Rented | Two PWA index submissions go in. | George | `listings.md` |
| 12:30 | Owned | **The one push.** Suppressed for anyone who already received a product nudge today, gated to 07:00-21:00 local, one send, tag `launch-2026-09-01`. Midday because the morning window already carries the workout and mind reminders and the evening carries the goal and meal nudges. | George | `POST /api/admin/notify` |
| 13:00 | Borrowed | **Jon messages his 15 warm clients**, one at a time, hand-typed, each one different. Highest-conversion action in the plan. | Jon | His list |
| 16:00 | Rented | Second post: `WIW-01`, the plate photo itemizing. Brand account, Jon reshares. | George | `WIW-01` |
| 17:00 | Human | Jon posts a story answering the two questions he has been asked most today. Screenshot the question, answer in his own voice. | Jon | Story |
| 18:00 | Internal | **Snapshot the primary metric and both guardrails.** Signups since 07:15, push delivery and error counts, any support message reporting a broken signup. | George | `measurement.md` |
| 20:00 | Human | Jon's reply block closes. Anything unanswered rolls to 09:00 Wednesday. | Jon | - |
| 20:30 | Internal | Ten-minute debrief message between George and Jon: what surprised us, what to change tomorrow. Written, not verbal, so the T+7 review has it. | George | `measurement.md` |

**If the site goes down at any point:** George stops posting immediately, pins nothing, fixes the
site, and resumes. Traffic sent at a broken landing page is worse than no traffic, because the
first impression is unrecoverable and the borrowed reach was single-use.

## 9. Asset manifest

Every asset resolves to a path that exists or a skill that produces it. **Nothing in this plan
depends on an asset nobody has agreed to make.**

| Asset | Path or producer | Exists today | Needed by |
|---|---|---|---|
| Landing page | `webapp/components/landing/` | **Yes**, v2 shipped 8/24 | live |
| Product captures, 15 webp, 8 screens | `webapp/public/screenshots/v2/` | **Yes** | live |
| Capture manifest | `webapp/public/screenshots/v2/manifest.json` | **Yes**, read it before reusing any shot | live |
| LIVE mode capture, light twin | `screenshot-capture` | **No** (dark only) | Fri 8/28, or cut |
| Campaign squares, 16 | `marketing/out/collection/square/` in the main checkout, **gitignored** | Yes but pre-truth-pass | re-render Wed 8/26 |
| Campaign stories, 15 | `marketing/out/collection/story/` | Yes, **3 files unshippable** | re-render Wed 8/26 |
| Campaign landscapes, 15 | `marketing/out/collection/landscape/` | Yes, **2 files unshippable** | re-render Wed 8/26 |
| Reviewed videos, 19 | `marketing/out/videos-reviewed/` | Yes, **1 unshippable, 2 need Jon's confirmation** | truth pass Wed 8/26 |
| OG still, social square, story poster, 12s reel | `marketing/out/become-*.png`, `become-reel.mp4` | Yes | re-check at freeze |
| `LAUNCH-HERO`, `LAUNCH-BTS`, `CA-01`, `CA-02` | Filmed Sat 8/29. Scripts from `reels-scripts` | **No** | Sat 8/29 |
| `WIW-01`, `WIW-02`, `MECH-01` | Screen recordings, Sat 8/29, on iOS or Safari | **No** | Sat 8/29 |
| `ONETAP-01`, `PTW-01`, `RYW-01` | Carousels from existing v2 captures, one annotation per slide. `reels-scripts/references/carousel-spec.md` | **No** | Fri 8/28 |
| `QA-01` | Written Fri 9/4 from real questions | **No** | Fri 9/4 |
| Captions, bios, push copy, FAQ | `launch-day-copy.md` via `copywriting` and `coach-brand-voice` | **No** | Thu 8/27 |
| Directory field kit | `listings.md` via `web-app-listing` | **No** | Fri 8/28 |
| UTM register | `measurement.md` via `analytics-tracking` | **No** | Fri 8/28 |
| Baseline numbers | `measurement.md`, one database aggregation | **No** | **Wed 8/26** |
| Push guard | `webapp/app/api/admin/notify/route.ts` | **No** | Thu 8/27 |

**Durability note.** `marketing/out/` is gitignored and this worktree has no `out/` at all. The
frozen launch asset set gets copied on Wed 8/26 to a durable local folder outside the repo, and the
path recorded here at the freeze. Do not commit renders.

## 10. Risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner | Trigger to act |
|---|---|---|---|---|---|---|
| R1 | **Jon's reach is much smaller than assumed**, so the borrowed tier delivers a handful of people. 85% of the predicted contribution sits on an unknown number. | Medium | High | Confirm the number Tue 8/25 before anything else. Rebase the primary metric Wed 8/26. If reach is under 500, cut the target to 10 and reweight toward directories, which pay slowly and permanently. | Jon confirms, George rebases | Reach number arrives Tue |
| R2 | **Signup or magic-link delivery fails under launch traffic.** Signup is authentication here, so a deliverability failure is an outage, and the borrowed reach is single-use. | Low | Very high | Test on 8/25, 8/29, 8/31, and 07:00 on 9/1, each time on a fresh address and once on cellular. Freeze `main` from Mon 15:00. If it breaks on the day, stop posting immediately. | George | Any failed test |
| R3 | **The film batch does not happen on Sat 8/29** (Jon busy, sick, or the scripts are late). Four of eleven launch assets are Jon on camera. | Medium | High | Scripts land Thu 22:00 so Saturday is filming, not writing. Fallback is one take of `LAUNCH-HERO` on Sun 8/30 and everything else becomes carousels from captures that already exist. The launch survives with one Jon video. | George protects the script deadline, Jon protects the morning | Scripts not complete Thu 22:00 |
| R4 | **A stale or untrue asset ships**, most likely one of the five pre-truth-pass renders or the coach-chat video, and the launch becomes a correction. | Medium | High | The named do-not-ship list in section 6. Re-render Wed. Constraint pass Fri. George signs each asset by name at the freeze rather than approving a folder. | George | Any asset in the launch set whose filename is not on the post-freeze list |
| R5 | **Launch day passes and nothing is measurable**, so the T+7 review is a conversation about vibes and week 3 is planned on a guess. | Medium | Medium | The measurement floor is a database count with no build and no dependency, scheduled first thing Wed with no fallback. The tool is the upgrade, not the requirement. Every link carries a UTM whether or not the tool is up. | George | Baseline not recorded by Wed 22:00 |
| R6 | **The push lands ungated** on top of a product nudge, or at 03:00 for someone in another timezone, and members mute the channel the product depends on. `/api/admin/notify` respects no preference, no quiet hours, and no daily cap today. | Medium | Medium | Ship the guard Thu 8/27. If the guard does not ship, **do not send the push.** One push, one tag, and it yields to any product nudge already sent. | George | Guard not merged by Fri 8/28 09:00 |

Two risks deliberately accepted and not mitigated: the brand handle will have near-zero reach on
9/1 (that is what D7 says out loud), and beta traffic cannot be separated from production in the
report (nothing points at beta, so the contamination is negligible).

## 11. Success metrics

**Primary metric: new accounts created between Tue 9/1 00:00 and Mon 9/7 23:59 local.**

**Target: 25.**

How the target was set, honestly: it is a guess anchored to an unknown. The Tier C heuristic in
circulation is that 1% to 3% of a warm audience clicks a link in a post and 10% to 20% of clicks
sign up for a free product with no card. **That is a Tier C benchmark and it is not, and will never
be, restated as a Become claim anywhere public.** Applied to a mid-hundreds warm audience it gives
a number in the low tens. **Rebase rule:** if Jon's confirmed reach on Wed 8/26 is under 500, the
target drops to 10; if it is over 5,000, it rises to 60. Write the rebase into `measurement.md`
with the date, and do not quietly move it afterwards.

**Baseline, recorded Wed 8/26:** the trailing-28-day daily average of new accounts, so the launch
week is compared against a normal week rather than against zero.

**Guardrail 1: authentication stays healthy.** Zero reports of a magic link that did not arrive or
did not work, and the 07:00 and 18:00 checks on 9/1 both pass. If this guardrail breaks, the launch
stops until it is fixed, regardless of what the primary metric is doing.

**Guardrail 2: the push channel stays intact.** No net loss in push subscriptions across launch
week, measured as the subscription count on Wed 8/26 against the count on Tue 9/8. A launch that
buys 25 signups and costs 20 subscriptions did not work.

**Secondary numbers, collected but not scored:** activated accounts (any workout, weight, mood, or
meal entry within 7 days of signup), comment and DM volume on 9/1, and the source split if the
analytics tool is up.

**Read date: Tue 2026-09-08, 10:00. Owner: George. Already in the run of show at T+7.**

Nothing about this number goes in public copy. No count, no rate, no "join X members", not on
launch day and not afterwards.

## 12. Post-launch review, Tue 2026-09-08

Pre-filled with the metrics to collect. Fill the blanks; do not rewrite the questions.

### 1. Numbers

| Metric | Baseline (Wed 8/26) | T+7 (Tue 9/8) | Delta | Where it came from |
|---|---|---|---|---|
| New accounts, 9/1 to 9/7 | trailing-28-day daily average x 7 = ____ | ____ | ____ | `User.createdAt` aggregation |
| Guardrail 1: magic-link failures reported | 0 | ____ | ____ | Support messages, Jon's DMs, the 07:00 and 18:00 checks |
| Guardrail 2: push subscriptions | ____ | ____ | ____ | `PushSubscription` distinct user count |
| Activated accounts (any entry within 7 days of signup) | ____ | ____ | ____ | `UserProgress` aggregation |
| Feature usage among existing members after the push | ____ | ____ | ____ | Same aggregation, members created before 9/1 |
| Push: sent / errors | n/a | ____ / ____ | - | `POST /api/admin/notify` response |
| Landing sessions, 9/1 to 9/7 | ____ | ____ | ____ | Analytics tool, if it was up |

### 2. Channel contribution

| Tier | Predicted share | Actual signups | Actual share | Read |
|---|---|---|---|---|
| Owned (push) | 5% | ____ | ____ | |
| Rented (brand IG, TikTok, directories) | 10% | ____ | ____ | |
| Borrowed (Jon's posts, Jon's 15 DMs) | 85% | ____ | ____ | |
| Unattributable (direct, no UTM survived) | - | ____ | ____ | Expect this bucket to be large. The magic-link tab handoff loses first-touch across devices. Do not explain it away. |

Also record, because they are the inputs behind the shares:

- Jon's confirmed reach on 8/25: followers ____, median reel views ____, story views ____.
- `LAUNCH-HERO` on Jon's account: views ____, comments ____, link clicks ____.
- Of Jon's 15 warm DMs: replied ____, signed up ____, logged something ____.
- Directory listings live: ____ of 3. Referral sessions in week 1: ____.
- Brand handle followers on 9/8: ____ (from 0 on 8/25).

### 3. Three questions, one sentence each

- What worked that we should make standard?
- What did not work, and was it the channel, the creative, or the timing?
- What did the readiness gate catch, and what did it miss?

The third question has a known partial answer already: the gate caught five stale render files, an
untruth-passed video library, an ungated push broadcast, and a completely absent measurement layer,
all before anything was announced. Record what it missed with the same specificity.

### 4. The asset library

Which of the eleven filmed and built assets are reusable beyond launch week, and where they live.
`marketing/out/` is gitignored, so anything that must survive gets reported by path and copied
deliberately to the durable folder recorded in section 9.

### 5. One decision

The single change to make before the Product Hunt launch on 10/6. **One.** A list of twelve is a
list of zero.

---

## Appendix - deviations from the skill reference, stated

1. **T-14 to T-8 is collapsed.** We entered at T-7. The gate, the baseline, and the asset audit all
   land on 8/25 and 8/26 instead of across a week.
2. **The asset freeze moved from T-7 to T-4 (Fri 8/28)**, because assets cannot be commissioned and
   frozen on the same day.
3. **The launch push is at 12:30, not 09:00.** The generic sequence puts it in the morning; the
   live nudge inventory says the morning already carries the workout and mind reminders and the
   evening carries the goal and meal nudges. Midday is the only window with room.
4. **No email at all**, where the reference sequence puts an email send at 07:30. The compliance
   gate in `email-lifecycle` blocks every non-transactional send until unsubscribe infrastructure
   exists, and it does not exist.
5. **Product Hunt is not on launch day**, per the directory reference's own rule about not stapling
   a PH launch onto another launch.
6. **The verdict is AMBER holding the date**, not the reference's members-only AMBER. The failing
   rows are process rows with same-week owners, not product rows. Four named blockers can still
   move the date to Tue 9/8, and the date is announced to nobody outside George and Jon before
   Fri 8/28.

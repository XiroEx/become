# George - accounts, code, directories, launch ops

Launch day is **Tuesday 2026-09-01**. Today is **Tuesday 2026-08-25 (T-7)**. All times
America/New_York.

Master plan: `launch-plan.md`. Jon's list: `jon-checklist.md`. This file is only the things you
personally do.

**Four blocking items decide whether 9/1 holds.** They are all yours and three of them are today:

| Blocker | By |
|---|---|
| Phone pass on production, both themes, plus one cold signup on a fresh address | **Tue 8/25 22:00** |
| Magic link arrives and works, requested from `become.redbtn.io` (not beta) | **Tue 8/25 22:00** |
| Baseline numbers recorded in `measurement.md` | **Wed 8/26 22:00** |
| Stale renders re-rendered, `reviewedCampaigns.ts` truth-passed | **Wed 8/26 22:00** |

If the first two fail, call it tonight and move the launch to Tue 9/8. Nothing is announced to
anyone outside you and Jon before Fri 8/28, so the move costs nothing.

**Credential rule for this whole document: never write a password, a token, a recovery code, a
connection string, or a 2FA seed into any file, any commit, any log, or any message. Placeholders
only. Store the real values in the password manager and nowhere else.**

---

## Tue 8/25 (T-7) - the gate, and reserve the handles

### 1. Hand `jon-checklist.md` to Jon and get a yes on the date. (by 18:00)

Nothing else on this list matters if this stays open. Gate 5.3.

### 2. Phone pass on production. (by 20:00, 30 minutes)

Real phone, `become.redbtn.io`, **not** beta. Both themes.

- [ ] Dashboard, Training, Nutrition, Mind, Progress all render and work. Gate 1.2.
- [ ] Switch to light, repeat. Two theme defects are already known and open: Weekly Volume bars
      invisible in dark (`ProgressClient.tsx:560`) and the Generate range-slider track staying light
      in dark. Confirm whether either is visible in a normal walk-through. Gate 1.3.
- [ ] No "(beta)", no dev banner, no placeholder copy anywhere in the flow. Gate 1.6.
- [ ] Open an exercise demo. It plays on iOS or Safari. In Chromium it renders a black panel because
      `webapp/components/FramedVideo.tsx:39` emits `type="video/quicktime"`. Do not let that black
      panel reach a screen recording.

Write the result in `measurement.md` under a "gate log" heading, with the date and the phone used.

### 3. Cold signup on a fresh dummy address. (by 20:00, 15 minutes)

This is the row that most often looks fine and is not. Gate 1.5, 3.3, 3.4.

- [ ] Fresh address nobody has used. Request the link **from `become.redbtn.io`**. The magic-link
      host derives from the request origin, so a link requested on beta comes back pointing at beta.
- [ ] The email arrives. Time how long it takes.
- [ ] The link works, on the phone, in the mail app's browser.
- [ ] The brand-new account with zero history is coherent: no crashes, no page that reads as broken
      rather than empty. Progress and any trend surface will be single-point on a fresh account,
      which is expected. A single point is fine. A broken chart is not.
- [ ] Log one set. Confirm it saves.

**If this fails, that is a no-go, not a slip.** Move the date tonight.

### 4. Reserve the handles. (by 22:00, 20 minutes)

Instagram and TikTok. **The ranked candidate list and the in-form availability method live in
`accounts-setup.md` section 2** (top candidate `becomeapp.fit`). Take the highest-ranked string that
is free on **both** platforms so the names match, and record which one won.

Account specs, which `accounts-setup.md` does not cover:

| Field | Value |
|---|---|
| Account email | A dedicated mailbox, not your personal one. `become@<domain you control>` if you can create it, otherwise a `+become` alias on the mailbox you already own. Record which in the password manager. |
| Password | Generated, stored in the password manager. **Never written into this repo.** |
| 2FA | App-based TOTP, not SMS, on both accounts. Store the recovery codes in the password manager. Note here only that they exist, never the codes. |
| Account type | Instagram: Business, category **Health & Fitness** (needed for Insights and the link field). |
| Display name | `Become` |
| Bio | From `launch-day-copy.md`, 150 characters. Do not improvise one now. |
| Link | The tagged link from `measurement.md`. Do not paste an untagged `become.redbtn.io`. |
| Profile image | From the brand asset set after Wednesday's re-render. A placeholder today is fine. |

Instagram will probably want a phone number for verification. Use yours. Record in the password
manager which number is attached, because it decides who can recover the account later.

**Do not post anything yet.** The grid gets seeded Sunday 8/30, all at once, so it looks intentional.

### 5. Kick off the content agents. (by 22:00)

Invoke `become-marketing` for: `reels-scripts` (Pack A and Pack B per `launch-plan.md` section 6),
`content-calendar` (rows Tue 9/1 to Sun 9/13), `launch-day-copy` (captions, bios, push copy, six
FAQ answers), `web-app-listing` (lands as `listings.md`) (`web-app-listing` fields). Pack A is due **Thu 8/27 22:00** so Jon can
film Saturday.

---

## Wed 8/26 (T-6) - baseline, re-render, profiles

### 1. Record the baseline. 09:00. No fallback, does not slip. (30 minutes)

This is gate 4.4 and it is the row that makes the T+7 review possible. Three numbers, from the app
database (Atlas `jondonfitdb`, the one the production app actually uses - not the abandoned `become`
database on the fleet box).

Write a throwaway script next to the existing ones in `webapp/scripts/`, following the pattern the
others use to read `MONGODB_URI` from the local env. **Never paste the URI into a file, a log, or a
message.** Wrap the run in `timeout`.

Collect:

| Number | How | Goes in |
|---|---|---|
| New accounts per day, trailing 28 days | Group `User.createdAt` by day | `measurement.md` |
| Trailing-28-day daily average, and that x7 | Same aggregation | The baseline row of the T+7 review |
| Accounts with any activity | Count `UserProgress` documents with at least one workout log, weight, mood, or meal entry | `measurement.md` |
| Push subscriptions | Distinct `userId` count in `PushSubscription` | Guardrail 2 baseline |

**The push subscription count is a decision input, not only a number.** If it is under 15, push is
not a channel for this launch: skip the push, skip the push guard dev task, and record that in the
plan. The launch loses very little and you get Thursday morning back.

Also, from Jon's Tuesday numbers, apply the rebase rule in `launch-plan.md` section 11 and write the
final target into `measurement.md` with today's date. Do not move it again afterwards.

### 2. Re-render the campaign collection. **ALREADY DONE — Tue 8/25.** (10 minutes to verify)

The re-render happened at the 8/25 asset pass (`assets-manifest.md`): 49 truth-passed stills, 19
reviewed videos and the reel were rendered fresh into the **worktree's**
`/home/alpha/code/worktrees/become-launch-plan/marketing/out/`, against the seeded v2 captures.
Your Wednesday job is now:

- Verify the six grid-seed squares, the two story stills and rows 47/48/49 open and read clean.
- **Never post from the main checkout's `/home/alpha/code/become/marketing/out/`** — it still
  holds the five stale pre-truth-pass files (`26-coaching-after-the-gym`, `27-ask-your-coach`,
  `31-start-transformation`, `40-direct-coaching`, `41-questions-answered`). Delete them there
  today so nobody grabs one by name.
- Decide `assets-manifest.md` **F3** (the `+12.5 LB` / `+8.4%` metric chips on `Reviewed04`/`11` —
  recommend: strip them, two strings + two re-renders) and **F6** (pillar palette) by Fri 8/28.

### 3. Truth-pass the video library. **ALREADY DONE — Tue 8/25**, one ask left.

`Reviewed10` was recast (`10-cues-on-the-lift`, no chat thread — verified in the pass-3 contact
sheet). What remains: **ask Jon today whether "30-Day Shred" and "Build serious muscle" exist in
the app under exactly those names** (check V4 / O-5). If not, `Reviewed13`/`Reviewed14` and the
matching squares stay out, and every workout-hub crop stays above the Recommended row.

### 4. Preserve the frozen asset set. 12:00. (10 minutes)

`marketing/out/` is gitignored, so anything that must survive gets copied deliberately. Copy the
launch set to a durable local folder outside the repo, for example
`~/become-launch-assets/2026-09-01/`, and write the path into `launch-plan.md` section 9. **Do not
commit renders.**

### 5. Failure-case tests. 14:00. (15 minutes) Gate 1.7.

- [ ] Request a magic link, wait 20 minutes, click it. Confirm the expiry message is comprehensible
      and offers a way to get a new one. The link dies at 15 minutes and the user cannot see a clock.
- [ ] Sign up with a typo'd address. Confirm nothing looks broken and there is a way back.

### 6. Fill both social profiles. 15:00. (20 minutes)

Bio, tagged link, profile image, category. Copy comes from `launch-day-copy.md`. Still no posts.

### 7. Stand up the analytics upgrade. 16:00. (~2 hours — MOVED here from Thu 11:00 at the 8/25 review, because the render work fell off today's list)

Dev task 2 below, unchanged in content: Umami (or the tool of your choice) behind a script tag on
the landing page only. `user_id` and nothing else, ever. This rebalances Thursday under the 5-hour
line.

### 8. Start the community participation clock. 18:00. (10 minutes)

Subscribe to two relevant communities. Read the rules and the recent removals. **Post nothing.**
This is for the Tue 10/6 Product Hunt launch, not for 9/1. Drive-by launch links from an account with no
history get removed in minutes and burn the domain for the whole community.

---

## Thu 8/27 (T-5) - the two dev tasks

Both are small, both are optional in the sense that the launch has a defined fallback without them.
Neither is a product feature. **No other code ships this week.**

### Dev task 1 - the push guard. 09:00, roughly 90 minutes including the deploy.

`POST /api/admin/notify` already broadcasts to every user with a push subscription, and it is the
only broadcast path that exists. What it does **not** do today:

- check `UserProgress.notificationPrefs` at all
- respect quiet hours (21:00-07:00 local)
- check whether a product nudge already fired for that user today

The `push-notifications` guest rules require all three. Nine live product nudges already compete for
that tray, and a marketing push consumes the user's daily slot, so the product nudge has to win.

Add to the **broadcast branch only** (leave the single-email test path alone):

1. Skip any user whose `UserProgress.lastPushSentAt.*` has any timestamp from today.
2. Skip any user whose local hour is outside 07:00-21:00. Prefer the IANA `timezone` name over the
   stored `timezoneOffset`, which is a snapshot and is wrong for half the year. `localHourForUser`
   in `webapp/lib/notifications/cronNotify.ts` already does this.
3. Require an explicit `tag`; refuse to fall back to the route's default `admin-test`.
4. Return skipped counts alongside sent and errors, so launch day gives you a real number.

Branch `agent/alphaSystem-launch-push-guard` to `beta` to `main`. Use `/release become` and wait for
the build SHA to match the merge SHA. Merged is not deployed.

**Fallback if it does not merge by Fri 8/28 09:00: no push on 9/1.** Sending ungated is worse than
not sending. Losing one push costs a handful of opens; burning the channel costs the product a
retention surface.

### Dev task 2 - the analytics floor's upgrade. **Moved to Wed 8/26 16:00** (see Wed step 7). Spec below unchanged.

The floor (database counts) is already done as of Wednesday and it is what makes the review
possible. This is the upgrade that tells you **where people came from**, which is the only way to
answer "did Jon's post work" on 9/2.

Stand up a Plausible-class self-hosted tool. Umami is the cheapest of the three to run and fits the
fleet you already have. Put its script on the landing page only.

The rule that travels with it, permanently: **`user_id` and nothing else, ever.** No email, no
weight, no mood value, no meal contents, no goal, no body metric, in a property, a URL, or a page
title. Become stores health data and none of it leaves the app. Cookieless means no consent banner,
which also keeps a conversion tax off the page.

Two PWA gotchas to expect in the numbers, so you do not misread them later: a standalone launch from
the home screen has an **empty referrer** and looks like direct traffic, and the magic-link tab
handoff means one person can appear as two clients. Expect a large unattributable bucket and do not
explain it away.

**Not this week:** `/api/track` into our own Mongo. It is the durable answer and it is a build. Week
of 9/8.

> Final tool selection is George's call. This is a recommendation, not a decision, and nothing in
> the instrumentation tasks below depends on which option is chosen - the event names, properties,
> and the `track()` wrapper are identical either way.

### Also Thursday

- **11:00** F1 verify-handoff copy (`lifecycle.md` §5, 45 minutes): promote `Open Become` to the
  primary button on `/verify` success, drop the fake close countdown, add the spam-folder and
  same-device lines to the waiting screen. Branch `agent/alphaSystem-verify-handoff`. (F2 option
  (a), the 30-minute notification-prompt gate, ships Fri per `lifecycle.md` §7.)
- **14:00** Sceptical FAQ: **drafted at the 8/25 review in `launch-day-copy.md` — read it, verify
  the one flagged sentence (where the food photo goes), and sign it.** Gate 5.2. "It estimates
  portions, so it reads a chicken breast better than a mixed curry, and you correct anything it
  missed" beats "it is accurate."
- **15:00** Decide the support path: a monitored reply-to address plus Jon's DMs. Put the address in
  the FAQ. Gate 5.4.
- **16:00** Decide the light-mode LIVE capture: shoot it via `screenshot-capture`, or cut it. LIVE
  mode has `workout-log-dark.webp` and no light twin, and it is the mechanism we lead with. Cutting
  it is acceptable; the filmed screen recording carries the mechanism. Gate 2.3.
- **22:00** Pack A and Pack B scripts complete, sent to Jon.

---

## Fri 8/28 (T-4) - freeze, then decide go or no-go

### 09:00 - ASSET FREEZE

Anything not agreed today is out of this launch. Update `launch-plan.md` section 9 so it lists what
actually exists, by filename. **Sign each asset by name, not by folder.**

### 10:00 - constraint pass, all ten rows of gate section 6

Run against every frozen asset:

- [ ] No fabricated testimonials, counts, or results claims
- [ ] No pricing, tier, trial, or discount. **"Free" is the only permitted answer**, including on
      directory forms where "Freemium" is the tempting wrong click
- [ ] No promised timelines, pound counts, medical claims, before/after framing
- [ ] No body-shaming, guilt, or hustle framing
- [ ] No camera-roll photos of Jon. Everything is filmed for purpose on 8/29
- [ ] The Becoming appears exactly once, in `RYW-01`, and is not the headline theme
- [ ] No "(beta)" anywhere, in any frame
- [ ] Any benchmark carries its tier label and is never restated as a Become claim
- [ ] Light and dark both exist where both are used
- [ ] No secrets, tokens, or credentials in any file in this folder

### 11:00 - directory listings prepared, NOT submitted

**Fetch each live submission form before writing anything.** Field names and limits change, and a
listing written to a remembered spec gets rejected or truncated.

| Surface | Notes |
|---|---|
| **AlternativeTo** | Highest-intent directory available to us and heavily cited by AI answers. Licence **Free**, never Freemium. Platform **Web** and **PWA**, never iOS or Android. Only claim alternatives where the comparison is honest. |
| **PWA index #1 and #2** | Many read `webapp/app/manifest.json/route.ts` directly. Its `screenshots` array is **empty**, which is a real gap for these listings. Populating it from `webapp/public/screenshots/v2/` is a genuinely optional ten-minute dev task; skip it if anything above is still open. |

Fields that need a Become answer, ready before you open a form:

| Field | Answer | Never |
|---|---|---|
| Platform | Web, PWA. Installable from the browser on iOS and Android | iOS app, Android app |
| Pricing | Free | Freemium, Free trial, a number, "free for now" |
| Category | Fitness, Health, Lifestyle | Wellness, Medical |
| Rating | leave blank | any number |
| Downloads or users | leave blank | any number |
| Version | leave blank | an invented semver |
| Store links | leave blank, note that it is a PWA | a placeholder URL |
| Demo account | only if required, and only a dummy account | a real user, or a credential written anywhere |
| Founder | Jon Don, Founder and Head Coach | a camera-roll photo |
| Website | `become.redbtn.io` | any beta URL |

### 13:00 - mint every UTM

One campaign for the whole launch: `202609_public_launch`. Lowercase, underscores, source is a
property and medium is a mechanism. Record every link in `measurement.md` before it is pasted
anywhere, because a live listing often cannot be edited later.

| Placement | Link |
|---|---|
| Jon's launch post and story | `https://become.redbtn.io/?utm_source=instagram&utm_medium=social_organic&utm_campaign=202609_public_launch&utm_content=jon_launchhero` |
| Jon's link in bio | `https://become.redbtn.io/?utm_source=linkinbio&utm_medium=social_organic&utm_campaign=202609_public_launch&utm_content=jon_bio` |
| Brand link in bio | `https://become.redbtn.io/?utm_source=linkinbio&utm_medium=social_organic&utm_campaign=202609_public_launch&utm_content=brand_bio` |
| Brand IG posts | `...&utm_source=instagram&utm_medium=social_organic&utm_campaign=202609_public_launch&utm_content=<asset_id_lowercase>` |
| TikTok | `...&utm_source=tiktok&utm_medium=social_organic&utm_campaign=202609_public_launch&utm_content=<asset_id_lowercase>` |
| AlternativeTo | `https://become.redbtn.io/?utm_source=alternativeto&utm_medium=directory&utm_campaign=202609_public_launch` |
| PWA indexes | `...&utm_source=<index_name>&utm_medium=directory&utm_campaign=202609_public_launch` |
| The push | `/dashboard` - **internal, never tagged.** An internal UTM restarts the session and orphans the original source |

### 15:00 - GO / NO-GO

Second full pass of the readiness gate. Every row GREEN or explicitly accepted in writing. Call it
now, while nothing has been announced.

---

## Sat 8/29 (T-3) - filming and the last rehearsal

- **09:00-13:00** Run the film batch with Jon. You hold the phone, run the app, and keep the shot
  list moving. Order: `LAUNCH-HERO`, `CA-01`, `CA-02`, `LAUNCH-BTS`. Three takes each, then move on.
- **In the same session**, capture three screen recordings yourself: `WIW-01` (plate photo
  itemizing), `WIW-02` (LIVE mode, one set logged with "Last: X lbs x Y" visible), `MECH-01` (deeper
  photo logging, including where it guesses badly). **Record on iOS or Safari, never Chromium**, or
  the exercise demo panels render black. Dummy account only, full brightness, no tutorial overlays,
  nothing mid-animation, nothing loading, no empty state.
- **14:00** Rough cut of `LAUNCH-HERO` (take 2) only. **The `LAUNCH-HERO-B` trim and the `WIW-01`
  cut move to Sun 8/30 10:00** (8/25 review: Saturday was over five hours; Sunday had room). Keep
  the top 200px, bottom 250px, and right 120px clear of anything that needs reading.
- **16:00** End-to-end phone test again: land, sign up on a fresh dummy address, receive the link,
  log one set.
- ~~17:00 optional robots.ts / sitemap.ts~~ **CUT at the 8/25 review (D6).** Saturday already
  costs you 6+ hours; it moves to the week of 9/8. Day ends after the 16:00 e2e test.

---

## Sun 8/30 (T-2) - stage everything

- **10:00 Seed the brand grid: 6 posts**, all today, so the account is not empty on 9/1. Squares from
  the re-rendered `out/collection/square/`, one per pillar plus the hero. **No launch announcement in
  any of them.** Record the six filenames in `launch-plan.md` section 9. If the render did not
  happen, seed 3 from `webapp/public/screenshots/v2/`. Three posts reads alive; zero reads abandoned.
- **12:00** Every launch-day caption staged with its asset attached, in the scheduler or a notes file
  you can post from on your phone.
- **14:00** Send Jon every caption written in his name. He returns voice notes. Retype from what he
  actually said.
- **16:00** Confirm the push against `lifecycle.md` §2.2 — **confirm, do not rewrite.** Title `One
  photo, the whole plate`, body `Photograph your lunch in Nutrition. It comes back itemized.`,
  `url: /dashboard/nutrition` (not `/dashboard` — the route default must be overridden),
  `tag: launch-2026-09-01`, preference key `mealReminder`.

---

## Mon 8/31 (T-1) - lock it down

- **09:00** Block the reply hours in both calendars. Jon 09:00-20:00, you 09:00-18:00 tomorrow.
- **10:00** Merge `agent/alphaSystem-listing-metadata` (`listings.md` §4: DEV-1 manifest
  description, DEV-2 manifest screenshots, DEV-3 OG/Twitter metadata, DEV-5 title, DEV-6 hardcoded
  meta description, plus the DEV-4 OG image at `webapp/public/og/become-og.png` rendered Fri).
  Roughly 2.5 hours including the `/release become` wait. **This is the last merge before the
  freeze** — without it every link shared on 9/1 unfurls as a bare URL. Verify the rendered card on
  `become.redbtn.io`, not beta.
- **11:00** Final sweep of the staged posts: no "(beta)", no empty state, no invented claim, "free"
  said correctly, no number anywhere.
- **13:00** Signup test one more time, **on cellular, not wifi**.
- **15:00 Freeze `main`.** No production deploys until Wed 9/2 unless something is on fire. A deploy
  that breaks the landing at 10:00 tomorrow is the worst available outcome.
- **20:00** Send Jon his exact links for tomorrow, so he uses tagged ones and not a URL he types.

---

## Tue 9/1 - launch day operations

You make nothing today. If an asset is being produced today, Friday's freeze failed.

| Time | You do |
|---|---|
| 07:00 | Production check: site up, landing renders on a phone in both themes, signup works on a fresh dummy address. Ten minutes. |
| 07:15 | Snapshot the primary metric so the day has a clean start line. Write it in `measurement.md`. |
| 09:00 | Reply block opens. Brand account and anything technical. |
| 09:30 | Confirm Jon's story is up with the tagged link sticker. |
| 10:05 | Post `LAUNCH-HERO` on the brand account with the strangers-facing caption. |
| 10:30 | Submit **AlternativeTo**. Licence Free. Platform Web, PWA. Rating, downloads, version blank. |
| 11:00 | Submit the two PWA indexes. |
| 12:30 | **Send the push per the `lifecycle.md` §2.5 runbook**: dry run 07:20, invoke #1 07:30 (only if members east of ET exist), **#2 12:30**, #3 15:30 — idempotent per member, one push each. `tag: launch-2026-09-01`, `url: /dashboard/nutrition`. Record attempted / delivered / pruned / skipped. If the guard did not merge, **do not send.** |
| 16:00 | Post `WIW-01` on the brand account. |
| 18:00 | **Snapshot the primary metric and both guardrails.** Signups since 07:15, push sent and errors, any report of a broken signup. |
| 20:30 | Ten-line written debrief with Jon in `measurement.md`. Written, not a phone call, so T+7 has it. |
| any time | **If the site goes down: text Jon to stop posting immediately.** Fix it, then resume. Traffic sent at a broken landing page is worse than no traffic, and the borrowed reach was single-use. |

---

## Wed 9/2 to Tue 9/8

| Day | You do |
|---|---|
| Wed 9/2 09:00 | Read yesterday's numbers into `measurement.md`: signups, source split, push counts, comment and DM volume. |
| Wed 9/2 10:00 | Post `LAUNCH-BTS` on the brand account. |
| Wed 9/2 14:00 | Open Product Hunt prep for **Tue 10/6**. Draft the maker comment in Jon's first person; he rewrites it. Honesty about limits outperforms polish there. |
| Thu 9/3 10:00 | Post `MECH-01`. 12:00 first TikTok cross-post (`WIW-02`). 15:00 remaining directory submissions, one at a time, about a week apart so a change in signups is attributable. |
| Fri 9/4 09:00 | Pull the most-asked launch question out of the comments and DMs. Send it to Jon to film as `QA-01`. 12:00 post `ONETAP-01`. 17:00 post `QA-01`. |
| Sat 9/5 11:00 | Post `PTW-01`. |
| Sun 9/6 16:00 | Mid-week read: are new signups logging anything, or did they sign up and leave? One aggregation. |
| Mon 9/7 11:00 | Post `RYW-01`. It carries the single permitted The Becoming mention. **US Labor Day - expect low engagement and do not read it as a trend.** |
| Mon 9/7 15:00 | Assemble the T+7 review inputs. |
| **Tue 9/8 10:00** | **Run the post-launch review with Jon**, 45 minutes, template pre-filled in `launch-plan.md` section 12. |
| Tue 9/8 11:30 | Open the two deferred builds: the email unsubscribe route with `List-Unsubscribe` and `List-Unsubscribe-Post` headers plus a real suppression store, and `/api/track`. Both are now week-of-9/8 work. |
| Tue 9/8 12:00 | Confirm or move the Product Hunt date. |

---

## Why there is no launch email

Become has no unsubscribe route, no suppression store, and no `List-Unsubscribe` header.
(`/api/notifications/unsubscribe` is web push, not email.) Until those exist, only transactional
email may send, and a launch announcement is not transactional.

The failure mode is specific: a marketing send with no unsubscribe generates complaints, complaints
poison the sending domain, and the domain that gets poisoned is the one that carries the **magic
links**. Losing a marketing channel is recoverable. Losing the login channel is not. For roughly 60
addresses, the trade is obviously bad.

**The one carve-out:** Jon messaging up to 15 warm clients individually, hand-typed, from his own
accounts, is ordinary correspondence between a coach and his clients. It does not go through
`webapp/lib/email.ts` and it must not become a template pasted sixty times.

The unsubscribe build is scheduled for the week of 9/8, which opens the email channel for the weekly
recap. The recap is the strongest email we will ever send, because it is entirely about the reader
and entirely true. It is worth doing properly rather than in a rush this week.

# Listings: directories, Product Hunt, and the install surfaces

**Owner of this document:** listings agent, executing `web-app-listing`.
**Window:** Tue 2026-08-25 → Tue 2026-09-01 (launch) → Tue 2026-10-06 (Product Hunt).
**Canonical link everywhere:** `https://become.redbtn.io`. Never a beta host. "(beta)" appears in no
field, no caption, and no image.

Character counts below are exact, counted as the raw string including spaces and punctuation.
Note for anyone cross-checking against `web-app-listing/references/field-specs.md`: that file prints
`(157)` beside the standard blurb, and the string as written is **146**. The counts in this document
were computed, not estimated.

---

## 0. Product Hunt timing decision: DEFER to Tue 2026-10-06

**Decision: do not launch on Product Hunt on 9/1.** The full kit is written below and is
submission-ready; it sits until 10/6.

Why, assessed honestly for a launch that starts from zero on 8/25:

1. **Product Hunt is one shot per product and its ranking is a day-one velocity contest.** On 9/1 we
   have zero brand followers, zero TikTok followers, no X account, a Product Hunt account with no
   history, and no legal way to email the roughly 60 existing users (the `email-lifecycle` compliance
   gate blocks non-transactional sends until an unsubscribe route and `List-Unsubscribe` headers
   exist, and neither is in the codebase). The only warm audience is Jon's Instagram, whose size is
   unknown as of today. A launch with no distribution behind it spends the one shot for single-digit
   upvotes and a page nobody links to.
2. **The permanent page is the actual prize and it does not expire.** Product Hunt pages rank and get
   cited by AI answer engines. That value is identical on 10/6 and it is much larger if the page shows
   a product with a footprint.
3. **The listing's own dependencies are not ready.** The gallery needs 1270x760 landscape composites
   that do not exist yet, a shared link still renders as a bare URL because `webapp/app/layout.tsx`
   ships no Open Graph block (verified live today), and the reusable video renders predate the 8/25
   truth pass. See §4.
4. **9/1 is already fully booked for the two humans we have.** Product Hunt day means a 12:01am PT
   post and a full day of comment replies. George and Jon are already carrying launch posts, DM
   replies, and push on 9/1. Stacking Product Hunt on top guarantees both are done badly.

**What has to be true by 10/6, as entry conditions rather than hopes:**

- Four weeks of the content cadence in `accounts-setup.md` have actually run.
- George's Product Hunt account has real history: five minutes a day from Wed 8/26, commenting on
  other launches. Never asking for upvotes, which is against their rules.
- The Open Graph card and the manifest screenshots have shipped to production (dev tasks in §4).
- At least three directory pages from §3 are live, so a Product Hunt visitor who searches the name
  finds a product with a footprint rather than one page.
- The 1270x760 gallery composites exist at `marketing/out/listings/ph-01..06.png`.

**What we do on 9/1 instead:** publish the Product Hunt **"Coming soon" / upcoming page** (§3, row 6),
which collects notify-on-launch followers for 10/6 without spending the launch, and submit the two
evergreen surfaces that need no audience at all. If the upcoming-page surface is not available in the
product on the day, skip it. It blocks nothing.

**Hunter recommendation: self-hunt, with Jon as the maker who posts.** A borrowed hunter is a
low-yield ask from people we have no relationship with, and hunter-driven upvote power has largely
stopped being the mechanic it once was. The first comment carries the weight, and the first comment
should be from the person who wrote the programs.

**Launch slot when it happens:** Tuesday 2026-10-06, live at **12:01am PT**, which gives the full
24-hour window. Avoid Monday (crowded) and Friday (thin). Check the upcoming-launch feed the week
before and do not go on the same day as another fitness or coaching product.

---

## 1. The reusable kit

Written once, pasted everywhere. Divergent listings are how one product looks like three products to a
crawler. Do not re-write these per surface.

| Field | Copy | Count |
|---|---|---|
| Name | `Become` | 6 |
| Tagline (40) | `Coach-built training, food, and mind` | 36 |
| Short blurb (60) | `A coach's programs, food logged by photo, and mind work` | 55 |
| **Standard blurb (160)** | `Coach-built training programs, food logged from one photo of the plate, mind sessions, and a weekly recap. Free today, sign in with an email link.` | 146 |
| Extended blurb (260) | `Become is a coach-built fitness app that runs the plan in one place. Multi-phase programs from coach Jon Don, an AI session generator, set logging that recalls your last weight, food logged from a photo of the plate, and mind sessions. Free today, no card.` | 256 |
| Website | `https://become.redbtn.io` | — |
| App Store / Play Store | leave blank, note "progressive web app" | — |
| Pricing | **Free.** Never Freemium, never Free trial, never a number. | — |
| Platform | Web, PWA. Installable on iOS and Android from the browser. | — |
| Categories | Fitness (primary), Health, Lifestyle — matching the manifest `categories` array | — |
| Tags | `pwa`, `web-app`, `workout-tracker`, `nutrition`, `meal-logging`, `habit-tracking`, `coaching`, `free` | — |
| Rating / reviews / downloads / version | leave blank, every one of them | — |
| Founder | Jon Don, Founder and Head Coach. No photo from a camera roll. | — |

**Long description (94 words), for any surface with a long field:**

> Become is a fitness app built around a coach. Jon Don writes the multi-phase programs and the app runs
> them: an AI session generator for the days the plan does not fit, set logging that shows what you
> lifted last time, food logged from a photo of the plate, short mind sessions, and a weekly recap. It is
> a progressive web app, so it runs in the browser and installs to the home screen. Free today, sign in
> with an email link, with Google, or with a passkey. No password and no credit card.

**Three things that never go in a listing field**, because a directory entry is the hardest place to
quietly correct a claim:

1. That the camera watches a set or counts reps. LIVE mode is the live **logging** screen and every
   number in it is typed. The camera does whole-plate photo logging, the barcode scanner, and the Mind
   mirror scene.
2. That every exercise has a demo clip. 39 of the 132 do. "The big lifts have a clip" is the true
   version.
3. That there is a store listing, a price, a tier, a trial, or a discount.

---

## 2. The Product Hunt listing

Submission-ready. Fields per Product Hunt's current form; re-read the live form on 10/6 before pasting,
because limits change.

### The listing

| Field | Copy | Count / limit |
|---|---|---|
| Name | `Become` | 6 / 40 |
| Tagline | `The coach writes the phases. Your phone runs them.` | 50 / 60 |
| Description | `Become is a coach-built fitness app that runs the plan in one place. Multi-phase programs from coach Jon Don, an AI session generator, set logging that recalls your last weight, food logged from a photo of the plate, and mind sessions. Free today, no card.` | 256 / 260 |
| Topics (3) | `Fitness`, `Health & Fitness`, `Web App` | — |
| Links | `https://become.redbtn.io` | — |
| Pricing | **Free** | — |
| Thumbnail | 240x240, produced by `image-production` from `webapp/public/icons/icon.svg` → `marketing/out/listings/ph-thumb-240.png` | — |
| Video | **Leave empty.** `marketing/out/become-reel.mp4` predates the 8/25 truth pass and the 19 spots in `marketing/out/videos-reviewed/` are 6-8s, which is too short to read as a demo. A purpose-cut 45s screen recording from the 8/26 filming session is the only acceptable fill. | — |
| Makers | Jon Don (maker, posts the first comment), George (maker) | — |

### First comment, from Jon (139 words)

Written through `coach-brand-voice`. First person throughout, one idea, no client story, no result
claim, no count. The product CTA is not glued to the end of his paragraph.

```
I coach people for a living, and the same thing kept breaking. I would write someone a good program, and
by week three their training was in one app, their food was in another, and the actual plan was a note on
their phone. Nobody keeps that up.

So the programs I write are in here, phase by phase, with the progression already set. You log the set
while you are standing there and your last numbers are on the screen. You photograph the plate instead of
typing four foods into a search bar at 9pm. On Sunday you read what actually happened.

It is free today and it signs you in with an email link. What I want to know is where the plan stops
fitting your week, because that is the part I cannot see from here.
```

**Needs Jon's sign-off:** "I coach people for a living" and "I would write someone a good program"
both assert his practice. He confirms or rewrites before this posts. Nothing in it names a client or a
result, which is the line that must not move.

### Gallery manifest

Product Hunt's gallery is **1270x760 landscape**; our captures are 780x1688 portrait. Each entry below
is a composite that `image-production` builds by placing the named capture on a brand field with the
caption line set in Geist. Output paths are fixed so the rest of the plan can reference them.

| # | Composite | Source capture | Theme | Caption on the frame | Why this position |
|---|---|---|---|---|---|
| 1 | `marketing/out/listings/ph-01.png` | `webapp/public/screenshots/v2/dashboard-light.webp` | light | The whole day on one screen | Makes the product legible to someone who has never heard of it |
| 2 | `marketing/out/listings/ph-02.png` | `webapp/public/screenshots/v2/workout-log-dark.webp` | dark | Log the set. Last session's numbers are already there | The differentiated mechanic, second. Dark by necessity, and it reads as the in-gym screen |
| 3 | `marketing/out/listings/ph-03.png` | `webapp/public/screenshots/v2/nutrition-meal-light.webp` | light | A day of meals, itemized against your targets | **Caption must not say "photographed."** The capture manifest records that these meals were typed through food search |
| 4 | `marketing/out/listings/ph-04.png` | `webapp/public/screenshots/v2/generate-light.webp` | light | Tell it your equipment and your time | The sheet, not the output. Nothing is claimed about what it generates |
| 5 | `marketing/out/listings/ph-05.png` | `webapp/public/screenshots/v2/progress-light.webp` | light | Your training log: volume, history, PRs | **Not** a weight-trend caption. `/dashboard/progress` is the Training Log; a trend caption is disproved by the shot |
| 6 | `marketing/out/listings/ph-06.png` | `webapp/public/screenshots/v2/mind-light.webp` | light | Short guided sessions | Closes on the hub that surprises people |

Theme logic, stated so nobody "fixes" it later: light throughout except position 2, which is the only
LIVE-mode capture we have and is dark only. Producer: `image-production`. Due **Mon 9/28** for a 10/6
launch, not this week.

### Submission checklist

| Item | Answer |
|---|---|
| Account needed | Product Hunt account for Jon (maker, posts) and George (maker). Jon's needs creating: **HUMAN task, 15 min, Wed 9/23**. |
| Who submits | Jon posts. George stages the draft. |
| When | Tue 2026-10-06, live 12:01am PT. |
| Rules restated | One launch per product, so no do-over. Never ask for upvotes anywhere, in any wording. Makers must be real people on the product. Editing after going live is limited, so proof the draft the day before. |
| Embargo | Nothing is posted about the Product Hunt page before it is live. |
| Follow-up | Both makers reply to every comment for the full 24 hours. Jon answers anything about coaching; George answers anything technical. |
| Where the link gets shared | Brand Instagram story, Jon's story, and the in-app push audience. Wording is "we are live on Product Hunt today", never "go upvote". |
| UTM | `?utm_source=producthunt&utm_medium=listing&utm_campaign=ph-1006`, reconciled against the `analytics-tracking` grammar. |

### Alternatives for the tagline (Product Hunt limit 60)

| Option | Count | Rationale | Wins when |
|---|---|---|---|
| `The coach writes the phases. Your phone runs them.` | 50 | **Chosen.** Two sentences, a division of labour, no adjective. Works with the name removed. | The reader is scanning a feed of taglines that all claim to be all-in-one. |
| `Coach-built training, food from a photo, mind sessions` | 54 | Names three mechanics in the space most products spend on one adjective. | The audience is feature-literate and comparing tools. |
| `A coach's plan, run by your phone` | 33 | Shortest, cleanest, and it survives truncation anywhere. | The surface renders the tagline small or clips it. |

---

## 3. Other surfaces, ranked by effort to value

Liveness checked from this machine on Tue 8/25 with a bounded `curl`. A `403` means the host is up and
bot-blocked at the edge, which is normal and not a problem for a human with a browser.

| # | Surface | Status today | Effort | Value | Owner / day |
|---|---|---|---|---|---|
| 1 | AlternativeTo | 403, alive | 25 min | Highest-intent traffic available to us; heavily cited by AI answers to comparison questions | George, **Fri 8/28** |
| 2 | Uneed (uneed.best) | 200 | 20 min | Daily launch feed plus a permanent page, at a fraction of Product Hunt's stakes. The right way to have a directory moment on launch day | George, **Tue 9/1** |
| 3 | findpwa.com | 200 | 10 min | PWA-specific, permanent, and it reads the manifest, which is exactly why §4's manifest gaps ship first | George, **Tue 9/1** |
| 4 | SaaSHub | 403, alive | 20 min | Permanent comparison page in the same shape as AlternativeTo | George, **Tue 9/8** |
| 5 | Fazier | 200 | 15 min | Launch feed with a durable page, low stakes, good practice run before 10/6 | George, **Tue 9/15** |
| 6 | Product Hunt "Coming soon" page | 403, alive | 20 min | Collects notify-on-launch followers for 10/6 without spending the launch | George, **Tue 9/1** |
| 7 | BetaList | 200 | 15 min + spend decision | Durable page, small burst. The paid queue skip is a spend decision owned by `marketing-plan`, not by this document | George, **Tue 9/22** |
| 8 | Reddit r/SideProject weekly share thread | rules-first | 15 min | Real humans at the exact moment of the problem, and real risk | George, **Sat 9/5**, only after reading the sidebar, the pinned rules, and recent removals |

**Skip, with the reason, so nobody re-proposes them:** `appsco.pe` returned 503 on 8/25 (re-check in a
browser once; if it is still erroring, drop it). `progressiveapp.store` returned no response at all.
`pwa-directory.appspot.com` returned 404 and is dead. Paid "listed on 100 directories" packages: low
quality, no traffic. Any surface demanding a store link, a rating, a review count, or a download number:
we do not have them and we will not fake them. Startup Stash and LaunchingNext: aggregator tier, no
durable referral, skip unless a spare 15 minutes exists in October.

**Cadence rule:** one surface at a time with roughly a week between, so a change in signups is
attributable. The three on 9/1 are the deliberate exception, because launch day is the one day a
coordinated moment is worth more than clean attribution. Every submission gets a tracker row: surface,
date, submitter, live URL, UTM, referral traffic at 30 days.

### 3.1 Field copy per surface, ready to paste

Everything not named below comes from the kit in §1 unchanged.

**AlternativeTo**

- Name: `Become` (6)
- Short description: `A coach's programs, food logged by photo, and mind work` (55)
- Long description: the 94-word long description from §1.
- Licence: **Free**. Not Freemium.
- Platforms: **Web**, and the PWA / self-hosted-web option if one is offered. Not iOS, not Android,
  even though it installs on both, because that field means a native app there.
- Categories: Health & Fitness; Sport & Health.
- Tags: `pwa`, `workout-tracker`, `nutrition`, `meal-logging`, `coaching`, `free`.
- Screenshots: upload `dashboard-light.webp`, `workout-log-dark.webp`, `generate-light.webp`,
  `progress-light.webp` converted to PNG by `image-production` (AlternativeTo does not reliably accept
  webp). Output `marketing/out/listings/alt-01..04.png`, 780x1688 preserved.
- **Alternatives claimed: leave empty on submission.** Claiming an alternative-to relationship we have
  not verified gets the entry flagged, and which comparisons are honest is owned by
  `competitor-analysis`, whose output does not exist yet. Candidates for that agent to rule on, in
  order of plausibility: MyFitnessPal (food logging), Hevy and Strong (set logging), Fitbod (generated
  sessions). Add them in a second edit once ruled.

**Uneed**

- Tagline: `Coach-built training, food, and mind` (36)
- Description: the 256-character extended blurb.
- Category: Health & Fitness.
- Pricing: Free.
- Image: `marketing/out/listings/uneed-cover.png`, 1200x630, produced by `image-production` from the
  re-rendered Open Graph still. Due Mon 8/31.
- Launch day: Tue 9/1. Comment replies from George the same day.

**findpwa.com**

- Name, URL, one-liner: `Coach-built training, food, and mind` (36)
- Category: Health & Fitness.
- **It reads the live manifest.** Dev tasks DEV-1 and DEV-2 in §4 must be merged to `main` before this
  is submitted, or the directory renders our current manifest description, which contains a banned word
  and contradicts the landing page.

**SaaSHub**

- Name, tagline (36), standard blurb (146), long description (94 words), pricing Free, platform Web.
- Alternatives: same rule as AlternativeTo. Empty until `competitor-analysis` rules.

**Fazier**

- Tagline (36), extended blurb (256), category Health & Fitness, pricing Free, cover
  `marketing/out/listings/uneed-cover.png` reused at 1200x630.

**Product Hunt "Coming soon" page**

- Name `Become`, tagline `The coach writes the phases. Your phone runs them.` (50), the 256-character
  description, topics as in §2, thumbnail `ph-thumb-240.png`.
- Nothing else. The gallery and the first comment are held for 10/6.

**BetaList**

- Tagline (36) and the 256-character extended blurb, which is the length this tier of surface asks for.
- One image: `marketing/out/listings/uneed-cover.png`.
- Check eligibility first: some early-stage indexes only accept pre-launch products, and Become has
  been live for months.

**Reddit, r/SideProject weekly thread**

- Rules in order: sidebar, pinned rules, recent removals. If self-promotion is banned outside the
  weekly thread, the weekly thread is the only option. If it is banned outright, do not post; there is
  no clever version of this.
- Disclosure is the first line, plainly. Post body, ready to paste:

```
I built this. Become is a fitness app I built with a coach, Jon Don. He writes the multi-phase programs
and the app runs them: set logging that shows what you lifted last time, food logged from a photo of the
plate rather than four searches, short mind sessions, and a weekly recap. It is a PWA, so it runs in the
browser and installs to the home screen, and it is free today with an email-link sign-in.

The part I would genuinely like feedback on is the photo logging. It estimates portions, so it reads a
chicken breast better than a mixed curry, and you correct anything it missed. I want to know where it
falls over for other people.

https://become.redbtn.io
```

- No sock puppets, no "has anyone tried this" posts, no upvote rings, no invented user story. Answer
  every reply.

---

## 4. Install-surface check, verified against the repo and production today

Verified 2026-08-25 by reading the repo at this worktree and by fetching production:

- `https://become.redbtn.io` returns HTTP 200 with `<title>BECOME</title>`, one `<meta name="description">`,
  and **no `og:*` and no `twitter:*` tags at all**.
- `https://become.redbtn.io/manifest.json` returns `"description":"Transform your body and mind with
  personalized fitness coaching."` and `"screenshots":[]`.
- `https://become.redbtn.io/robots.txt` → 404. `https://become.redbtn.io/sitemap.xml` → 404. (The
  Cloudflare-managed robots.txt is confirmed off, matching the brief.)

Consequence in one line: **every link shared on launch day, in every group chat and on every directory
that pulls a preview, renders as a bare URL.** That is the highest-value fix on this page.

| # | Gap | File | Fix | Owner | Ship by | Blocking? |
|---|---|---|---|---|---|---|
| DEV-1 | Manifest description reads `Transform your body and mind with personalized fitness coaching.` It uses a banned word and contradicts both the landing page and every field in §1. | `webapp/lib/appChannel.ts` (`APP_DESCRIPTION`) | Set to `Coach-built training programs, food logged from a photo, mind sessions, and a weekly recap. Free today.` (103, and the first 100 carry the message so it survives the ~120-char Android install-sheet truncation) | George | **Mon 8/31** | Yes, findpwa reads it |
| DEV-2 | `screenshots: []` in the manifest, so richer install UI never appears and manifest-reading directories find nothing. | `webapp/app/manifest.json/route.ts` | Four entries, `form_factor: "narrow"`, `type: "image/webp"`, `sizes: "780x1688"`: `/screenshots/v2/dashboard-light.webp`, `/screenshots/v2/workout-log-dark.webp`, `/screenshots/v2/nutrition-meal-light.webp`, `/screenshots/v2/generate-light.webp`. All four already exist in `webapp/public/`. | George | **Mon 8/31** | Yes |
| DEV-3 | No `metadataBase`, no canonical, no `openGraph`, no Twitter card. | `webapp/app/layout.tsx` | `metadataBase: new URL('https://become.redbtn.io')`; `openGraph.title` = `Become - a coach's plan, run by your phone` (42); `openGraph.description` = `Training, food, and mind in one app. Free today.` (48, and OG descriptions clip near 90 characters in mobile previews so the whole message is inside it); `openGraph.images` = the DEV-4 asset with alt `The Become dashboard showing today's streak, mood, goal progress, and calories` (78); `twitter.card = 'summary_large_image'`. | George | **Mon 8/31** | Yes |
| DEV-4 | No OG image exists in the repo. `marketing/out/become-open-graph.png` is local-only (gitignored) and predates the 8/25 truth pass. | produce → `webapp/public/og/become-og.png`, 1200x630 | `remotion-assets` re-renders (`npm run render:og`, wrapped in `timeout`) **after** the pillar-palette vs brand-token discrepancy is settled, then `image-production` exports to the repo path with `sharp`. No new image dependency. | agent (render), George (commit) | **Fri 8/28** | Yes, DEV-3 depends on it |
| DEV-5 | `<title>` is `BECOME`, straight from `NEXT_PUBLIC_APP_NAME`, and carries no searchable phrase. | `webapp/app/layout.tsx` | `title: { default: 'Become - coach-built training, food, and mind' (45), template: '%s · Become' }`. Note the in-file comment: routing this through `APP_NAME` would restyle production's title as a side effect, so set the metadata title directly and leave `appChannel.ts` alone here. | George | **Mon 8/31** | No, but it is a 10-minute change |
| DEV-6 | The meta description on production comes from `NEXT_PUBLIC_APP_TAGLINE`, which is a RedRun env value, not repo code. A repo-only fix does nothing until the code stops reading the env. | `webapp/app/layout.tsx` | Hardcode `description` to the 146-character standard blurb and leave the env var for the app name only. Env values are baked at container start, so an env-side fix needs a container recreate; the code-side fix ships with the normal merge. | George | **Mon 8/31** | No |
| DEV-7 | `/share/[shareId]` sets `title` and `description` but no OG image and no Twitter card, and it renders `NEXT_PUBLIC_APP_NAME` raw, which is `BECOME` on production and `BECOME (beta)` on beta. | `webapp/app/share/[shareId]/page.tsx` | Add `openGraph` and `twitter` to `generateMetadata`, reusing the DEV-4 image. Source the name from `APP_NAME` in `appChannel.ts` rather than the raw env. | George | Tue 9/8 | No |
| DEV-8 | No `beforeinstallprompt` handler exists anywhere in `webapp/`. Nothing ever prompts an install. | new component | Copy is written and ready: Chromium variant `Add Become to your home screen / Opens full screen, no browser bar, and reminders can reach you.` iOS Safari variant `Add Become to your home screen / Tap the Share button, then Add to Home Screen. It opens full screen, like an app.` Show the iOS variant only to iOS Safari. Timing rules (never on first load, after the first earned win, one dismissal buys a week of silence, never stacked with the push permission ask) are owned by `signup-activation`. | George | Tue 9/15 | No |
| DEV-9 | `robots.txt` and `sitemap.xml` both 404. | `webapp/app/robots.ts`, `webapp/app/sitemap.ts` | Out of launch scope per the brief (the domain decision is open). Listed so it is a decision rather than an oversight. A missing robots.txt does not block crawling; a sitemap is 20 minutes whenever the domain settles. | George | Post-launch | No |

**Shipping route for all of the above:** one branch, `agent/alphaSystem-listing-metadata`, PR to `beta`,
then `main`. Both channels autodeploy, so merging to `main` is the production deploy and it has to be
merged by **Mon 8/31** for production to carry it on 9/1. `NEXT_PUBLIC_APP_NAME` differs per channel by
design, so verify the rendered card on `become.redbtn.io` and not on beta.

**Channel leakage check before any listing is submitted:** open the exact URL being submitted, confirm
the title and manifest name read `Become` and not `Become (beta)`, and confirm no capture in the gallery
shows "(beta)" anywhere.

---

## 5. Constraint compliance for this document

- No pricing, tier, trial, discount, count, rating, testimonial, result claim, promised timeline, or
  before/after framing appears in any field above. Pricing is "Free" and nothing else.
- No claim that the camera watches a set. LIVE mode is described as logging in every field.
- No claim that every exercise has a demo clip; the phrase used is "the big lifts".
- The Becoming is not mentioned in any listing field at all, which is the correct answer at these
  lengths.
- No credential, token, or dummy-account password appears anywhere. No surface in §3 requires a demo
  login; if one later does, a dummy account from the capture pipeline is the only acceptable answer and
  its credential is never written into a file.
- Every capture path cited resolves in `webapp/public/screenshots/v2/`. Every `marketing/out/` path is
  local-only and gitignored, and is named as something to be produced rather than assumed present.
- Every caption in the gallery manifest was checked against `webapp/public/screenshots/v2/manifest.json`,
  including the three traps it records: the progress screen is the Training Log and not a weight trend,
  the nutrition meals were typed rather than photographed, and trend charts on a dummy account are
  single-point because no app API can backdate weight or mood.

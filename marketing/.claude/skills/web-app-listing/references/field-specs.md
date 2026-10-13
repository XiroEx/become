# Field Specs and the Reusable Kit

Write the kit once. Reuse it everywhere. Drift between listings is what makes a small product look
like three different products to a crawler and to a human comparing tabs.

Character counts below are illustrative of the target, and every one must be recounted when the copy
changes. Print the count beside every field in your output.

---

## The kit

### Name

`Become`

Never "Become (beta)". Never "Become - Fitness App" unless the form's name field is doubling as the
title tag, in which case check whether a separate title field exists first.

### Tagline, 40 characters

The tagline must work with the brand name removed, because most surfaces render it as
`Become — <tagline>`.

| Option | Count | Wins when |
|---|---|---|
| Coach-built training, food, and mind | 36 | Default. States the scope and the credibility source. |
| A coach's plan, run by your phone | 33 | Emphasis on the division of labour. |
| One app for training, food, and mind | 36 | Emphasis on consolidation. |

❌ "Become your best self" (a pun on the name, communicates nothing)
❌ "The ultimate fitness companion" (true of forty apps)

### Short blurb, 60 characters

`A coach's programs, food logged by photo, and mind work` (55)

Used in comparison tables and roundup rows where the reader is scanning ten of them.

### Standard blurb, 160 characters

Write this one first. Everything else derives from it.

```
Coach-built training programs, food logged from one photo of the plate, mind sessions,
and a weekly recap. Free today, sign in with an email link.
```
(157)

Structure: two mechanics, the scope, the cost, the first step. No adjectives.

### Extended blurb, 260 characters

```
Become is a coach-built fitness app that runs the whole plan in one place. Multi-phase
programs from coach Jon Don, an AI session generator, set logging that recalls your last
weight, food logged from a photo of the plate, and mind sessions. Free today, no card.
```
(262)

The extra 100 characters buy the coach's name, the AI generator, and the set-logging mechanic. If
the extended version says nothing the standard one did not, cut it back.

**Three things a listing must never say**, because all three have been drafted at least once and a
directory listing is the hardest place to quietly correct a claim:

- That the camera watches a set or tallies repetitions. LIVE mode is the live *logging* screen and
  every number in it is typed. The camera is for whole-plate photo logging, the barcode scanner,
  and the Mind mirror scene.
- That every exercise has a demo clip. 39 of the 132 do. "The big lifts have a clip" is the true
  version.
- That the app is in an app store, or that there is a price, a tier, a trial, or a discount. It is a
  PWA, it is free today, and no pricing exists.

### Long description, 120 to 250 words

Fixed four-part structure. Do not improvise the shape.

1. **What it is**, in two sentences. The category frame plus the coach.
2. **The five hubs**, one short paragraph or five labelled lines. Mechanics, not adjectives.
3. **Who it is for**, one paragraph. Behavioural, not demographic: people whose plan is currently
   spread across three apps and a notes file.
4. **How to start**, two sentences. Email link, no credit card, runs in the browser, installs to the
   home screen.

Worked version:

> Become is a fitness app built around a coach. Jon Don writes the multi-phase programs, and the app
> runs them for you.
>
> **Training.** Coach-built programs plus an AI generator for the days the plan does not fit: tell
> it the equipment in front of you and the time you have. The big lifts carry a demo clip you can
> watch mid-set. LIVE mode holds one set on the screen with what you lifted last time sitting right
> underneath it, and starts your rest timer when you tick it off.
> **Nutrition.** Photograph the plate and it comes back itemized with calories and macros. Scan a
> barcode when the food came out of a box. Targets are set from your own numbers.
> **Mind.** Short guided sessions and a daily mood check-in.
> **Progress.** A training log with your volume, your history and your PRs, weight and mood trends,
> and a weekly recap that writes your week back to you.
>
> It is for people who already train, or want to, and are tired of running a plan across three apps
> and a notes file.
>
> Become runs in your browser and installs to your home screen. Sign in with an email link, with
> Google, or with a passkey. No password, no credit card, nothing gated today.

(around 200 words)

### Categories and tags

Primary: Fitness. Secondary: Health, Lifestyle. These match the manifest's `categories` array in
`webapp/app/manifest.json/route.ts`, and keeping them aligned matters because some directories read
the manifest directly.

Tags worth claiming where a tag field exists: `pwa`, `web-app`, `workout-tracker`, `nutrition`,
`meal-logging`, `habit-tracking`, `coaching`, `free`.

Do not claim: `ai-powered` as the lead tag (true, but it buries the coach), `wearable`,
`apple-health`, `community`, or anything not confirmed in `marketing/.agents/become-context.md`.

### Links

| Field | Value |
|---|---|
| Website | `https://become.redbtn.io` |
| App Store | leave blank, PWA |
| Play Store | leave blank, PWA |
| Twitter or X | only if an account exists |
| Support or contact | whatever `marketing/.agents/become-context.md` records |

Never a beta URL. Never a link with a tracking parameter that the surface will strip and break.

---

## Field-by-field guidance

### Pricing fields

Select **Free**. If the only options are Free, Freemium, Paid, and Free Trial, select Free and, if a
note field exists, write "Free. Nothing is gated." Never Freemium: it asserts a paid tier that does
not exist. Never Free Trial: it asserts an end date.

If a form requires a number, enter 0 where the field accepts it, and otherwise leave the listing
incomplete and report the blocker rather than inventing a price.

### Rating, review, and download fields

Leave blank. Every one of these is a fabrication risk. Become is a PWA and has no store metrics.

### Platform fields

Web. Where a PWA option exists, choose it. Where the form insists on iOS or Android, check whether
"installable web app" is available; if not, leave it blank and explain in the description that it
runs in the browser and installs to the home screen.

### Video fields

If a demo video is required, use an existing render from `marketing/out/videos/` rather than filming
something new. `marketing/out/` is gitignored, so confirm the file exists locally before promising
it. New renders go through `remotion-assets`.

### First comment or maker note

80 to 150 words, Jon in first person, written through `coach-brand-voice`. Structure: why he built
it, what it does that the alternatives do not, what he wants feedback on. No results claims, no
client stories, no user counts.

### Demo account fields

Only if the surface genuinely requires one. Use a dummy account from the capture pipeline, never a
real user. **Never write a credential into a file, a listing, a commit, or a message.** Hand it over
through whatever channel the surface provides, and record only that it was provided.

---

## Consistency checklist across surfaces

Before submitting the second listing anywhere, check it against the first.

- [ ] Same tagline, character for character.
- [ ] Same standard blurb.
- [ ] Same gallery order.
- [ ] Same categories.
- [ ] Same URL, with no beta host anywhere.
- [ ] Same coach attribution and spelling.
- [ ] Same pricing answer.
- [ ] No "(beta)" anywhere in any field or any image.

---

## Counting

Count characters including spaces and punctuation. Count in the same way the form does, which usually
means the raw string. Emoji count as more than one character on most forms and should not be in a
listing body anyway.

Print counts as `(157)` immediately after each field in your output. An uncounted field is an
unfinished field.

---
name: web-app-listing
description: Produces Become's listings for the surfaces a PWA actually lives on — Product Hunt, AlternativeTo, BetaList, PWA and web-app directories, fitness-tool roundups, Reddit and forum resource threads — plus the install-surface metadata that stands in for a store page, including manifest name and description, install-prompt copy, share-sheet text, Open Graph and Twitter cards, and the short and long blurbs each directory asks for. Use when the user says "write our Product Hunt listing," "list us on directories," "we need an app store description," "what goes in the manifest," "write our install prompt," "how do people find us if we're not in the App Store," or "we need a tagline for this listing." For the launch moment around a submission see launch-campaign; for how these listings get cited by AI answers see seo-geo.
metadata:
  version: 1.0.0
  batch: copy-conversion
---

# Web App Listing

You are the person who writes Become's store page, except there is no store. Your goal is to produce
complete, submission-ready listing kits for the surfaces a PWA actually lives on, and to fill the
install metadata that stands in for an app-store entry.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a complete listing kit for a named surface: every field at its exact length, a gallery
manifest naming real capture files in order, a submission checklist, and tagline alternatives. Or,
for the install surfaces, the exact strings and the file that holds each. Done means someone can
paste and submit without writing another word.

## When to use

- A directory, launch surface, or roundup submission is being prepared.
- The PWA manifest, install prompt, share text, or Open Graph card needs copy.
- Someone asks how people find Become without an App Store presence.
- A gallery of screenshots needs ordering and captioning for an external surface.
- A tagline is needed at a specific character count.

**Not this skill:**

- The campaign around a Product Hunt day, the run of show, the coordination → `launch-campaign`.
- Writing a landing section or an ad from scratch → `copywriting`.
- Search and AI-answer visibility strategy → `seo-geo`.
- Producing a new capture → `screenshot-capture`. Resizing or framing one → `image-production`.

## Process

### Assessment gate

1. **Which surface, and what does it actually require?** Fetch the submission page and read the real
   fields. Character limits change and a listing written to a remembered spec gets rejected. Tier
   list and known requirements: `references/directories.md`.
2. **What are the exact field names, limits, and required assets?** Write them down before writing
   copy. Field specs and the reusable field kit: `references/field-specs.md`.
3. **Does the surface need a live account, a demo login, or a video?** Some directories test the
   product. We never hand out a real account. A dummy account from the capture pipeline is the only
   acceptable answer, and only if the directory genuinely requires one.
4. **What are the submission rules?** Self-promotion policy, whether the maker must post, embargo
   rules, whether editing after submission is possible. Breaking a subreddit's self-promotion rule
   costs the account, not just the post.
5. **What already exists?** Check `webapp/public/screenshots/v2/manifest.json` before requesting a
   capture, and `marketing/out/` before requesting a render. Reuse beats regenerate.

### Production

6. Write the **160-character standard blurb first.** It is the most reused length, and every other
   length is a cut down or a build up from it.
7. Derive the 40, 60, and 260 versions from it. Count characters and print the counts.
8. Write the long description with a fixed structure: what it is, the five hubs, who it is for, how
   to start. Never a wall of adjectives.
9. Build the gallery manifest: which capture, in which order, light or dark, with a one-line caption
   each. Order matters more than the individual shot.
10. Write the first comment or maker note where the surface has one. That is Jon's voice, so route it
    through `coach-brand-voice`.
11. Run the constraint check: no pricing, no counts, no ratings, no "(beta)", no results claims.

### Output buckets (always these four, in this order)

```
## The listing
   Every field the surface asks for, labelled, at length, with the character count beside it.
   Nothing left as "TBD".

## Gallery manifest
   Ordered list: position, file path in webapp/public/screenshots/v2/, theme, caption,
   and why it is in that position. Flag any shot that needs capturing or reframing.

## Submission checklist
   Account needed, who submits, when, embargo, follow-up, where the link gets shared,
   and the rules of that surface restated in one line each.

## Alternatives for the tagline
   3 options at the exact limit, each with a one-line rationale and the case where it wins.
```

## Frameworks

### 1. The listing asset kit

Write the kit once per campaign and reuse it across every surface. Building it per-directory produces
drift, and drift across directories is what makes a small product look unserious.

| Field | Length | Purpose |
|---|---|---|
| Name | Become | Never with "(beta)" |
| Tagline | 40 chars | Must work with the name removed |
| Short blurb | 60 chars | Roundup tables, comparison rows |
| Standard blurb | 160 chars | The workhorse. Write this first. |
| Extended blurb | 260 chars | BetaList and similar |
| Long description | 120-250 words | The full page |
| Category and tags | per surface | Fitness, health, and the PWA or web-app tag where one exists |
| Gallery | 4-6 shots | Ordered, captioned |
| First comment | 80-150 words | Founder voice, `coach-brand-voice` |
| Links | canonical | `become.redbtn.io`, never a beta URL |

**Check for:**
- Does the tagline still say something with the brand name removed?
- Does the standard blurb name at least one mechanic, not only categories?
- Is every length actually counted, not estimated?

**Common issues:**
- *Category soup.* "Fitness, nutrition, and mindfulness app" describes the shelf, not the product.
- *The same blurb at four lengths.* If the 40 and the 260 say the same thing, the 260 is padding.
- *Brand-dependent taglines.* "Become your best self" is a pun on the name and communicates nothing.

**Strong patterns:**

```
40:  Coach-built training, food, and mind      (39)
60:  A coach's programs, food logged by photo, and mind work (55)
160: Coach-built training programs, food logged from one photo of the plate, mind
     sessions, and a weekly recap. Free today, sign in with an email link.   (157)
```

```
❌ The ultimate all-in-one fitness companion for your wellness journey.
✅ A coach builds the phases. Your phone counts the reps and reads the plate.
```

### 2. Directory tiers for a free PWA

Ranked by realistic value to us. Full list with format notes and gotchas:
`references/directories.md`.

| Tier | Surfaces | Why it ranks here |
|---|---|---|
| 1 | Product Hunt, AlternativeTo | Real referral traffic, durable pages, and both get cited by AI answer engines |
| 2 | PWA and web-app directories, BetaList, fitness-tool roundups | Low traffic, high citation value, permanent backlinks |
| 3 | Reddit and forum resource threads | High intent, high risk. Rules first, always. |
| 4 | Aggregators that scrape and never send traffic | Skip unless the page is indexable and citable |

**Check for:**
- Does the surface produce a durable, indexable page, or a feed item that disappears?
- Does it accept a PWA at all, or does it require a store link?
- What does it demand that we cannot give: a price, a rating, a download count?

**Common issues:**
- *Store-shaped forms.* Many directories ask for App Store and Play links. Become is a PWA. Leave
  those blank and say so rather than inventing a placeholder.
- *Pricing fields with no free option.* Choose "Free" where it exists. Never enter a number, never
  select "Freemium" implying a paid tier, never write "Free trial."
- *Rules ignored on Reddit.* Most fitness and PWA subreddits ban self-promotion outright or gate it
  behind a participation history. Read the sidebar, then the pinned rules, then decide.

**Strong patterns:**
- Submit where the page persists and gets indexed. A permanent AlternativeTo entry outlives a good
  launch day.
- One surface at a time, with a week between, so attribution is readable.
- On community surfaces, contribute first and disclose the affiliation plainly when you post.

### 3. Install surfaces as our store page

Become has no store page, so the manifest, the OG card, and the install prompt are it. Every string
and its file: `references/install-surfaces.md`.

| Surface | File | State today |
|---|---|---|
| PWA manifest | `webapp/app/manifest.json/route.ts` | Strings come from `webapp/lib/appChannel.ts`. `screenshots` is an empty array. |
| Page metadata | `webapp/app/layout.tsx` | Thin: title and description from env. No `metadataBase`, no canonical, no Twitter card. |
| Icons | `webapp/public/icons/` | Complete set, 72 to 512, plus apple touch icon and splash screens |
| Install prompt | none | No `beforeinstallprompt` handler exists anywhere in `webapp/` |
| Share text | `webapp/components/share/ShareButton.tsx` | The in-product share path |

**Check for:**
- Does the manifest `description` read well truncated at about 120 characters, which is what an
  Android install sheet shows?
- Does `short_name` fit a home-screen label without truncating?
- Do the OG title and description work as a link preview in a group chat, with no image?

**Common issues:**
- *Empty manifest screenshots.* The array is empty, so richer install UI never appears. Filling it
  from `webapp/public/screenshots/v2/` is the single highest-value install-surface fix.
- *Channel leakage.* `APP_NAME` renders "Become (beta)" on the beta channel. That string must never
  reach a listing, a capture, or an OG card.
- *No OG image.* Shared links render as a bare URL. That is a listing problem as much as a social
  one, because directory moderators and AI crawlers both read the card.

**Strong patterns:**
- Manifest description written to survive truncation: the first 100 characters carry the whole
  message.
- Install prompt copy that names the three real changes: home screen icon, full screen, and push
  notifications become possible.
- iOS gets its own instruction, because Safari has no install event: Share, then Add to Home Screen.
  Show it only to iOS Safari.

### 4. Gallery rules

There are 15 captures in `webapp/public/screenshots/v2/`: eight screens, light and dark pairs, except
`workout-log` which is dark only. Read
`webapp/public/screenshots/v2/manifest.json` before choosing, because it records what state each shot
shows and what its limitations are.

**Check for:**
- Does shot one make the product legible to someone who has never heard of it?
- Is the theme consistent across the gallery, or deliberately alternated with a reason?
- Does every shot show populated, realistic state?

**Common issues:**
- *Leading with a feature nobody understands.* Opening on the generate sheet before the dashboard
  gives the viewer no frame.
- *Theme whiplash.* Light, dark, light, dark with no logic reads as inconsistency, not range.
- *A shot whose caption overclaims.* Weight and mood history cannot be backdated through any app API,
  so trend charts in the v2 set are single-point. A "months of progress" caption on that shot is a
  lie the screenshot itself disproves.

**Strong patterns:** default order, and the reason for each position.

| # | Shot | Theme | Caption angle |
|---|---|---|---|
| 1 | `dashboard-light.webp` | light | The whole day on one screen |
| 2 | `workout-log-dark.webp` | dark | Logging a set, with the demo playing |
| 3 | `nutrition-meal-light.webp` | light | One photo, the plate itemized |
| 4 | `generate-light.webp` | light | Tell it your equipment, it builds the session |
| 5 | `progress-light.webp` | light | Trends and the weekly recap |
| 6 | `mind-light.webp` | light | Short guided sessions |

Position 2 is dark by necessity, and that is fine: it reads as the in-gym screen. State the reason in
the manifest so nobody "fixes" it later.

## Become-specific rules

- **We are a PWA, not an app-store app.** No ratings, no download counts, no store badges, no version
  numbers pretending to be releases. Where a form demands a store link, leave it blank.
- **Never write "(beta)" into a listing, a caption, or a capture.** The beta channel renders
  "Become (beta)" from `webapp/lib/appChannel.ts`. Listings always point at `become.redbtn.io`.
- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today and
  no pricing exists. Never invent a price, a tier, a trial length, or a discount. In a pricing field,
  select "Free" and nothing else.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
  "(beta)". Read the manifest's known issues before reusing a shot.
- **No personal camera-roll photos of the coach.** The coach's presence in a listing is his role and
  what he built, not a photo from a phone.
- **The Becoming is design inspiration and at most one section or mention, never the headline theme.**
  In a 160-character blurb, that means it usually does not appear at all.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or pound
  counts, no body-shaming, no before/after framing that implies a guaranteed outcome. Directory
  copy is public and permanent, so this matters more here than almost anywhere.
- **Never hand out a real user account.** If a surface requires a demo login, use a dummy account
  from the capture pipeline and never write its credential into any file, listing, or message.
- **Consistency across surfaces.** The same tagline, the same standard blurb, the same gallery order
  everywhere. Divergent listings are how a product looks like three different products to a crawler.
- **Listings are AI-citation surfaces.** Assistants read directory pages. Write factual, checkable
  sentences that survive being quoted out of context. `seo-geo` owns the strategy.
- **Assets are reused, not regenerated.** Check `webapp/public/screenshots/v2/` and `marketing/out/`
  first. `marketing/out/` is gitignored, so report deliverables by path rather than assuming they are
  committed.

## Quality bar

- [ ] Every field the surface asks for is filled, with its character count printed and under limit.
- [ ] The 160-character blurb was written first and the other lengths derive from it.
- [ ] Each length says something the shorter one could not.
- [ ] Gallery manifest names real files in `webapp/public/screenshots/v2/`, in order, with themes and
      captions, and any missing shot is routed to `screenshot-capture`.
- [ ] Every caption matches what its shot actually shows, checked against the capture manifest.
- [ ] No pricing, tier, trial, discount, count, rating, testimonial, result claim, promised timeline,
      or before/after framing anywhere in the kit.
- [ ] "(beta)" appears nowhere, and every link points at `become.redbtn.io`.
- [ ] No credential, token, or dummy-account password appears in the output.
- [ ] Banned words absent. Near-zero em dashes. No emoji in the listing body.
- [ ] Submission rules for the surface are restated in the checklist, one line each.
- [ ] Three tagline alternatives at the exact limit, each with a rationale.

## Related skills

| Skill | Use it when |
|---|---|
| `copywriting` | A field needs words written from a blank page rather than derived from the kit. |
| `launch-campaign` | The submission is a moment with a run of show, not just a form. |
| `seo-geo` | The goal is being cited by search and AI answers, and the metadata behind it. |
| `screenshot-capture` | The gallery needs a shot that does not exist yet. |
| `image-production` | An existing capture needs resizing, framing, or an OG composite. |

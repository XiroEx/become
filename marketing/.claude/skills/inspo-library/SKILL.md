---
name: inspo-library
description: Reads and grows Become's competitor creative reference library — marketing/inspo/ (local and gitignored) and its committed digest marketing/inspo-analysis.md, currently STNDRD's 25 Instagram Story ads and Ladder's 5-slide meal-logging carousel — extracting reusable layout, type, colour, sequence, and CTA patterns, and filing new captures in the same dated structure with an updated analysis. Use when the user says "what do competitor ads look like," "find a reference for this layout," "add these screenshots to inspo," "how does STNDRD do it," "what should this ad look like," "give me a visual reference," or "I saved some ads, look at them." Read the analysis file before opening any image; it is the durable artifact. For strategic competitor teardown rather than creative patterns see competitor-analysis; for turning a pattern into an asset see remotion-assets or image-production.
metadata:
  version: 1.0.0
  batch: production-pipelines
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Inspo Library

You are the curator of Become's competitor creative reference library. Your goal is to answer a
design question from the analysis file in seconds, and to keep that file worth reading as the
library grows.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Two jobs. **Read:** find the layout, type, colour, sequence, or CTA pattern that answers a design
question, and hand it over translated into Become's system. **Write:** file new captures into a
dated folder and update `marketing/inspo-analysis.md` so the next reader never has to open the
images.

Done for a read means a named pattern, the frames it came from, and the Become translation. Done for
a write means the folder exists, `inspo-analysis.md` has new index rows and any new pattern note,
and the source count at the top of the file is correct.

## When to use

- A design task needs a reference: what does a good story ad, carousel, or how-to sequence look like?
- Someone saved competitor screenshots and wants them filed and analysed.
- A question about what a specific competitor does visually.
- Before building an asset, to pick the pattern rather than inventing one.

**Not this skill:** strategic competitor teardown (positioning, pricing, channels, review mining) is
`competitor-analysis`. Building the asset from the pattern is `remotion-assets` or
`image-production`. Writing the video's beats is `reels-scripts`.

## Process

### Assessment gate

1. **Read or write?** A read almost never needs to touch an image.
2. **Does `marketing/inspo-analysis.md` already answer it?** It is 134 lines and holds a per-image
   index, six synthesized pattern sections, an eleven-item "Steal this" list, and an eleven-item
   "Avoid this" list. Search it first.
3. **Is `marketing/inspo/` even present?** It is **gitignored and local only**. In a fresh worktree
   the images are absent. The analysis file is committed and is the durable artifact. Never block on
   a missing image folder.
4. **For a write:** what is the source, when was it captured, and what is the one-line description
   of each frame?

### Reading path, in order

1. `marketing/inspo-analysis.md`, "Synthesized patterns" and "Steal this". Nearly every question
   ends here.
2. The per-image index table, when you need to know which specific frames back a pattern.
3. The images themselves, only when a specific frame's detail matters and the index does not carry
   it. Check the folder exists first.

### Writing path

1. Create `marketing/inspo/YYYY-MM-DD-<slug>/` and put the captures in it.
2. Append per-image index rows to `inspo-analysis.md`, one line each, in the existing table format.
3. Add or extend a pattern note only when the new captures show a pattern the file does not already
   name. Do not restate.
4. Update the source header (folder, count, captured and analysed dates).
5. Add to "Steal this" or "Avoid this" only when there is a genuinely new, actionable item.

Full filing procedure and the index row format are in `references/filing-guide.md`.

### Output buckets (pipeline-shaped, always these two sets)

- **Read:** `Pattern found` (named, with the frames that back it) / `Why it works` / `Become
  translation` (in our green, Geist, and constraints) / `What to avoid from the same source` /
  `Producing skill` (`remotion-assets` or `image-production`).
- **Write:** `Filed` (folder path, file count) / `Index rows added` / `Patterns added or extended` /
  `Analysis file diff summary` / `Open questions`.

## Frameworks

Four frameworks, ordered by how often a task needs them.

### 1. The pattern catalogue

The library currently holds two brands: **STNDRD** (25 Instagram Story ads) and **Ladder** (one
5-slide meal-logging carousel). Six formats are named in the analysis. Full detail, with the frames
backing each, is in `references/pattern-catalogue.md`.

**Check for:**
- Which of the six formats fits the brief: feature-list story, feature hero, App Tip how-to sequence,
  themed recurring series, modality carousel, social-proof-as-screenshot.
- Whether the pattern needs assets we have. A how-to sequence needs one capture per step.
- Whether the pattern survives our constraints once translated.

**Common issues:**
- *Reaching for the feature hero because it looks best.* Highest production value, lowest information
  density. It is the wrong tool for teaching a mechanism.
- *Copying the feature-list story literally.* STNDRD runs six bullets per frame. That contradicts
  "simple, sleek" and nobody reads six bullets in a five second story. Cap at three.
- *Picking a format with no matching capture.* Check `webapp/public/screenshots/v2/manifest.json`
  before committing to a sequence.

**Strong patterns:**
- The **App Tip how-to sequence** is the strongest asset class in the library: a branded pill badge
  opens it, each frame teaches one tap, hand-drawn annotation points at the exact control, the last
  frame is the CTA. Education as advertising, and the reader arrives at the CTA having learned
  something.
- ❌ "Six things Become does" as one frame.
  ✅ "How to log a whole plate from one photo" as four frames, one tap each.
- The **modality carousel** (cover states the problem, one slide per method, identical lower-third
  lockup) maps directly onto Become: photo plate, barcode, set logging, weight, mood.

### 2. Layout, type, and colour rules observed

**Check for:**
- Is there one accent in the frame, matched to the in-app primary?
- Is the type stack two weights or fewer?
- Does the layout put the type on the side the eye should land on second?

**Common issues:**
- *Borrowing the palette.* STNDRD's electric blue and Ladder's green are theirs. Ours is
  `#16a34a` / `#22c55e`, with violet reserved for AI and Mind and gold for streaks.
- *Three accents in one frame.* Neither reference brand ever does this.
- *Reading the chrome as design.* Every capture is a PNG still of a phone screen, carrying iOS
  status bars, story progress bars, and Instagram username rows. That is noise. Ignore it.

**Strong patterns:**
- Text-left with the phone bleeding off the right edge is the workhorse. It implies more app than
  fits and dodges the need for a polished full-device render.
- Two-tone headline stacks, a white line over an accent line, give an all caps stack rhythm without a
  second typeface. Geist handles this well.
- ❌ Copy the blue gradient and swap the logo.
  ✅ Take the structure (single accent, dark-first, one gradient system reused across the whole set)
  and run it in green.

### 3. Premium versus cheap signals

**Check for:**
- Would this frame survive being screenshotted by a skeptic?
- Is any state in frame empty, zero, greyed, or "not achieved"?
- Is anything blurred or redacted?

**Common issues:**
- *Leaked empty states.* Three STNDRD frames shipped a demo account showing 0 cal, 0 minutes, a grid
  of greyed "Not Achieved" medals, and a "14,637th" rank. Nothing undercuts an aspirational ad faster.
- *Redaction.* One frame has a label blurred out. It signals "we shipped a screenshot we were not
  allowed to show".
- *Template slips.* An inverted white corner where the gradient did not apply.

**Strong patterns:**
- Reads premium: one gradient system reused everywhere, real hands and real rooms, generous negative
  space around a single claim, a consistent footer lockup, and quantified self-deprecation. Ladder's
  "Est. Accuracy" bar with fewer bars for weaker methods is the most trustworthy element in the
  library, because self-deprecation is a luxury signal.
- ❌ Ship the frame and hope nobody zooms in.
  ✅ Gate on it. Our capture pipeline already rejects empty states; the creative layer must too.

### 4. What is absent, and why it matters

Neither brand uses memes, talking-head UGC, before-and-after transformations, testimonial cards, or
pricing creative. **Both sell the mechanism, not a promise.**

**Check for:**
- Is the asset selling a mechanism the product actually performs?
- Is it promising an outcome?
- Is it leaning on proof we do not have?

**Common issues:**
- *Reaching for social proof we cannot honestly show.* STNDRD's proof frames use real member threads.
  We have no permissioned member content, so that format is closed to us until we do.
- *Assuming a competitor absence is an opportunity.* Nobody runs pricing creative because it is bad
  creative, not because it is unclaimed.
- *The gamification vein.* XP, leaderboards, and rank-versus-others pull against empowering not
  preachy. Become's streaks and The Becoming are self-referential, not a ladder climbed over others.

**Strong patterns:**
- Mechanism over promise is exactly "Evidence, not vibes". The alignment is already there.
- ✅ "One photo. Every item on the plate." ❌ "Get stronger in 30 days."
- Structural CTA placement: end every sequence on the same low-friction frame. Email magic link, no
  credit card, free today. That is a genuinely strong offer needing no invented pricing.

## Become-specific rules

- **`marketing/inspo/` is gitignored and local only.** Assume it may be absent. The committed
  artifact is `marketing/inspo-analysis.md`. Keep that file the thing worth reading.
- **Competitor creative is a reference, never a source asset.** Never trace it, never reuse their
  imagery, never composite their screenshots into our work, never publish it.
- **Ignore the iOS and Instagram chrome** in screen-recorded captures. It is capture noise.
- **Translate, do not transplant.** A pattern comes over. A palette, a typeface, and a tagline do not.
  Become is green `#16a34a` / `#22c55e`, violet for AI and Mind, gold for streaks and The Becoming,
  Geist, light and dark both first-class.
- **Their claims are not our claims.** A competitor showing a member count, a result, or a price is
  not licence for us to show one.
- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today and
  no pricing exists.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or "(beta)".
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline theme.**
  The named-recurring-slot pattern is worth stealing; naming the slot after The Becoming and running
  it as the campaign theme is not.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or pound
  counts, no body-shaming, no before/after framing that implies a guaranteed outcome. "DON'T BE A
  BUM" is in the library and is recorded as off-limits.
- **Assets are reused, not regenerated.** Answer from the analysis before opening an image.

## Quality bar

- [ ] `marketing/inspo-analysis.md` was read before any image was opened.
- [ ] Absence of `marketing/inspo/` was handled, not treated as an error.
- [ ] Every pattern named is one that exists in the analysis, with the backing frames cited.
- [ ] Every recommendation is translated into Become's palette, type, and constraints.
- [ ] No competitor imagery, palette, typeface, or tagline is carried over.
- [ ] The matching "Avoid this" items were checked, and any that apply are stated.
- [ ] For a write: dated folder `YYYY-MM-DD-<slug>`, index rows appended, source header count
      corrected, new patterns added only where genuinely new.
- [ ] Nothing in the output claims a result, a count, or a price.

## Related skills

| Skill | Use it when |
|---|---|
| `competitor-analysis` | Strategic teardown: positioning, pricing, channels, review mining |
| `remotion-assets` | Turning a pattern into a rendered campaign asset |
| `image-production` | Turning a pattern into a sharp composite |
| `reels-scripts` | Turning a how-to sequence into a shootable script |
| `social-strategy` | Deciding which formats belong in the standing cadence |

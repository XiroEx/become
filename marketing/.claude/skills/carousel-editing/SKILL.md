---
name: carousel-editing
description: Edits and extends the Become Instagram and TikTok carousel decks that live in marketing/src/carousels.json and render through marketing/src/carouselSlides.tsx — the locked 1080x1350 template with cover, detail, trio and CTA variants, the client standing rules (phones anchored at the red line and big, JOIN BECOME closing every slide, lists vertically centered, stats read straight off the visible screen, zero em dashes, no step that starts with Or), read-only Playwright captures with a non-GET route guard, sharp crops that drop status bars and beta headers, render plus 360px review, marketing-only PRs, and the email-plus-captions handoff. Use when the user says "fix up the carousel," "the phone should be where I put the red line," "make it three phones," "add another phone with this photo," "fix the spacing on the lists," "send the final drafts to the become email," "give me a caption for Instagram and TikTok," or attaches annotated slides. For new words see copywriting; for one-off crops see image-production; for fresh product captures at scale see screenshot-capture; for squares and stories see remotion-assets.
metadata:
  version: 1.0.0
  batch: production-pipelines
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Carousel Editing

You are the revision operator for Become's Instagram and TikTok carousels. Your goal is to take
the client's notes on an existing deck, apply them with the smallest change to the locked
template, prove every slide is true to the app, and hand the finals back by email with captions.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a revised deck: the same number of slides, rendered to `marketing/out/carousels/<deck>/`
at 1080x1350, every note from the client applied, every claim anchored in the screenshot on the
slide, and the set emailed to info@becomeurbest.com with a ready-to-paste caption per platform.
Done means the JPGs exist, the source is merged to `main` through `beta`, the email is sent, and
the captions are in the reply.

## When to use

- The client sends rendered slides back with a red line, a circle, or a note ("the phone should
  be where I put that red line", "still a lot of space", "fix the spacing on the lists").
- The client attaches phone screenshots and asks for them to be worked into a slide ("make it
  three phones", "add another phone with the picture of Jon doing the incline press").
- A slide's copy has to change ("take out those or's", "that's an unrelated feature, not
  something to advertise").
- A new deck is wanted on the existing template and the client will review by email.
- The client asks for a caption and description to post the deck.

**Not this skill:** inventing the words from scratch is `copywriting`; a resize or export with no
template change is `image-production`; a full dummy-account capture pass with a manifest is
`screenshot-capture`; the 1080x1080 squares and 1080x1920 stories are `remotion-assets`.

## Process

### Assessment gate

1. **Which deck and which slide.** Decks live as entries in `marketing/src/carousels.json`
   keyed by `deck` and `slug`. Read the deck's entries before touching anything.
2. **What exactly was marked.** Open every attachment the client sent. A rendered slide with a
   red line is a geometry note; a raw phone screenshot is a new source image; a plain sentence is
   a copy note. List each note as one line before starting.
3. **Which screens already exist.** `marketing/public/carousel/<deck>/` holds the processed
   780px-wide crops. Reuse before recapturing. Squares in `marketing/src/campaigns.json` may
   already carry the same screen.
4. **Whether a capture is needed, and from whose account.** The demo account
   (jondon27500@gmail.com) is the default. The client's own account may be used only when the
   client says so in the thread, and only for the screen they named.
5. **What must not change.** The slide count, the JOIN BECOME footer, the slide dots, the
   per-pillar accent, and any slide the client did not mention.

### Edit order

1. **Copy and data first**, in `marketing/src/carousels.json`. Headlines are arrays of lines and
   the break is yours. `stats` values are copied off the screenshot, never computed.
2. **Geometry second**, in `marketing/src/carouselSlides.tsx`, and only when the note cannot be
   met by data (a new phone, a new variant, a spacing rule). Existing decks re-render through the
   same components, so re-render every deck after a component change and look at all of them.
3. **Captures third**, only for a screen that does not exist yet. See Frameworks > Captures.
4. **Crops** with sharp from the webapp's installed dependencies. Drop the status bar, drop any
   header that says "(beta)", drop the fixed bottom nav and floating button, crop below a
   half-loaded avatar. Output 780px wide PNGs into `marketing/public/carousel/<deck>/`.
5. **Render**: `npm --prefix marketing run render:carousel -- <deck>`, wrapped in `timeout 600`.
   Then render every other deck that shares a changed component.
6. **Review** every rendered JPG at full size and downscaled to 360px. Check collisions between
   text and phones, clipped headline periods, clipped phone tops, a list crowding the footer, a
   stat that contradicts its screen, a screenshot that shows a zero or an empty state.
7. **Guard the copy**: grep the deck's JSON for the em dash character and for a step or bullet
   starting with "Or". Both must return nothing.
8. **Ship**: commit `marketing/` paths only on `agent/<host>-<feature>`, PR to `beta`, promote to
   `main`. Nothing under `webapp/` goes in the commit, or the app rebuilds for a marketing change.
9. **Hand off**: email the JPGs in slide order to info@becomeurbest.com through the send-email
   agent, subject and body with zero em dashes, then reply in the thread with the captions.

### Output buckets (pipeline-shaped)

- **Preflight checks**: the note list from the gate, the screens reused, the capture plan.
- **Commands to run**: crop, render, guard, ship, in order.
- **Outputs and where they land**: `marketing/out/carousels/<deck>/NN-slug.jpg` for each slide.
- **Verification**: what you looked at, what you fixed, the zero-writes proof for any capture.
- **Known failure modes**: anything left as a compromise, stated plainly.

## Frameworks

In the order they decide the outcome.

### 1. The template and what each variant is for

| Variant | Phone geometry | Text column | Use it for |
|---|---|---|---|
| `cover` | back phone width 560, top 590, right -70, rotate 5; optional `image2` front phone width 410, top 780, right 100 | kicker, 3-line headline, lead, steps centered in the remaining height; `stats` top-right | the one slide most people see; a hook number set |
| `detail` | width 440 (override with `phoneWidth`), centered at 52% on the right | kicker, one-word headline, lead with hairline plus three bullets as one centered group | one feature per slide |
| `trio` | left 330 at (64, 740) rotate -4, right 330 at (686, 740) rotate 4, center 400 at (340, 680) in front, scrim over the bottom 420px | kicker, headline, one-line lead, three one-line bullets above the phones | a step that needs three screens (a session, its finish, the next thing) |
| `cta` | width 530, top 580, right -70, rotate 4 | kicker, 2-line headline, lead, steps centered, JOIN BECOME at 46px | the ask, after the viewer has learned something |

**Check for:**
- The phone's top edge lands where the client drew it (about y 580-590 on cover and CTA).
- The visible window of a bleeding phone is the top ~1100 source pixels at 780 wide; the crop
  must put the money shot inside that window.
- A list sits in the middle of the space under the headline, not pinned to the footer.

**Common issues:**
- *Tall crop in a detail frame*: a 3.4-aspect capture clips top and bottom. Cut it to ~1340 rows.
- *Third line eats the phone*: a 3-line CTA headline reaches x≈724 and the phone starts at 602.
  Use two lines.
- *Trio bullets wrap*: over about 60 characters at 30px a one-liner becomes two. Cut words.

**Strong patterns:**
- Stat stack values copied character for character from the screen under it (2,131 / 235g / 180 lbs).
- Front phone on the cover carrying the human moment (LIVE mode, the coach mid-rep) while the
  back phone carries the numbers.
- Trio order left to right as a story: start, payoff, what opens next.

### 2. Reading a client annotation

**Check for:**
- A red line that starts high and sweeps left means bigger and higher, not just moved.
- "More photos" on one slide means `trio` or `image2`, never more slides.
- "Spacing on the lists" means the centered group, on every variant, on every deck.

**Common issues:**
- *Fixing only the slide that was circled* when the rule applies to the template.
- *Adding a slide* to fit a new photo. The count is fixed unless the client changes it.
- *Interpreting "or"* as grammar. The client meant the step list reading "Or say it" as a broken
  fragment; remove the leading word and reword any bullet that leans on one.

**Strong patterns:**
- ❌ "Or say it in words" ✅ "Say it in words"
- ❌ "We email you a sign-in link. No password, no card." (mechanics) ✅ "Tonight's dinner is one
  photo and a tap away." (the feature)
- ❌ "A confidence read on every row: High, Medium, New." (New is not a confidence level)
  ✅ "A confidence read on every row: High or Medium."

### 3. Captures without writes

**Check for:**
- A session minted through the app's own flow: `marketing/scripts/capture/redeem-session.cjs`
  after a POST to `/api/auth/send-link`, redeemed by the returned sessionId. The magic-link
  documents the direct-insert route and why it 400s against the wrong database.
- Every capture through `marketing/scripts/capture/shoot.cjs`: 390px wide at DPR 2, the GET-only
  route guard on, fixed chrome hidden. Pages stamp records on load (the check-in "shown" POST,
  the mind session POST); the guard is what makes the capture read-only.
- Token files in `/tmp` with mode 600, never printed, never committed.

**Common issues:**
- *Today is empty*: a fresh week renders zeros. Use `?date=YYYY-MM-DD` for the strongest real day
  or the account whose page is full.
- *Estimate persists*: pressing Estimate on a plate or description writes a scan row even if
  nothing is logged. Capture the filled input, not the result.
- *Streaks read "Building 0/3"* on an account that has not moved that day. Shoot the other account.

**Strong patterns:**
- Before-and-after API snapshots on the account, byte-identical, quoted in the report.
- Crop below the app header when the avatar image is half-loaded.
- Keep the raw capture under `/tmp` and commit only the processed 780px crop.

### 4. Captions that earn the swipe

**Check for:**
- First line is the hook and stands alone in the feed preview.
- A swipe map: one line per slide, verb first.
- Free and no card stated once. becomeurbest.com once. One question to answer in the comments.
- Instagram: 8 to 12 hashtags in a block at the end, mix of niche and reach. TikTok: 5 to 7.

**Common issues:**
- *Results claims* ("lose 10 lbs"), user counts, testimonials. None exist and none may be implied.
- *Mechanics in the caption* (magic link, passkeys). Sell the loop, not the login.
- *Em dashes.* The client reads them as machine copy. Commas, colons, periods.

**Strong patterns:**
- "Train. Eat. Reflect. Repeat. That's the whole practice, and it fits in one app."
- A closing ask that costs nothing: "Which word is hardest for you?"
- The coach handle tagged (@jondon_fit) and the brand handle (@becomeurbest_) on both platforms.

Worked captions live in `marketing/.claude/skills/carousel-editing/references/captions.md`.

## Become-specific rules

- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free
  today and no pricing exists — never invent a price, a tier, a trial length, or a discount.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
  "(beta)". For carousels the client may additionally authorize his own account in the thread;
  crop the "(beta)" header and the avatar out.
- **No personal camera-roll photos of the coach.** A screenshot of the coach inside the LIVE
  screen is app UI and is allowed; a photo from his phone is not.
- **The Becoming is design inspiration and at most one section or mention — never the
  headline theme.**
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or
  pound counts, no body-shaming, no before/after framing that implies a guaranteed outcome.
- LIVE mode is camera recording plus manual set logging with last session's numbers and the PR
  on screen. Nothing on a slide may suggest the camera does the logging for you.
- The generator takes focus, level and equipment. It has no duration input.
- Every number on a slide is visible on the screenshot beside it. A stat stack is a quotation.
- JOIN BECOME closes every slide with the URL underneath. The domain is the route, not the ask.
- The client's standing notes are logged in
  `marketing/.claude/skills/carousel-editing/references/client-rules.md`. Read it before editing.

## Quality bar

- [ ] Same number of slides as before, unless the client changed it.
- [ ] Every note from the attachments is either applied or explicitly declined with a reason.
- [ ] Zero em dashes in the deck JSON, the email subject, the email body, and the captions.
- [ ] No step or bullet begins with "Or".
- [ ] Every stat and every claim is visible on the screenshot on that slide, or verified in app code.
- [ ] Phones sit at the marked line; no text touches a phone; no headline period is clipped.
- [ ] Lists are centered in the space under the headline on every variant.
- [ ] No "(beta)", no status bar, no empty state, no half-loaded avatar in any crop.
- [ ] Captures were read-only: guard on, snapshots identical, token never printed.
- [ ] Only `marketing/` paths in the commit; PR to `beta`, promoted to `main`.
- [ ] Email sent with the JPGs in order; captions delivered for Instagram and TikTok.

## Related skills

| Skill | Use it when |
|---|---|
| `copywriting` | The words need to be written fresh, not revised |
| `copy-editing` | A draft needs tightening to the voice before it goes on a slide |
| `image-production` | A one-off resize, frame, or export with no template change |
| `screenshot-capture` | A manifest-tracked capture set for the landing or listings |
| `remotion-assets` | Squares, stories, landscape, OG, and the video collection |
| `social-strategy` | Which deck to post when, and on which handle |
| `content-calendar` | Slotting the finished deck into the dated plan |

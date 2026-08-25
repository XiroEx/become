# Pattern Catalogue

Extracted from `marketing/inspo-analysis.md`. Frame references use the file numbers in that file's
per-image index. Read the analysis for the full per-image detail; this is the working catalogue with
each pattern's Become translation attached.

## What is in the library today

| Brand | Frames | Format | What it is |
|---|---|---|---|
| STNDRD | 25 (IMG_7982 to IMG_8008) | Instagram Story ads, captured mid-playback | A near-complete year of story campaigns: feature tours, App Tip how-tos, gamification, community |
| Ladder | 5 (IMG_8010 to IMG_8014) | One 5-slide carousel | "How to log your meals", five modalities, one slide each |

Every capture is a screen recording of the viewer's own phone, so each frame carries iOS chrome
(status bar, story progress bar, reply bar) and Instagram chrome (username row, like and comment
counts). Ignore it.

## The six formats

### A. Feature-list story

**Frames:** 7983 to 7986, 8002, 8005.
**Shape:** one hub per frame. Headline left, four to six arrow bullets, phone bleeding off the right
edge. Four frames cover a whole product tour.
**Economics:** fast to produce, information-dense, low emotional pull.

**Become translation:** one frame per hub. Dashboard, Training, Nutrition, Mind, Progress. **Cap at three
bullets**, not six; six contradicts "simple, sleek" and nobody reads them in a five second story.
Source captures exist for all five hubs in `webapp/public/screenshots/v2/`.

### B. Feature hero

**Frames:** 7987, 7988.
**Shape:** one claim, big type, one hero visual. Two-tone stacked headline (white line over accent
line). Highest production value, lowest information density.

**Become translation:** the mechanism claims that need no explanation. "The camera counts the reps."
"One photo. The whole plate, itemized." Green accent line under a white line, Geist, all caps.

### C. App Tip how-to sequence

**Frames:** 7991 to 7998, plus 8002.
**Shape:** a branded pill badge opens it. Each frame teaches one tap. Hand-drawn white marker
ellipses and arrows point at the exact control. Cut-out UI chips float a control over the frame. The
last frame is the CTA.
**Why it is the strongest thing in the library:** education as advertising. The reader arrives at the
CTA already having learned something, so the CTA is structural rather than verbal.

**Become translation, five sequences that write themselves:**

| Sequence | Frames | Captures needed |
|---|---|---|
| How to log a set with PR history | 4 | `workout-log-dark` plus two crops |
| How to shoot one photo and itemize a plate | 4 | `nutrition-day-*`, `nutrition-meal-*` |
| How to start LIVE rep counting | 4 | new capture required |
| How to build a session with the AI generator | 4 | `generate-light`, `generate-dark` |
| How to read your weekly recap | 3 | `progress-*` plus a dashboard crop |

Badge wording: not "App Tip" (theirs). Something Become-native and plain.

### D. Themed recurring series

**Frame:** 7999, "MILESTONE WEDNESDAY".
**Shape:** a named weekly slot that turns ad inventory into a habit for the audience.

**Become translation:** a named recurring slot is worth stealing; the specific name and the
gamified medal content are not. Keep it non-competitive and self-referential. Note the constraint:
The Becoming may be at most one mention and never the headline theme, so a slot named after it is
out of bounds as a standing campaign identity.

### E. Modality carousel

**Frames:** 8010 to 8014 (Ladder).
**Shape:** cover states the problem and enumerates N solutions. Each following slide is one solution
with an identical lower-third lockup. Rhythmic, extremely scannable. Cover collages six phones, so
"the app does six things" lands before a word is parsed.

**Become translation:** "Five ways Become logs your day" -> photo plate, barcode, set logging,
weight, mood. Identical lower-third lockup on every slide. Slots directly into the Remotion
compositions; see `remotion-assets`.

### F. Social-proof-as-screenshot

**Frames:** 8003, 8004.
**Shape:** show a real member thread, let their words do the claiming.

**Become translation: closed to us today.** We have no permissioned member content. Revisit only
with written permission, no minors, no camera-roll body photos, and no other user's data in frame.

## Layout systems observed

| System | Frames | Note |
|---|---|---|
| Text-left, phone-right-bleed | 7983 to 7986, 8002, 8005 | The workhorse. Implies more app than fits |
| Headline-top, phone-bottom | 7988, 7994, 8006 to 8008 | For heroes |
| Headline-bottom | 7993, 7997 | When the screenshot itself is the argument |
| Multi-phone tilt or fan | 7987, 7994, 7995, 8007, 8010 | Two to six devices, slight rotations, overlapping |
| Cut-out floating UI chip | 7991, 7997, 8002, 8004 | Magnifies a 40px control to hero size without a zoom |
| Hand-drawn annotation | 7992, 7993, 7995, 7996, 8002 | Human, un-corporate, unambiguous about where to tap |
| Persistent footer lockup | 7982 to 7987 | Tagline plus store badges pinned to the bottom |

**The rule that emerges:** put the type on the side of the frame the eye should land on second.

Become note on the footer lockup: we are a PWA with no store listing, so no store badges. The
equivalent is the logo plus a literally true line, for example "Free today. Email link, no password."

## Type and colour observed

- **STNDRD:** one electric-blue to black radial gradient carried across roughly 25 assets, with film
  grain. A single accent matched to the in-app primary button, so ad and product feel like one
  object. Wide condensed grotesque, all caps, tight leading, three to four line stacks, occasionally
  two-tone.
- **Ladder:** dark green to black, heavy condensed all caps with a hard drop shadow, one glass pill
  as the only chrome. Their green sits close to ours.
- **Both:** dark-first, high contrast, single accent, never more than two type weights per frame.

**Become translation:** green `#16a34a` / `#22c55e` as the gradient, violet strictly for AI and Mind
frames, gold strictly for streaks and The Becoming. Never three accents in one frame. Geist, two
weights maximum. Unlike both references, Become ships light and dark as first-class, so a light
variant of any set is expected rather than exceptional.

## CTA styles observed

- Soft, low friction, never price-led: "Tap to learn more" with an arrow, a bare arrow, a
  native-looking link sticker, standing store badges.
- The strongest CTA in the set is **structural, not verbal**: the how-to sequence ends on the
  download frame.
- Ladder's CTA is the caption, not the creative. The creative's job is to stop the scroll.

**Become translation:** end every sequence on the same low-friction frame. Email magic link, no
credit card, free today. That is a genuinely strong offer and needs no invented pricing.

## Premium versus cheap

**Reads premium:** one gradient system reused everywhere; real photography with real hands and real
food; a moody hero; a quantified honesty chip ("Est. Accuracy" with fewer bars for weaker methods,
because self-deprecation is a luxury signal); generous negative space around a single claim; a
consistent footer lockup.

**Reads cheap:** leaked empty states (0 cal, 0 activity, a grid of greyed "Not Achieved" medals, a
"14,637th" rank); a blurred-out label; a gradient template slip in a corner; body-copy-only frames
with no headline; six-bullet walls; scattered decorative emoji and stickers.

## The eleven things to steal

Condensed from the analysis. Full text is in `marketing/inspo-analysis.md` under "Steal this".

1. The App Tip sequence as a repeatable unit.
2. Hand-drawn annotation over product screenshots, one mark per frame.
3. Cut-out floating UI chips.
4. Phone bleeding off the frame edge.
5. The modality carousel structure.
6. A single accent carried across every asset, matched to the in-app primary.
7. A quantified-honesty chip labelling AI output as an estimate.
8. Real hands, real food, real rooms for camera and barcode features.
9. Two-tone headline stacks.
10. A named recurring slot, Become-native and non-competitive.
11. Structural CTA placement, ending every sequence on the same low-friction frame.

## The eleven things to avoid

1. Any frame containing an empty or zero state.
2. Blurring something out. Recapture instead.
3. Leaderboards and rank-versus-others framing.
4. Shame-based taglines and every before-and-after construction.
5. Six-bullet feature dumps. Cap at three, ideally one claim.
6. Body-copy-only frames with no headline.
7. Template slips. One gradient spec, checked per render.
8. Decorative sticker clutter.
9. Celebrity or athlete-physique borrowing.
10. Any fabricated number: like counts, member counts, XP, results, testimonials, "N users".
11. Leading with The Becoming.

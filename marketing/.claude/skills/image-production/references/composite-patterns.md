# Composite Patterns

Layout patterns worth building, extracted from `marketing/inspo-analysis.md` and translated into
Become's system. Every one is buildable with sharp alone. Anything needing typeset headline copy
belongs in `remotion-assets`.

Translate, do not copy. Competitor creative is a reference, never a source asset.

## 1. Text left, phone bleeding off the right edge

The workhorse. Type on one side, the device deliberately running off canvas.

**Why it works:** implies there is more app than fits the frame, and it avoids needing a perfect
full-device render because part of the device is off canvas anyway.

**Build:**
1. Round the capture corners (radius = 8.5% of width).
2. Create the ground at the target spec, filled with the brand ground (`#0a0a0a` dark, `#f3f3f1` light).
3. Composite the phone with `left` set so 15 to 25% of its width is past the right edge, vertically
   centred or slightly low.
4. Leave the left 45 to 55% clear for type.

**Rules:** one accent only. The bleed goes off exactly one edge, never two. Safe on story, square,
and landscape alike.

## 2. Tilted multi-device fan

Two to four devices at slight rotations, overlapping, to say "the app does several things" before a
word is read.

**Build:** render each screen rounded, rotate with `sharp(...).rotate(deg, {background:{r:0,g:0,b:0,alpha:0}})`,
composite back to front with the hero device last and largest.

**Rules:** rotations small and varied (about -8, -3, +5 degrees), never symmetric. Cap at four
devices; six reads as clutter at story size. All devices in the same theme.

## 3. Cut-out floating UI chip

Lift one control out of a capture and float it over the frame with a soft shadow, magnifying a 40px
control to hero size without a zoom.

**Build:**
1. `extract` the control's bounding box from the capture at native resolution.
2. Round its corners at a radius matching its own size.
3. Resize it up only if the source was 2x; otherwise place it at native size and scale the rest down.
4. Add a soft shadow (see `references/sharp-recipes.md`) and composite over the frame, overlapping
   the device edge so it reads as lifted off the screen.

**Become candidates:** the water tile, the streak ring, the mood selector, the rep counter, the
calorie ring, a PR badge, a macro bar. All present in the v2 captures.

**Rules:** one chip per frame, two at most. It must overlap something, or it reads as a stray crop.

## 4. Persistent footer lockup

Wordmark plus a single line pinned to the bottom of every asset in a set. Consistency reads as brand.

**Build:** composite `marketing/public/logo.png` resized to a fixed height, bottom centre, with a
fixed margin, on every asset in the set.

**Become version:** logo plus "Free today. Email link, no password." That is literally true and needs
no invented pricing. Never a store badge; Become is a PWA and there is no App Store listing.

## 5. Real-world photo with a screen overlay

For the features that happen in the physical world: photo plate logging, barcode scan, LIVE rep
counting. A real hand, real food, a real room, with the app screen overlaid or held in frame.

**Build:** photo as the ground at `fit: 'cover'`, the rounded screen composited at 35 to 45% of frame
width, a soft shadow under it, and a slight darkening gradient behind the type area.

**Rules:** no personal camera-roll photos of the coach. No body-focused imagery. No before and after
pairing, in any arrangement, ever. Licensed or produced photography only.

## 6. Light and dark twins as a deliberate pair

Become ships both themes as first-class. Two captures of the same screen, same crop, side by side or
sequential in a carousel, is an honest product statement that most competitors cannot make.

**Build:** run both through one script with one crop constant and one quality setting.

**Rules:** identical crop, identical scroll offset, identical content. If the twins differ in content,
they are not twins and the pair should not ship.

## 7. Quantified honesty chip

A small glass pill labelling an AI output as an estimate. Ladder's "Est. Accuracy" bar is the most
trustworthy element in the whole reference library, precisely because it downgrades itself.

**Become version:** an "Estimate" chip beside photo-logged macros. It says "evidence, not vibes"
without making a claim we would have to defend.

**Build:** a rounded rect with low-opacity white fill, composited near the relevant UI element.

## Refuse these

From the inspo analysis, with the reason:

| Pattern | Why not |
|---|---|
| Any frame with an empty or zero state | A competitor shipped three; nothing undercuts an aspirational asset faster |
| Blurring or painting over something | Signals "we shipped a screenshot we were not allowed to show". Recapture instead |
| Leaderboard or rank-versus-others framing | Comparison marketing clashes with empowering not preachy. Compare the user to their own last week |
| Shame taglines, before and after pairs | Violates the responsible-claims rule outright |
| Six-bullet feature dumps | Cap at three bullets per frame, ideally one claim |
| Body-copy-only frames with no headline | Every asset earns a headline |
| Template slips (an inverted corner, a stray gradient) | One spec, checked per export |
| Decorative sticker clutter | If an element does not point at something or state something, cut it |
| Celebrity or athlete-physique borrowing | Jon Don's credibility is coaching |
| Any fabricated number | No like counts, member counts, XP, results, or "N users" |
| Leading with The Becoming | Design inspiration, at most one mention, never the headline theme |

## Colour discipline

| Use | Colour |
|---|---|
| Product, training, primary CTA | Green `#16a34a` / `#22c55e` |
| AI and Mind surfaces | Violet |
| Streaks and The Becoming | Gold |
| Dark ground | `#0a0a0a` |
| Light ground | `#f3f3f1` |

One accent per frame, matched to the in-app primary so the asset and the product feel like one
object. Never three accents. The Remotion project's pillar map uses slightly different hex values;
reconcile against `marketing/.agents/become-context.md` before shipping externally.

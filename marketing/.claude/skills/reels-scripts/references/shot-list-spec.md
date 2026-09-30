# Shot List Spec

How to write the shootable half of a script so the person filming never has to ask a question.

---

## The beat table

Every script ships this exact table. Columns are fixed:

| Time | Shot | On-screen text | VO or dialogue | Audio and cut note |
|---|---|---|---|---|

- **Time** is a range in seconds with one decimal, `0.0-1.5`. Not "intro" or "middle."
- **Shot** names framing, subject, and what is moving. "Close on phone screen, thumb typing 160
  into the weight field" is a shot. "App demo" is not.
- **On-screen text** is the literal text, in the case it will be set. Say nothing here if the
  frame carries no text.
- **VO or dialogue** is the literal line. Write "(none, gym ambience)" when there is no line.
- **Audio and cut note** carries the cut, the reframe, the sound cue.

## Framing and safe areas

| Platform | Vertical | Keep clear |
|---|---|---|
| Reels | 1080x1920 | Top ~200px (header), bottom ~250px (caption and CTA row), right ~120px (action rail) |
| TikTok | 1080x1920 | Bottom ~250px, right ~150px |
| Shorts | 1080x1920 | Bottom ~180px |
| Cover frame | 1080x1920, plus a 1:1 crop that still reads | Center the subject so both crops survive |

Design text into the middle 60% of the frame. A line that reads perfectly in the edit and sits
under the caption bar in the app is a wasted line.

## Screen recording rules

- Record on the real device at full brightness. Never a simulator, never a mockup.
- 390x844 logical viewport is the reference frame; the capture pipeline shoots at 2x device scale.
- Zoom into the region that matters. A full app screen shrunk into a phone frame is unreadable at
  thumb distance.
- Dismiss tutorial overlays and any dev banner before recording.
- Never record a real user account. Dummy accounts only, per `screenshot-capture`.
- Nothing mid-animation, nothing loading, no empty state, no "(beta)" anywhere in frame.

## Reusable assets before you shoot

| Need | Look here first |
|---|---|
| A product screen still | `webapp/public/screenshots/v2/` plus its `manifest.json` |
| An exercise demo clip | `webapp/public/exercises/` — 42 files covering 39 of the 132 exercises, so the big lifts only. They are served as `video/mp4` and play; the black panel in Chromium is a `type="video/quicktime"` attribute bug in `webapp/components/FramedVideo.tsx`, tracked separately. Screen-record on iOS or Safari |
| A rendered brand asset | `marketing/out/` and `marketing/src/campaigns.json` |
| Source images for renders | `marketing/public/` (`dashboard.png`, `programs.png`, `progress.png`, `nutrition.png`, `mindset.png`, `calendar.png`, `chat.png`, `logo.png`) |
| A layout reference | `marketing/inspo-analysis.md` |

If a needed state does not exist, the capture list says so explicitly and names the
`screenshot-capture` run required. Never write a script that quietly assumes a capture nobody has.

## Annotation style

Taken from the strongest pattern in the inspo library, translated into Become's system:

- One annotation per frame. A white marker ellipse or a single arrow, hand-drawn feel.
- It points at the exact control being described. Never a general area.
- Cut-out floating UI chips: lift one control out of the capture and float it with a soft shadow
  so a 40px target reads as a hero element. Ideal for the "Last: 155 lbs x 10" reference line, the
  PR badge, the water tile, the mood selector, the streak ring.
- Never annotate over a face, a number, or the CTA.

## Type and colour on screen

- Geist. Two weights per frame, maximum.
- Brand green `#16a34a` / `#22c55e` for the product accent.
- Violet only on AI and Mind frames. Gold only for streaks and the recap. Never three accents in
  one frame.
- One line of text at a time, replaced on the cut.
- No emoji in on-screen text. Captions may carry one, only if it means something.

## Audio

- Real ambience beats a trend sound when the mechanism makes a sound worth hearing: a bar racking,
  a camera shutter, the click of a set checkbox.
- A trend sound is fine when it does not fight the hook. It is never a reason to make the video.
- Voiceover recorded separately, close mic, no room echo. Match the cut to the sentence, not the
  other way around.
- Always assume sound-off viewing. Every beat must survive muted, which is why on-screen text
  carries the second information channel.

## Delivery checklist for the person filming

- [ ] Phone at full brightness, do-not-disturb on, notifications off.
- [ ] Dummy account signed in, tutorials dismissed, state populated.
- [ ] Theme chosen deliberately, light or dark, and consistent across every screen beat.
- [ ] Each beat shot twice: once as scripted, once half a second longer for edit room.
- [ ] Frame one has motion, a face, or a legible overlay before the first cut.
- [ ] Last shot framed to match the first for the loop-close.
- [ ] Nothing in frame shows a bug, an empty tile, a zero row, or "(beta)".

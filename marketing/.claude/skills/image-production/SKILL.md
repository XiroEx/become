---
name: image-production
description: Processes and exports Become brand imagery with sharp, which is already a webapp dependency — resizing and cropping captures to platform specs, webp and jpeg export at quality targets, device-frame and drop-shadow composites, cut-out UI chips lifted from a screenshot, open-graph and manifest icon sets, and matched light and dark variants. Use when the user says "resize this for stories," "export this at open-graph size," "make a webp," "crop the phone screenshot," "these files are too big," "generate the icons," "put this screenshot in a phone frame," or "why does this look blurry." No new image dependency may be added. For multi-layer designed and animated assets see remotion-assets; for producing the source capture in the first place see screenshot-capture; for the layout patterns worth imitating see inspo-library.
metadata:
  version: 1.0.0
  batch: production-pipelines
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Image Production

You are the image finisher for Become. Your goal is to turn a source capture into a correctly sized,
correctly compressed, on-brand file, using `sharp`, which the repo already has.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce export files at named platform specs: resized and cropped captures, webp and jpeg at quality
targets, device-frame and drop-shadow composites, cut-out UI chips lifted from a screenshot, open
graph images, PWA icon sets, and matched light and dark twins. Done means the files exist, their
dimensions and byte sizes are verified by reading them back, both themes are present where the
surface needs both, and the paths are reported.

## When to use

- A capture needs to become a story, square, landscape, or OG image.
- Files are too heavy for the surface they are going on.
- A screenshot needs a phone frame, a shadow, or a bleed composite.
- One control needs lifting out of a screenshot as a floating chip.
- Icons or favicons need regenerating.
- A light asset exists and its dark twin does not.

**Not this skill:** producing the source capture is `screenshot-capture`. Multi-layer designed or
animated assets, and anything with typeset headline copy, is `remotion-assets`. Choosing the layout
pattern is `inspo-library`.

## Process

### Assessment gate

1. **What is the source, and what are its true pixel dimensions?** Read them; do not trust the
   filename. `timeout 30 node -e "require('./webapp/node_modules/sharp')('<path>').metadata().then(m=>console.log(m.width,m.height,m.format))"`
2. **Which surface, and therefore which spec?** Story, square, landscape, OG, Twitter card, icon,
   directory gallery. The table is in `references/platform-specs.md`.
3. **Does an export already exist?** Check `marketing/out/`, `webapp/public/screenshots/v2/`, and
   `webapp/public/`. Reuse beats regenerating.
4. **Light, dark, or both?** Most marketing surfaces need both. A single-theme export is a decision
   to state, not a default.

### Working method

sharp is a `webapp/package.json` dependency at `^0.34.5`. **Do not add an image dependency.** From
the repo root, resolve it explicitly:

```bash
timeout 120 node -e "const sharp=require('./webapp/node_modules/sharp'); /* ... */"
```

Or write a short script to a scratch path, run it under `timeout`, and delete it. Never leave a
one-off script in the repo. Every recipe in `references/sharp-recipes.md` is written this way.

Write outputs to a named directory, never in place over the source. `marketing/out/` for campaign
work (gitignored), `webapp/public/` only when the file is genuinely part of the app.

### Output buckets (pipeline-shaped, always these five, in this order)

- **Preflight checks** — source path and true dimensions, target spec, whether an export exists.
- **Commands to run** — every command, bounded by `timeout`, in order.
- **Outputs and where they land** — path, dimensions, byte size, per file.
- **Verification** — dimensions read back from the files, size budgets met, both themes present.
- **Known failure modes** — which traps below apply.

## Frameworks

Four frameworks, in order of how often they decide whether an export is usable.

### 1. Resolution discipline

**Check for:**
- Is the source at least as large as the target in both dimensions?
- Was the source captured at 2x? The v2 set is 780x1688, from 390x844 at `deviceScaleFactor: 2`.
- Is the source already lossy? A webp re-encoded as a webp compounds artifacts.

**Common issues:**
- *Upscaling.* Enlarging a 780px capture to 1080 for a story produces soft type. The app UI is
  full of 12px labels and they go first.
- *Double compression.* Taking `dashboard-light.webp` at quality 84 and re-encoding at 84 again
  visibly degrades gradients.
- *Cropping after resizing.* Crop first at full resolution, then resize once.

**Strong patterns:**
- ❌ `sharp(src).resize({ width: 1080 })` from a 780px source.
  ✅ Recapture at `deviceScaleFactor: 3`, or compose the 780px capture at its native size inside a
  1080px frame. A device-framed phone at native scale looks better than an upscaled full bleed.
- Always `.resize({ width: N, withoutEnlargement: true })` so an accidental upscale fails loudly.
- Keep the highest-fidelity intermediate as PNG, and encode to webp or jpeg exactly once, last.

### 2. Format and quality budgets

**Check for:**
- Is the content flat UI with text? webp. Is it photographic or a composite over a gradient? jpeg.
  Does it need transparency? png, and only then.
- Does the output meet the size budget for its surface?
- Was quality chosen, or defaulted?

**Common issues:**
- *png for a screenshot.* A 780px UI capture as png is roughly 5x the webp. The v2 set sits at 40
  to 95 KB per shot as webp at quality 84.
- *jpeg for flat UI.* Hard edges and small type get ringing artifacts. webp handles them cleanly.
- *No budget at all.* A 2 MB OG image loads slowly on the surface that most needs to be fast.

**Strong patterns:**
- ❌ `.png()` for everything because it is lossless.
  ✅ `.webp({ quality: 84 })` for product captures, `.jpeg({ quality: 90, mozjpeg: true })` for
  photographic composites, `.png()` only for transparency.
- State the achieved byte size in the report, every time.
- Budgets: OG under 300 KB, story or square under 500 KB, gallery capture under 150 KB, icons a few
  KB each. Full table in `references/platform-specs.md`.

### 3. Cropping OS and app chrome

**Check for:**
- Does the source carry a status bar, a home indicator, or browser chrome?
- Is the crop consistent between the light and dark twins?
- Does the crop cut a control in half?

**Common issues:**
- *Inconsistent crops between twins.* Two shots trimmed by eye differ by a few pixels and the pair
  reads wrong when placed side by side.
- *Cropping into content.* Trimming a status bar is fine. Trimming the app header because it looked
  like chrome is not.
- *Keeping competitor chrome.* Captures in `marketing/inspo/` are PNG stills of a phone screen and
  carry iOS and Instagram chrome. That is noise. It is never a source asset anyway.

**Strong patterns:**
- ❌ Two hand-picked `extract` boxes, one per theme.
  ✅ One crop constant applied to both files in the same script run.
- At 780x1688 the status bar is roughly the top 94px and the home indicator roughly the bottom 68px.
  Measure once on the actual file and reuse the numbers.
- If a screen needs cropping to look right, consider whether the capture should have been framed
  differently. `screenshot-capture` is cheaper than repair.

### 4. Composites that look designed, not pasted

**Check for:**
- Is the phone frame proportional to the screen inside it (radius scales with width)?
- Does the shadow sit under the object with a plausible light direction?
- Is there exactly one accent colour in the frame?

**Common issues:**
- *A fixed corner radius at every size.* A 40px radius on a 1080px phone and on a 300px phone are
  different objects. Scale the radius with the width.
- *Hard-edged cut-outs.* A UI chip lifted with a rectangular crop and no shadow reads as a mistake.
- *Accent soup.* Green plus violet plus gold in one frame. The inspo analysis is explicit: one
  accent per frame, matched to the in-app primary.

**Strong patterns:**
- Text on one side, phone bleeding off the opposite edge. It implies there is more app than fits,
  and it avoids needing a perfect full-device render.
- Cut-out floating UI chip with a soft shadow, to make a 40px control hero sized without a zoom.
- ❌ Three device renders, three accents, four type weights.
  ✅ One or two devices, one accent, two type weights at most.

Recipes for all four composites are in `references/composite-patterns.md`.

## Become-specific rules

- **`sharp` only.** It is already in `webapp/package.json`. No new image dependency, no ImageMagick,
  no cloud service.
- **Brand colours:** primary green `#16a34a` and `#22c55e`; violet for AI and Mind surfaces; gold for
  streaks and The Becoming. One accent per frame.
- **Type is Geist.** Any typeset text belongs in `remotion-assets`, not in a sharp composite.
- **Light and dark ship together.** If you export a light asset, export its dark twin in the same
  run, with the same crop and the same quality.
- **Sources come from `webapp/public/screenshots/v2/`.** Check `manifest.json` before using a shot,
  including its `knownIssues`.
- **Never edit a screenshot to hide a bug.** Fix the bug or recapture. Blurring or painting over a
  defect is falsification, and the inspo analysis records how obviously it reads.
- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today and
  no pricing exists. Never composite a price badge, a star rating, or a download count into an image.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or "(beta)".
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline theme.**
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or pound
  counts, no body-shaming, no before/after framing that implies a guaranteed outcome. A side-by-side
  composite of two captures can imply a guaranteed outcome even with no words. Do not build one.
- **Assets are reused, not regenerated.** Check `marketing/out/` and `screenshots/v2/` first.
- Bound every command with `timeout`. Delete scratch scripts when done.

## Quality bar

- [ ] Source dimensions were read from the file, not assumed.
- [ ] Nothing was upscaled. `withoutEnlargement: true` was used, or the source was large enough.
- [ ] Output dimensions match the platform spec exactly, verified by reading the files back.
- [ ] File size is inside the budget for the surface, and the actual number is reported.
- [ ] Format matches the content: webp for UI, jpeg for photographic, png only for transparency.
- [ ] Light and dark twins both exist, with identical crop and quality, or the single-theme choice
      is stated and justified.
- [ ] No status bar, home indicator, or browser chrome left in frame unless deliberate.
- [ ] One accent colour per frame.
- [ ] Nothing was blurred, painted over, or cropped to hide a defect.
- [ ] No price, rating, count, or results claim composited in.
- [ ] Scratch scripts deleted; no new dependency added.

## Related skills

| Skill | Use it when |
|---|---|
| `screenshot-capture` | The source capture does not exist yet, or is stale |
| `remotion-assets` | The asset needs typeset headlines, layout, or motion |
| `inspo-library` | Picking the composite pattern before building it |
| `web-app-listing` | The output is a directory gallery image or install-surface metadata |
| `referral-program` | The output is a shareable artifact rendered from user data |

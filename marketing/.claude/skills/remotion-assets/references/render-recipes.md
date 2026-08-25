# Render Recipes

The real npm scripts from `marketing/package.json`. Run everything from `marketing/`. Every command
is wrapped in `timeout`. Never poll for an output file in an unbounded loop.

## Setup

```bash
timeout 600 npm install      # node_modules is absent in a fresh worktree
timeout 120 npm run typecheck
```

`typecheck` is `tsc --noEmit`. It is cheap and it catches the errors that otherwise surface 4 minutes
into a bundle.

## Source images

```bash
timeout 120 npm run assets:sync
```

`marketing/scripts/sync-assets.mjs` copies eight files from `webapp/public/` into `marketing/public/`:

| From | To |
|---|---|
| `logo.png` | `logo.png` |
| `screenshots/ss-dashboard.png` | `dashboard.png` |
| `screenshots/ss-programming.png` | `programs.png` |
| `screenshots/ss-mind.png` | `mindset.png` |
| `screenshots/ss-nutrition.png` | `nutrition.png` |
| `screenshots/ss-progress.png` | `progress.png` |
| `screenshots/ss-calendar.png` | `calendar.png` |
| `screenshots/ss-chat.png` | `chat.png` |

**The mapping points at the legacy `ss-*.png` captures, not `screenshots/v2/`.** A sync therefore
refreshes the render inputs from the older shot set. If a render needs the current v2 look, either
update the mapping in `marketing/scripts/sync-assets.mjs` (and re-derive PNGs from the v2 webp with
`image-production`) or place the file into `marketing/public/` by hand. Say which you did in the
report. Never ship a render whose product screen is silently out of date.

The script fails hard if a source file is missing, which is the desired behaviour.

## Interactive

```bash
timeout 3600 npm run studio
```

`remotion studio src/index.ts`. The fast loop: pick any registered composition, edit
`src/campaigns.json` or a component, see it live. Iterate here before committing to a render. This
is a long-running foreground server; run it only when a human is watching, and stop it afterwards.

## Stills

| Command | Output | Size |
|---|---|---|
| `timeout 300 npm run render:square` | `out/become-social-square.png` | 1080x1080 |
| `timeout 300 npm run render:story` | `out/become-story-poster.png` | 1080x1920 |
| `timeout 300 npm run render:og` | `out/become-open-graph.png` | 1200x630 |

## One campaign asset

Faster than the whole collection when a single row changed:

```bash
timeout 300 npx remotion still src/index.ts Campaign07 \
  out/collection/square/07-mood-is-data.jpg --image-format=jpeg --jpeg-quality=90
```

The id and the slug both come from the row. Keep the output path in the same
`out/collection/<format>/<slug>.jpg` shape the collection script uses.

## The 46 asset collection

```bash
timeout 1800 npm run render:collection
```

`marketing/scripts/render-collection.mjs`: bundles once, reads `src/campaigns.json`, then runs three parallel
workers rendering `renderStill` at `jpeg` quality 90 into `out/collection/<format>/<slug>.jpg`. It
logs `[n/46] <path>` per asset and throws `Missing composition <id>` if a row has no registered
composition.

## Videos

```bash
timeout 3600 npm run render:reel        # out/become-reel.mp4, 1080x1920, 12s, h264 crf 18
timeout 5400 npm run render:videos      # out/videos/<slug>.mp4, 19 x 6s, h264 crf 20
timeout 5400 npm run render:reviewed    # out/videos-reviewed/<slug>.mp4, 19 x 8s, h264 crf 18
```

`render-videos.mjs` and `render-reviewed.mjs` render sequentially at `concurrency: 3`, log progress,
and **assert a minimum output size** (100 KB and 150 KB) so a silently empty render fails loudly
instead of shipping. `remotion.config.ts` sets concurrency 2 for CLI renders and overwrite on.

Video renders are the longest jobs in the project. Run them deliberately, one at a time, and never
alongside a collection render.

## Review contact sheets

```bash
timeout 900 npm run review:pass -- 3
```

`marketing/scripts/render-review-pass.mjs` takes a pass number 1 to 10, maps it to a fixed frame
(`[20,45,70,90,110,130,150,170,200,225]`), renders all 19 `Reviewed*` compositions at that frame at
`scale: 0.4`, and tiles them with ffmpeg into `out/reviews/pass-NN/sheet.png` (5x4 grid). It throws
unless exactly 19 reviewed compositions exist.

This is the critique loop: one sheet per pass, look at all 19 at the same moment in time, fix what is
inconsistent. **Requires `ffmpeg` on PATH.**

## Everything

```bash
timeout 7200 npm run render
```

`assets:sync` then square, story, og, reel, collection, videos, reviewed. Very long. Only run it when
the source screenshots changed and every deliverable genuinely needs regenerating.

## Verify

```bash
timeout 120 node -e "
const sharp=require('../webapp/node_modules/sharp'),fs=require('fs'),p=require('path');
const walk=d=>fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p.join(d,e.name)):[p.join(d,e.name)]):[];
(async()=>{for(const f of walk('out').filter(f=>/\.(png|jpe?g)$/.test(f))){
  const m=await sharp(f).metadata();
  console.log(f,m.width+'x'+m.height,Math.round(fs.statSync(f).size/1024)+'KB');
}})();
"
timeout 60 bash -c 'ls -la out/videos out/videos-reviewed 2>/dev/null | head -50'
```

Confirm dimensions against the format, then open the files. Dimensions passing is not the same as the
asset being good.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Missing composition CampaignNN` | Row `id` is not registered in `Root.tsx` | Fix the `id` to match the `Campaign\d{2}` pattern |
| `ENOENT` during `assets:sync` | A source `ss-*.png` was renamed or removed in `webapp/public/` | Update the mapping in `marketing/scripts/sync-assets.mjs` |
| Empty product window in the render | `image` value is not a file in `marketing/public/` | Fix the filename. There is no error for this |
| `Rendered file is unexpectedly small` | Video render produced a near-empty file | Real failure. Check the composition renders in studio |
| Headline overflows the frame | `headline` written as one long string | Split into array lines |
| ffmpeg not found | `review:pass` needs ffmpeg | Install it or skip the contact sheet |
| Wrong typeface in output | Geist not resolving on the render host | Fix the font source. Do not accept the fallback |
| Render takes forever | A full `npm run render` was started for one asset | Render the single composition instead |

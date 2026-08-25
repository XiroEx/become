# Platform Specs

Target dimensions, formats, and size budgets. Verify every export against this table by reading the
file back, not by trusting the command.

## Social and campaign

| Surface | Pixels | Format | Quality | Budget | Notes |
|---|---|---|---|---|---|
| Instagram / TikTok story, reel cover | 1080x1920 | jpeg or webp | 90 / 84 | < 500 KB | Safe area below |
| Square post | 1080x1080 | jpeg or webp | 90 / 84 | < 500 KB | The most reusable format |
| Portrait feed post | 1080x1350 | jpeg | 90 | < 500 KB | Not in the Remotion dimensions map; crop from story |
| Landscape ad, link graphic | 1200x628 | jpeg | 90 | < 400 KB | The Remotion `landscape` format |
| Open graph | 1200x630 | jpeg or png | 90 | < 300 KB | Note: 630, two pixels taller than the ad format |
| Twitter / X summary large image | 1200x628 | jpeg | 90 | < 300 KB | Same asset as the ad works |

### Story safe area

At 1080x1920, keep everything that must be read inside a centre box roughly:

- top 250px reserved (profile row, progress bars)
- bottom 320px reserved (reply bar, link sticker, CTA chrome)
- left and right 60px margin

So the readable band is about 1080x1350 centred. Design the crop so a bleed image can lose the top
and bottom without losing meaning.

## Product captures

| Surface | Pixels | Format | Quality | Budget |
|---|---|---|---|---|
| Source capture (native) | 780x1688 | png intermediate | lossless | any |
| Shipped capture | 780 wide | webp | 84 | 40 to 95 KB |
| Directory gallery | 1242x2688 or 1080x1920 | png or jpeg | 90 | < 500 KB |
| Landing page inline | 780 wide | webp | 84 | < 100 KB |

780x1688 is `390x844` at `deviceScaleFactor: 2`. That is the whole capture pipeline geometry; see
`screenshot-capture`.

## Icons and favicons

| File | Pixels | Format | Notes |
|---|---|---|---|
| PWA icon | 192x192, 512x512 | png | The manifest is a route, not a static file: `webapp/app/manifest.json/route.ts` |
| Maskable icon | 512x512 | png | Keep art inside the centre 80% safe zone |
| Apple touch icon | 180x180 | png | No transparency; iOS composites on white |
| Favicon | 32x32, 16x16 | png or ico | |

`webapp/scripts/generate_icons.ts` already uses sharp for icon generation. Read it before writing a
new generator.

## Choosing the format

| Content | Format | Why |
|---|---|---|
| App UI with small text | webp | Hard edges and 12px labels stay crisp; smallest file |
| Photographic image, gradient composite | jpeg, `mozjpeg: true` | Better on continuous tone; universally supported |
| Anything needing transparency | png | Only reason to use png |
| Anything going through Remotion | leave it to Remotion | It emits jpeg stills at quality 90 |

Never use gif. Never use avif here; nothing in the pipeline consumes it.

## Budget enforcement

```bash
timeout 60 node -e "
const fs=require('fs');
const limits={'.webp':100,'og':300,'story':500};
for (const f of process.argv.slice(1)) {
  const kb=Math.round(fs.statSync(f).size/1024);
  console.log(f, kb+'KB');
}
" file1.webp file2.jpg
```

If an export is over budget, drop quality in steps of 4 and re-measure. Do not resize down to hit a
budget unless the surface genuinely does not need the pixels; a soft image is worse than a slightly
heavy one.

## Where outputs go

| Destination | For |
|---|---|
| `marketing/out/` | Campaign work. **Gitignored.** Report paths, do not assume a merge ships them |
| `webapp/public/screenshots/v2/` | Shipped product captures only, with a manifest entry |
| `webapp/public/` | Files the app itself serves (icons, OG image, landing imagery) |
| `/tmp/...` | Intermediates and scratch. Clean up |

Never write over a source file. Always write to a named output path.

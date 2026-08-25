# Campaign Schema

`marketing/src/campaigns.json` is an array of 46 rows. It is the main editable surface of the whole
asset system: one row in, one rendered file out.

## Row shape

```json
{
  "id": "Campaign01",
  "slug": "01-start-where-you-are",
  "format": "square",
  "pillar": "system",
  "kicker": "Start here",
  "headline": ["START WHERE", "YOU ARE."],
  "body": "You do not need a perfect week. You need a clear next move.",
  "cta": "Build your plan",
  "image": "dashboard.png",
  "variant": 0
}
```

## Fields

| Field | Type | Rule |
|---|---|---|
| `id` | string | `Campaign\d{2}`, unique. `Root.tsx` registers one composition per row using this. `render-collection.mjs` throws `Missing composition <id>` if it does not resolve |
| `slug` | string | `NN-kebab-case`, unique. Becomes the output filename: `out/collection/<format>/<slug>.jpg` |
| `format` | enum | `square` (1080x1080), `story` (1080x1920), `landscape` (1200x628). Nothing else exists in the dimensions map |
| `pillar` | enum | `system`, `training`, `mindset`, `nutrition`, `progress`, `coaching`. Selects the accent colour |
| `kicker` | string | Short eyebrow, 1 to 3 words. Title case. "Start here", "Daily targets", "Your week" |
| `headline` | string[] | **The array is the line break.** All caps in the shipped set. 2 to 3 lines |
| `body` | string | One sentence. Two short ones at most. Sets up the mechanism |
| `cta` | string | Verb phrase, 2 to 4 words. Not a sentence, not a URL |
| `image` | string | A filename in `marketing/public/`. One of `dashboard.png`, `programs.png`, `progress.png`, `nutrition.png`, `mindset.png`, `calendar.png`, `chat.png` |
| `variant` | number | 0 to 5, selects the layout via `variant % 6`. See `references/project-map.md` |

## Current distribution

| Format | Rows |
|---|---|
| `square` | 16 |
| `story` | 15 |
| `landscape` | 15 |

Rows 1 to 19 additionally drive the `Video*` compositions, because `render-videos.mjs` and
`Root.tsx` both take `campaigns.slice(0, 19)`. **Reordering the file changes which concepts have
videos.** Append, do not insert.

## Adding a row

1. Pick the next free `id` (`Campaign47`) and a matching `slug` (`47-<kebab-slug>`).
2. Choose `format` from the three. Choose `pillar` so the accent is right.
3. Write the copy through the voice rules first. See the copy rules below.
4. Choose `image` from the eight in `marketing/public/`, matched to the pillar.
5. Choose `variant`. Look at what neighbours in the same format use so the set stays varied.
6. Append to the array. Do not insert into the first 19.
7. `timeout 120 npm run typecheck`, then render just that composition:
   `timeout 300 npx remotion still src/index.ts Campaign47 out/collection/square/47-<slug>.jpg --image-format=jpeg --jpeg-quality=90`
8. Inspect the output before rendering the full collection.

## Copy rules for a row

Voice: confident, concrete, zero fluff, empowering not preachy. "Evidence, not vibes."

### `headline`

Write to the break. Each array element is a typeset line, so balance them.

❌ `["CONSISTENCY COMPOUNDS INTO VISIBLE PROGRESS"]` — overflows at story aspect, no rhythm.
✅ `["CONSISTENCY", "COMPOUNDS."]` — two beats, balanced width.

❌ `["TRANSFORM YOUR", "FITNESS JOURNEY."]` — banned word, promises nothing concrete.
✅ `["NEVER MISS", "TWICE."]` — a rule the user can act on today.

Two-tone stacks read well in the layouts: a white line over an accent line splits an all caps stack
into rhythm without a second typeface.

### `body`

One sentence stating the mechanism, not the promise.

❌ "Become helps you unlock your potential and crush your goals."
✅ "Log the work. See the trend. Know what changed."

❌ "Lose the weight you have been carrying for years."
✅ "Know what is left before dinner, not after the week is over."

### `cta`

Verb plus object. Something the product actually does.

✅ "Choose a program", "Track your food", "Plan the week", "Check in", "Browse programs".
❌ "Start your journey", "Get started today", "Sign up now for free access".

### Hard limits on copy

- No price, tier, trial length, or discount. Become is free today and no pricing exists.
- No results claim, no timeline, no pound count.
- No fabricated testimonial, user count, star rating, or download number.
- No shame framing, no before/after construction.
- No em dashes. Use a period, a comma, or a colon.
- Banned: journey, unlock your potential, game-changer, revolutionary, seamless, effortless, 10x,
  crush it, no excuses, beast mode, just, simply.
- The Becoming appears at most once across a campaign set, and never as the headline theme.

## Validating the file

```bash
timeout 60 node -e "
const c=require('./marketing/src/campaigns.json'), fs=require('fs');
const pub=fs.readdirSync('marketing/public');
const fmt=new Set(['square','story','landscape']);
const ids=new Set(), slugs=new Set(); let bad=0;
for(const r of c){
  const e=[];
  if(ids.has(r.id))e.push('dup id'); ids.add(r.id);
  if(slugs.has(r.slug))e.push('dup slug'); slugs.add(r.slug);
  if(!fmt.has(r.format))e.push('bad format');
  if(!pub.includes(r.image))e.push('missing image '+r.image);
  if(!Array.isArray(r.headline))e.push('headline not array');
  if(typeof r.variant!=='number')e.push('variant not number');
  if(e.length){bad++;console.log(r.id,e.join(', '));}
}
console.log(bad?bad+' bad rows':'all '+c.length+' rows ok');
"
```

Run it after every edit, before the render.

# Remotion Project Map

Everything under `marketing/`. Read this before editing any file in `marketing/src/`.

## Files

| File | Holds | Edit it when |
|---|---|---|
| `marketing/src/index.ts` | `registerRoot(RemotionRoot)`. The entry point every script bundles | Never |
| `marketing/src/Root.tsx` | The composition registry and the `dimensions` map | Adding a format, or changing a duration or fps |
| `marketing/src/compositions.tsx` | The four hero pieces: `SocialSquare`, `StoryPoster`, `OpenGraph`, `BecomeReel` | Changing the flagship assets |
| `marketing/src/campaigns.json` | 46 campaign rows. The editable copy surface | Almost every copy task |
| `marketing/src/campaignCollection.tsx` | `Campaign` type, the pillar colour map, and the six still layouts | Adding a layout or changing an accent |
| `marketing/src/videoCollection.tsx` | `CampaignVideo`, the first-generation 6 second spot system | Rarely. Superseded by the reviewed system |
| `marketing/src/reviewedCampaigns.ts` | 19 `ReviewedCampaign` storyboards with motif, hook, proof, cta, layout, tempo | Changing a reviewed video's content |
| `marketing/src/reviewedVideo.tsx` | `ReviewedVideo`, the per-motif motion instruments | Changing how a motif animates |
| `marketing/remotion.config.ts` | `jpeg` video image format, overwrite on, concurrency 2 | Rarely |
| `marketing/scripts/*.mjs` | The five render drivers | Rarely. Prefer editing data |
| `marketing/public/` | The eight source images the layouts composite | Via `npm run assets:sync`, or by hand |
| `marketing/out/` | All output. **Gitignored** | Never by hand |

## Composition registry (`Root.tsx`)

| Id | Component | Size | Frames / fps |
|---|---|---|---|
| `BecomeReel` | `BecomeReel` | 1080x1920 | 360 @ 30 (12s) |
| `SocialSquare` | `SocialSquare` | 1080x1080 | 1 (still) |
| `StoryPoster` | `StoryPoster` | 1080x1920 | 1 (still) |
| `OpenGraph` | `OpenGraph` | 1200x630 | 1 (still) |
| `Campaign01` .. `Campaign46` | `CampaignAsset` | per `format` | 1 (still) |
| `VideoCampaign01` .. `VideoCampaign19` | `CampaignVideo` | 1080x1920 | 180 @ 30 (6s) |
| `Reviewed01` .. `Reviewed19` | `ReviewedVideo` | 1080x1920 | 240 @ 30 (8s) |

The dimensions map, used for every `CampaignAsset`:

```ts
const dimensions = {
  square:    {width: 1080, height: 1080},
  story:     {width: 1080, height: 1920},
  landscape: {width: 1200, height: 628},
} as const;
```

Note the video compositions are built from **the first 19 rows of `campaigns.json` only**
(`.slice(0, 19)`), with ids prefixed `Video`. Reordering the JSON therefore changes which concepts
have videos.

## The six still layouts

`campaignCollection.tsx` ends with:

```ts
const layouts = [RailLayout, ProductWindowLayout, LightLayout, CardLayout, TypeCropLayout, SystemLayout];
const Layout = layouts[props.campaign.variant % layouts.length];
```

So `variant` is a layout selector, 0 through 5, and any integer works via the modulo.

| `variant` | Layout | Character |
|---|---|---|
| 0 | `RailLayout` | Dark, accent rail, type-led |
| 1 | `ProductWindowLayout` | Dark, the screenshot in a framed window |
| 2 | `LightLayout` | Light paper ground. Accent falls back to ink when the pillar is `system` |
| 3 | `CardLayout` | Dark card inside a border, progress pips at the top |
| 4 | `TypeCropLayout` | Oversized cropped type. Accent softens for `system` |
| 5 | `SystemLayout` | The three-part TRAIN / MIND / FUEL system frame |

Changing `variant` restyles a row completely without touching a component. Try that before writing a
seventh layout.

## Pillar colour map (as shipped)

```ts
const colors = {
  system:    '#F7F7F5',
  training:  '#00D26A',
  mindset:   '#9818FF',
  nutrition: '#FF981A',
  progress:  '#3887FF',
  coaching:  '#FF496C',
};
const ink = '#08080A'; const white = '#F7F7F5'; const muted = '#A1A1AA'; const paper = '#F3F3F1';
```

**This does not fully match the brand tokens.** Brand primary green is `#16a34a` / `#22c55e`; the
project uses `#00D26A`. Violet is the AI and Mind colour in both, gold is the streak and Becoming
colour in brand but does not exist in the project map. Reconcile against
`marketing/.agents/become-context.md` before shipping externally, and make the change in the `colors`
map so every asset moves together. Never override a colour inline in a layout.

## Reviewed video system

`reviewedCampaigns.ts` is the storyboard data for the 19 rebuilt 8 second spots.

```ts
type ReviewedCampaign = {
  id: string; slug: string; pillar: CampaignPillar; motif: Motif;
  hook: string[];        // headline lines, same array-is-the-break rule
  proof: string;         // one supporting sentence
  cta: string; image: string;
  light: boolean;        // light or dark ground
  label: string;         // small eyebrow
  metric: string;        // a short numeric or word chip used as a design element
  layout: 'left' | 'center' | 'split' | 'poster';
  tempo: 'snap' | 'steady' | 'build';
};
```

`Motif` is a closed union of 19 named motion instruments (`starting-line`, `compound-reps`,
`bounceback-calendar`, `receipt`, `blueprint`, `mental-reps`, `mood-wave`, `macro-gauge`,
`protein-meter`, `coach-thread`, `trendline`, `pocket-card`, `countdown`, `plates`,
`practice-orbit`, `word-morph`, `week-grid`, `calendar-sweep`, `movement-swap`). Adding a motif means
adding a case in `reviewedVideo.tsx`, which is real animation work. Reuse an existing motif first.

`metric` is a design element. Treat it as illustrative of a mechanism, never as an outcome Become is
offering.

## Fonts

The compositions set `fontFamily` from local constants (a sans for body, a display face for
headlines, a mono for chips). Brand type is **Geist**. If a render comes back in a fallback face, the
font is not resolving on the render host; fix the font source rather than accepting the fallback.

## Where things land

| Script | Output |
|---|---|
| `render:square` | `marketing/out/become-social-square.png` |
| `render:story` | `marketing/out/become-story-poster.png` |
| `render:og` | `marketing/out/become-open-graph.png` |
| `render:reel` | `marketing/out/become-reel.mp4` |
| `render:collection` | `marketing/out/collection/{square,story,landscape}/<slug>.jpg` |
| `render:videos` | `marketing/out/videos/<slug>.mp4` |
| `render:reviewed` | `marketing/out/videos-reviewed/<slug>.mp4` |
| `review:pass -- N` | `marketing/out/reviews/pass-NN/01..19.png` plus `sheet.png` |

All of `out/` is gitignored (`marketing/.gitignore`), as is `marketing/inspo/` and
`marketing/reviews/`.

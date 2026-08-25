# Surface Specs

Character and word budgets per surface. Write to the budget, then print the count next to the field
in your output. Anything over the "hard" column truncates or wraps badly on a real device.

## Landing page (`webapp/components/landing/BecomeLanding.tsx`)

| Field | Target | Hard limit | Notes |
|---|---|---|---|
| Hero eyebrow | 3-5 words | 30 chars | Currently a hub triplet with icons. Keep it a list, not a sentence. |
| Hero H1 | 5-8 words | 8 words / 3 rendered lines | Rendered as separate `<span>` lines, so you control the break. Write to the break. |
| Hero lead | 20-28 words | 35 words | One sentence. At 390px, 35 words is five lines and pushes the CTA under the fold. |
| Primary CTA | 2-3 words | 18 chars | Currently "Get started" in the hero, "Start today" in the closing. |
| Secondary CTA | 2-4 words | 22 chars | Anchor link, not a second conversion path. |
| Hero footnote | 8-12 words | 70 chars | The risk-reversal slot. Coach credit plus signup cost. |
| Section kicker | 1-3 words | 20 chars | "Why Become," "How it works." |
| Section title | 6-12 words | 14 words | Can be a full sentence. Wraps to two lines on desktop, three on mobile. |
| Section lead | 20-35 words | 45 words | One or two sentences. |
| Feature card title | 2-5 words | 32 chars | Must not wrap past two lines in the grid. |
| Feature card body | 12-22 words | 30 words | Cards in a row must be within a few words of each other or the grid looks broken. |
| Step title | 2-4 words | 26 chars | Three-step rail, so all three must be the same shape. |
| Coach quote | 10-20 words | 25 words | First person, Jon only. Goes through `coach-brand-voice`. |
| Closing H2 | 2-5 words | 30 chars | Currently "Ready to become?" |
| Closing body | 15-25 words | 30 words | Carries the risk reversal. |

## Metadata (`webapp/app/layout.tsx`)

| Field | Target | Hard limit | Notes |
|---|---|---|---|
| Title tag | 50-58 chars | 60 chars | Currently just the app name from env. Brand plus the frame, not brand alone. |
| Meta description | 140-155 chars | 160 chars | Not a ranking factor, is a click factor. One mechanic plus one differentiator. |
| OG title | 40-55 chars | 60 chars | Can differ from the title tag. Optimize for a chat preview. |
| OG description | 60-90 chars | 200 chars | Messaging apps truncate around 90 on mobile. |
| OG image alt | 8-15 words | 125 chars | Describe the screen, not the brand. |

Note: `webapp/app/layout.tsx` has thin metadata today and no `metadataBase`, no canonical, and no
Twitter card. Producing the copy is this skill; landing the fields is `seo-geo`.

## PWA manifest (`webapp/app/manifest.json/route.ts`, strings from `webapp/lib/appChannel.ts`)

| Field | Target | Hard limit | Notes |
|---|---|---|---|
| `name` | Brand only | 45 chars | Beta channel renders "Become (beta)". Never write "(beta)" into marketing copy. |
| `short_name` | 1 word | 12 chars | Home-screen label. Truncates hard on iOS. |
| `description` | 60-120 chars | 300 chars | Install sheets on Android show roughly the first 120. |

`screenshots` in the manifest is currently an empty array. Filling it is a `web-app-listing` job that
consumes `webapp/public/screenshots/v2/`.

## Email (Nodemailer SMTP, so plain structure)

| Field | Target | Hard limit | Notes |
|---|---|---|---|
| Subject | 28-42 chars | 60 chars | iOS Mail shows about 35 on a 390px screen. |
| Preview text | 40-90 chars | 130 chars | Never let it fall through to the first body line. |
| From name | Brand or coach | 25 chars | Pick one and keep it stable, it drives inbox recognition. |
| Button label | 2-4 words | 24 chars | One button per email. |
| Body paragraph | 15-30 words | 40 words | Two to four short paragraphs total. |

The magic-link email is the highest-stakes send we make. Its copy rules live in `email-lifecycle`.

## Web push (browser notifications, no native app)

| Field | Target | Hard limit | Notes |
|---|---|---|---|
| Title | 25-38 chars | 40 chars | Android truncates near 40, and the truncation lands mid-word. |
| Body | 45-75 chars | 120 chars | Collapsed notifications show one line. Assume one line. |
| Action label | 1-2 words | 12 chars | Optional, and only if it does something different from tapping the body. |

Full nudge inventory and timing rules: `push-notifications`.

## Directory and listing blurbs

| Field | Target | Hard limit | Notes |
|---|---|---|---|
| Tagline | 35-40 chars | 40 chars | Product Hunt style. Must work with the name removed. |
| Short blurb | 55-60 chars | 60 chars | AlternativeTo, roundup tables. |
| Standard blurb | 150-160 chars | 160 chars | The most reused length. Write this one first. |
| Extended blurb | 240-260 chars | 260 chars | BetaList and similar. |
| Long description | 120-250 words | 400 words | Structure it: what it is, the five hubs, who it is for, how to start. |
| First comment | 80-150 words | No limit | Founder voice, so it goes through `coach-brand-voice`. |

Full field specs per directory: `web-app-listing`.

## In-product and share surfaces

| Field | Target | Hard limit | Notes |
|---|---|---|---|
| Share-sheet title | 4-8 words | 60 chars | Must be legible out of context, in a group chat, with no image. |
| Share-sheet text | 10-18 words | 100 chars | Names what the recipient will see, not what the sender did. |
| Install prompt heading | 3-6 words | 40 chars | No `beforeinstallprompt` handler exists in the repo today. |
| Install prompt body | 12-20 words | 120 chars | State what installing changes: home screen, full screen, push. |
| Empty-state line | 6-12 words | 60 chars | Never ships in a marketing capture, but often needs writing. |

## Ads

| Platform | Field | Hard limit | Notes |
|---|---|---|---|
| Meta | Primary text | 125 chars before "See more" | Front-load the mechanic. |
| Meta | Headline | 40 chars | Truncates without ellipsis on some placements. |
| Meta | Description | 30 chars | Often not rendered. Do not put the offer here. |
| TikTok | Ad text | 100 chars | 12-100 range, and it overlays the video. |
| Any | On-screen text in video | 4-7 words per frame | Different information from the spoken line. |

Fitness ad policy limits (no before/after, no body-focused personal-attribute copy) are enforced in
`paid-social`. Write to them from the start rather than getting rejected.

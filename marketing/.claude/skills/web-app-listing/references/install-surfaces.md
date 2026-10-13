# Install Surfaces

Become has no store page. The manifest, the page metadata, the icons, the install prompt, and the
share sheet are the store page. This is the inventory of each surface, the file that holds it, its
state today, and the copy that belongs in it.

Verify state against the repo before acting. These notes were taken from the worktree and the app
changes.

---

## 1. PWA manifest

**File.** `webapp/app/manifest.json/route.ts`. Served from a route rather than `public/manifest.json`
on purpose: a static file in `public/` would shadow the route, the service worker special-cases this
exact path, and already-installed PWAs reference it. Do not move it.

**Strings.** `APP_NAME`, `APP_SHORT_NAME`, `APP_DESCRIPTION` come from `webapp/lib/appChannel.ts`,
which switches on `NEXT_PUBLIC_APP_NAME` so the beta channel installs as a distinguishable app.

**Current shape.**

| Field | Value | Note |
|---|---|---|
| `name` | from `APP_NAME` | "Become", or "Become (beta)" on the beta channel |
| `short_name` | from `APP_SHORT_NAME` | Home-screen label |
| `description` | from `APP_DESCRIPTION` | |
| `start_url` | `/dashboard` | Installed app opens to the dashboard, not the landing page |
| `display` | `standalone` | |
| `orientation` | `portrait-primary` | |
| `background_color` | `#ffffff` | |
| `theme_color` | `#18181b` | Matches the dark viewport theme colour |
| `scope` | `/` | |
| `icons` | 72 to 512, `purpose: "maskable any"` | Sourced from `webapp/public/icons/` |
| `categories` | `fitness`, `health`, `lifestyle` | Keep listing categories aligned with these |
| `screenshots` | **empty array** | The gap |
| `prefer_related_applications` | `false` | Correct for a PWA |

**The one high-value fix.** `screenshots` is empty, so richer install UI never appears on Android and
some directories that read the manifest find nothing to show. Populating it from
`webapp/public/screenshots/v2/` is the highest-value install-surface change available.

Each entry needs `src`, `sizes`, `type`, and a `form_factor` of `narrow` for the mobile captures. The
v2 shots are 780x1688, which is 390x844 at 2x. Suggested set, in order: dashboard, workout-log,
nutrition-meal, generate. Light versions except workout-log, which is dark only.

**Description copy.** Written to survive truncation at roughly 120 characters on an Android install
sheet, so the first 100 characters carry the whole message.

```
✅ Coach-built training programs, food logged from a photo, mind sessions, and a weekly recap.
   Free today.
```

❌ "Become is the ultimate all-in-one fitness platform designed to help you transform..." Truncates
into nothing, and violates two constraints in one sentence.

**`short_name`.** Under 12 characters or iOS truncates the home-screen label. `Become` is 6. Do not
lengthen it.

---

## 2. Page metadata and social cards

**File.** `webapp/app/layout.tsx`.

**State today.** Thin. `title` is the raw env app name, `description` is the env tagline. There is a
`manifest` link, `appleWebApp` settings, a `viewport` export with per-scheme `themeColor`
(`#fafafa` light, `#18181b` dark), and an inline colour-scheme script. There is **no**
`metadataBase`, **no** canonical, **no** `openGraph` block, **no** Twitter card, and **no** OG image.

A shared link therefore renders as a bare URL, in every messaging app, on every directory that pulls
a preview, and for every crawler that reads a card.

**What belongs there.** This skill writes the copy; `seo-geo` owns landing the fields and the wider
technical set.

| Field | Copy | Count |
|---|---|---|
| `title` | `Become - coach-built training, food, and mind` | 45 |
| `description` | `Coach-built training programs, food logged from one photo of the plate, mind sessions, and a weekly recap. Free today, sign in with an email link.` | 148 |
| `openGraph.title` | `Become - a coach's plan, run by your phone` | 42 |
| `openGraph.description` | `Training, food, and mind in one app. Free today.` | 47 |
| `openGraph.image` | 1200x630, produced via `image-production` from a v2 capture | |
| `openGraph.image` alt | `The Become dashboard showing today's streak, mood, goal progress, and calories` | 78 |
| `twitter.card` | `summary_large_image` | |

OG descriptions truncate near 90 characters in mobile messaging previews, so the whole message goes
in the first 90.

---

## 3. Icons and splash screens

**Directory.** `webapp/public/icons/`.

Complete already: `icon-72` through `icon-512`, `apple-touch-icon.png`, `favicon-16x16.png`,
`favicon-32x32.png`, `icon.svg`, and eight `apple-splash-*` sizes.

No copy work here. If a size is missing for a directory's requirements, generate it with
`image-production` using `sharp`, which is already a `webapp` dependency. Do not add an image
dependency.

---

## 4. Install prompt

**State today.** There is no `beforeinstallprompt` handler anywhere in `webapp/`. Nothing prompts an
install. This is a missing surface, not a copy problem, and the copy below is what should go in it
when it is built.

**Timing rules** (owned by `signup-activation`, restated here because the copy depends on them):
never on first load; after the first earned win; one dismissal buys at least a week of silence; never
stacked with the notification permission ask in the same session.

**Copy, Chromium browsers with the install event:**

```
Add Become to your home screen

Opens full screen, no browser bar, and reminders can reach you.

[ Add to home screen ]   [ Not now ]
```

**Copy, iOS Safari, which has no install event and needs an instruction:**

```
Add Become to your home screen

Tap the Share button, then Add to Home Screen. It opens full screen, like an app.

[ Got it ]
```

Show the iOS variant only to iOS Safari. Showing a Share-button instruction to a Chrome user on
Android is the fastest way to look broken.

❌ "Install our app for a better experience!" Names no benefit and no action.
❌ "Don't miss out. Install now." Fake urgency and a nudge nobody would endorse.

---

## 5. Share sheet

**File.** `webapp/components/share/ShareButton.tsx`, and the public view at
`webapp/app/share/[shareId]/page.tsx`.

Share text must be legible in a group chat with no image, and it must be about the sender rather than
about the app.

```
❌ Check out this awesome fitness app! 💪
✅ My week in Become: four sessions, protein hit five days, streak at 12.
```

Two hard rules. Never render another user's data into a share artifact. Never let a share image show
a bug, an empty state, or "(beta)". The loop design belongs to `referral-program`.

A share link is an entry surface. The recipient should land on something better than the cold
homepage, and `/share/[shareId]` should not behave like `/`.

---

## 6. Channel leakage, the one thing that breaks everything

`webapp/lib/appChannel.ts` derives the channel from `NEXT_PUBLIC_APP_NAME` and renders
"Become (beta)" for the beta workspace. That string appears in the manifest name, the home-screen
label, and the document title on `become-beta.redbtn.io`.

Consequences:

- Never capture a screenshot from the beta channel for a listing.
- Never copy a title or description from a beta page into a listing field.
- Always verify a listing link resolves to `become.redbtn.io`.
- If a capture shows "(beta)" anywhere, it does not ship. Recapture via `screenshot-capture`.

---

## Checklist for any install-surface change

- [ ] The change is in the right file, and the manifest stays at `/manifest.json`.
- [ ] Copy survives truncation at the surface's real cut point (120 chars install sheet, 90 chars OG
      preview, 12 chars home-screen label).
- [ ] No "(beta)" anywhere.
- [ ] No pricing, tier, trial, count, rating, testimonial, or result claim.
- [ ] Icons and any new image were produced with `sharp` through `image-production`, with no new
      dependency added.
- [ ] Screenshots referenced exist in `webapp/public/screenshots/v2/` and are listed in its manifest.
- [ ] Light and dark both accounted for, since the app switches on `prefers-color-scheme`.
- [ ] Changes ship through the repo pipeline: feature branch, then `beta`, then `main`.

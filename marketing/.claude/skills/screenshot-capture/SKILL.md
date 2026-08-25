---
name: screenshot-capture
description: Captures new Become product screenshots through the documented dummy-account pipeline — Playwright at a 390x844 viewport at 2x device scale against become.redbtn.io, short-lived JWTs minted by webapp/tests/e2e/test-auth.ts, state seeded only through the app's own HTTP APIs, tutorial overlays dismissed, light and dark pairs, and a manifest entry recording page, account, state, seeding writes, and known issues. Use when the user says "we need a new screenshot," "capture the X screen," "the screenshots are stale," "get a shot of LIVE mode," "refresh the marketing images," "can we show the nutrition screen," or "do we have a picture of that." No real user account is ever captured, and no shot may ship showing a bug, an empty state, or "(beta)." For turning a capture into a finished asset see image-production or remotion-assets.
metadata:
  version: 1.0.0
  batch: production-pipelines
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Screenshot Capture

You are the capture operator for Become. Your goal is to land a shippable product screenshot: real app, real seeded state, dummy account, both themes, recorded in the manifest, with nothing in frame that we would be embarrassed to print.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce new `.webp` captures in `webapp/public/screenshots/v2/` plus the matching entry in
`webapp/public/screenshots/v2/manifest.json`, or prove that an existing capture already answers
the need. Done means: files on disk at 780px wide, a light and dark twin at the same scroll
offset, a manifest entry naming the page, account, state, and any DOM patch, and zero quality-bar
violations. A capture without a manifest entry is not finished work.

## When to use

- A campaign, listing, or landing section needs a screen that `v2/` does not have yet.
- An existing capture is stale because the screen shipped a redesign.
- A shot exists in light only, or dark only, and the surface needs the twin.
- Someone asks whether we have a picture of a given screen. Answer from `manifest.json`, not memory.

**Not this skill:** resizing, cropping, or framing an existing capture is `image-production`.
Rendering a designed or animated asset on top of a capture is `remotion-assets`. Choosing which
capture goes in a gallery is `web-app-listing`. Competitor screens are `inspo-library`.

## Process

### Assessment gate (do all four before opening Playwright)

1. **Read `webapp/public/screenshots/v2/manifest.json` first.** Fifteen shots already exist across
   eight screens. Check `shots[].page`, `shots[].notes`, and `knownIssues` before deciding a new
   run is needed. Reusing a shot costs nothing; a bad run writes to the production database.
2. **Name the screen and the state.** Not "the nutrition screen" but "`/dashboard/nutrition`,
   day view, calorie ring partially consumed, macro bars mid-range". State is the hard part; the
   route is trivial.
3. **Decide light, dark, or both.** Marketing surfaces almost always need both. If only one is
   requested, ask why, because a lone theme cannot be paired later without re-seeding.
4. **Pick the account.** `playwright-test-mobile1@become.test` (Alex Rivera) carries the seeded
   history every v2 shot used. Never a real member. Never `AUTH_TOKEN` from `test-auth.ts`, which
   points at a human's live account.

### Run recipe

5. Add or extend a spec in `webapp/tests/e2e/`. Model it on `app-shots.spec.ts` and
   `nutri-shots.spec.ts`: they import `authenticate`, `waitForAppScreen`, `dismissTutorials`,
   and `BASE_URL` from `webapp/tests/e2e/test-auth.ts` and loop a `[route, name]` list.
6. Add a project to `webapp/playwright.config.ts` with
   `viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true`
   and `colorScheme: 'light'` or `'dark'`. Run the two themes as two projects, not two tests, so
   a theme failure does not orphan its twin.
7. Seed state through the app's own HTTP APIs. See `references/seeding-playbook.md`.
8. Run it bounded, from `webapp/`:
   `timeout 900 npx playwright test --project=<name> --reporter=list`
9. Post-process to webp. See `references/capture-recipe.md` for the sharp snippet.
10. Append the manifest entry. Schema in `references/manifest-schema.md`.

Full command block, auth options, and the DPR arithmetic live in `references/capture-recipe.md`.
Read it before the first run of a session.

### Output buckets (pipeline-shaped, always these five, in this order)

- **Preflight checks** — what `manifest.json` already covers, which account, which routes, what
  state must be seeded, whether an existing shot makes the run unnecessary.
- **Commands to run** — every command, each wrapped in `timeout`, in execution order.
- **Outputs and where they land** — file paths, pixel dimensions, byte sizes.
- **Manifest entry to append** — the literal JSON object or objects, ready to paste.
- **Known failure modes** — which traps from `references/known-traps.md` apply to this screen.

## Frameworks

Four frameworks, in the order they bite during a real run.

### 1. Authentication without a leaked secret

**Check for:**
- Does `webapp/tests/e2e/test-auth.ts` already know this account's `userId`? If yes, use
  `signToken(userId, email)` or the exported `E2E_AUTH_TOKEN`. Nothing else is needed.
- Is `JWT_SECRET` present in `webapp/.env.local`? `test-auth.ts` throws without it.
- For a dummy account whose `userId` is not in the harness, use the server-minted path: create a
  `MagicLink` document for that address in the production database, then
  `POST /api/auth/verify-link` with that token so the **server** issues the JWT. The pattern is
  the same one the real login flow uses, so the token shape is guaranteed correct.

**Common issues:**
- *A token with no `exp` claim.* `AuthGuard` reads `(payload.exp ?? 0) * 1000`, treats it as
  expired, wipes localStorage, and bounces to `/login`. The run then screenshots a login page
  while looking authenticated. Always sign with an expiry; `test-auth.ts` uses `7d`.
- *Capturing the wrong account.* `AUTH_TOKEN` in `test-auth.ts` is a real human's account.
  Marketing captures must never use it.
- *Echoing the secret.* Never print `JWT_SECRET`, a minted token, a connection string, or a
  `MagicLink` token into a log, a report, a commit, or a manifest note.

**Strong patterns:**
- ❌ `console.log('token', token)` for debugging.
  ✅ `console.log('token minted, len', token.length)`.
- Prefer `E2E_AUTH_TOKEN` for exploratory walks; it points at `e2etest@become.io`, the account
  destructive fixtures are allowed to touch.
- Treat the magic-link path as a fallback for accounts the harness does not know, and delete the
  `MagicLink` document after use. It has a 15 minute TTL anyway.

### 2. Seeding state that looks like a real user

**Check for:**
- Does every tile on the target screen have data? A single zero row disqualifies the shot.
- Did every write go through an app HTTP API? Direct database writes are banned; they skip
  validation and produce states the app cannot actually reach.
- Is the state internally consistent across the twins? Light and dark must be the same day, the
  same scroll offset, the same carousel slide.

**Common issues:**
- *Day-one rendering.* `demo@jondonfit.com` has history roughly 615 days old, so `/api/progress`
  returns empty arrays and every screen looks like a fresh signup. That is why v2 did not use it.
- *Partially seeded screens.* Nutrition looks great, then the meal list below the fold is empty.
  Scroll the whole route before you decide the state is good.
- *Un-dismissed coach marks.* First-run overlays cover the exact control you are trying to show.
  `PUT /api/tutorial-progress` plus `dismissTutorials(page)` after every navigation.

**Strong patterns:**
- Seed once, capture both themes in the same session, on the same calendar day. The v2 dark twins
  were shot about 20 minutes after the light ones for exactly this reason.
- ❌ Seed 400 workouts to make the chart look impressive.
  ✅ Seed a plausible eleven, which is what `progress-*.webp` shows, and let the trend read honest.
- Drop noise before capturing: `POST /api/programs/abandon` on unused 0% enrolments so the hub
  does not show three half-started programs.

### 3. What makes a shippable capture

**Check for:**
- No empty state, no zero-value ring, no "no data yet" row, no greyed locked wall filling the frame.
- No "(beta)", no dev banner, no console error toast, no mid-animation blur, no loading skeleton.
- Twins match: same content, same scroll, same expanded or collapsed sections.

**Common issues:**
- *Mid-animation frames.* `waitForAppScreen` waits for text, not for motion to settle. Add a short
  explicit wait after it and before `page.screenshot`.
- *Auto-rotating carousels.* The Mind "Suggested Next" carousel advanced between the light and dark
  runs and had to be clicked back to slide 2 to match. Check any carousel on the screen.
- *Content that is true but ugly.* A one-point trend chart is honest and useless. Keep it out of
  frame rather than shipping a chart with a single dot.

**Strong patterns:**
- Frame to the fold deliberately. `progress-*.webp` deliberately excludes the single-point weight
  chart; the manifest note says so.
- ❌ Blur or crop out a broken element so the shot ships.
  ✅ Fix the bug or pick a different screen. The inspo library records a competitor blurring a
  label, and it read as "we shipped something we were not allowed to show".
- One shot, one claim. If the screen needs a caption to explain what is being shown, capture the
  narrower screen instead.

### 4. Disclosure when you touch the DOM

**Check for:**
- Did anything get patched at capture time (a colour, a `video.src`, a hidden element)?
- Is the underlying defect a real production bug, and is it filed?
- Does the manifest `knownIssues` entry name the exact file and line?

**Common issues:**
- *Silent patching.* A recoloured chart bar with no note turns into a marketing asset nobody can
  reproduce, and the bug never gets fixed.
- *Patching to hide, not to reveal.* Recolouring an invisible bar so the real data reads is
  disclosure-and-ship. Deleting an error banner is falsification. The line is whether the patch
  changes what the product actually did.
- *Filing nothing.* Every patch implies a bug. `manifest.json` currently carries four
  `knownIssues` entries — the `.mov` MIME type, the weight/mood "today" stamp, the `progress-dark`
  bar fill, and the Generate-sheet range slider. All four are real production defects. Two carry an
  `impactOnCapture` note because the DOM was patched at capture time (the `.mov` source and the
  `progress-dark` bars); the other two were captured as-is and are recorded anyway.

**Strong patterns:**
- ❌ Patch the DOM, ship the shot, move on.
  ✅ Patch, record `where` / `issue` / `impactOnCapture` in `knownIssues`, and open a bug.
- Prefer fixing the app when the fix is a one-line dark-mode variant. A fixed bug means the next
  capture needs no patch at all.
- Keep the patch minimal and say so: "the six rendered bar rects were recoloured; no other element
  was touched" is the standard the existing manifest sets.

## Become-specific rules

- **Production is the target.** `baseURL` defaults to `https://become.redbtn.io`. Both the
  production and beta channels share one MongoDB, so a beta URL is not a sandbox. **Every write is
  a production write.** Only dummy accounts, ever.
- **Known accounts.** `playwright-test-mobile1@become.test` (Alex Rivera, the v2 workhorse),
  `e2etest@become.io` (the dedicated e2e account), `demo@jondonfit.com` (Jordan Blake, history too
  old to be useful). Names may be written down. Tokens may not.
- **Never expose a token.** Refer to `JWT_SECRET` from `webapp/.env.local` by name only.
- **Geometry is fixed:** 390x844 CSS at `deviceScaleFactor: 2` gives 780x1688 raw. Ship at 780
  wide. Never upscale; if you need larger, raise the device scale factor and recapture.
- **Both themes ship together.** The app follows `prefers-color-scheme`, so `colorScheme` in the
  Playwright project is the whole switch.
- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today and
  no pricing exists. Never invent a price, a tier, a trial length, or a discount.
- **Product screenshots come only from dummy accounts via this pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or "(beta)".
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline theme.**
  Its dashboard summary row appears in `dashboard-*.webp`; that is enough.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or pound
  counts, no body-shaming, no before/after framing that implies a guaranteed outcome. A seeded
  weight number in a capture is state, not a claim, and copy must not turn it into one.
- **Assets are reused, not regenerated.** Check the manifest before every run.
- Every command is bounded with `timeout`. Never write an unbounded wait loop around a spec run.

## Quality bar

Run this list against the files before reporting, and state the result of each.

- [ ] `manifest.json` was read first and the reuse question was answered explicitly.
- [ ] Account used is a dummy account. `AUTH_TOKEN` (a real member) was not used.
- [ ] No token, secret, or connection string appears in any file, log line, or report.
- [ ] Output is 780px wide `.webp`, and file size is in the 40 to 95 KB band the existing set sits in.
- [ ] Light and dark twins exist, at the same scroll offset, with the same content.
- [ ] No empty state, zero row, loading skeleton, "(beta)", dev banner, or mid-animation frame.
- [ ] Any DOM patch is recorded in `knownIssues` with file and line, and the bug is filed.
- [ ] A manifest entry exists for every new file, with `page`, `account`, `theme`, `width`,
      `height`, and a `notes` line describing the state.
- [ ] `seeding.writes` lists every API call made, and every one is an app HTTP endpoint.
- [ ] Nothing was written to a real member's account.

## Related skills

| Skill | Use it when |
|---|---|
| `image-production` | The capture needs resizing, cropping, framing, or export to a platform spec |
| `remotion-assets` | The capture becomes a designed or animated campaign asset |
| `web-app-listing` | Choosing and ordering captures for a directory gallery |
| `landing-cro` | The capture is going into `webapp/components/landing/` |
| `content-calendar` | A scheduled post depends on a capture that does not exist yet |
| `launch-campaign` | The readiness gate requires captures of a shipping feature |

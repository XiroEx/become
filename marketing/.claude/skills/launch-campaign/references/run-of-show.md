# Run of Show, T-14 to T+7

Adapt to the real date. Every row carries an **owner** and an **asset**. A row without both will
not happen.

Status values: `not started` / `in progress` / `blocked` / `done`.

---

## T-14 to T-11 — Decide and gate

| Day | Channel | Action | Owner | Asset | Status |
|---|---|---|---|---|---|
| T-14 | Internal | Run the full readiness gate. Verdict GREEN, AMBER, or RED | | `references/readiness-gate.md` | |
| T-14 | Internal | Lock: date, audience, primary metric, two guardrails, one-sentence claim, single CTA | | Decisions doc | |
| T-13 | Internal | Record the **baseline** for the primary metric | | `analytics-tracking` | |
| T-13 | Internal | Confirm Jon is in, and what he is posting | | Verbal or message | |
| T-12 | Assets | Audit what already exists in `webapp/public/screenshots/v2/` and `marketing/out/` | | Manifests | |
| T-11 | Assets | Commission only what is genuinely missing | | `screenshot-capture`, `remotion-assets` | |

**If the gate is RED, stop here.** Everything below assumes a real date.

---

## T-10 to T-8 — Produce

| Day | Channel | Action | Owner | Asset | Status |
|---|---|---|---|---|---|
| T-10 | Assets | Capture run: new shots, light and dark twins, dummy account only | | `screenshot-capture` | |
| T-10 | Assets | Append the manifest entry, including any `knownIssues` disclosure | | `manifest.json` | |
| T-9 | Copy | Landing page section or update for the feature | | `copywriting`, `landing-cro` | |
| T-9 | Copy | Announcement email: subject, preview, body, suppression rule | | `email-lifecycle` | |
| T-8 | Assets | Render social assets from the Remotion project | | `remotion-assets` | |
| T-8 | Copy | Social posts for the Become handle, and a brief for Jon's | | `reels-scripts`, `coach-brand-voice` | |

**Capture and render at T-10, never at T-1.** A full render is long, and the capture pipeline has
real traps: single-point trend charts because weight and mood cannot be backdated, a hardcoded
dark bar fill that vanishes on the dark card, exercise demos rendering as a black panel in Chromium
(a `type="video/quicktime"` bug in `FramedVideo.tsx`, so capture on iOS or Safari), carousels
auto-rotating out of sync with their twin.

---

## T-7 to T-4 — Freeze and stage

| Day | Channel | Action | Owner | Asset | Status |
|---|---|---|---|---|---|
| T-7 | Internal | **Asset freeze.** Anything not agreed today is out of this launch | | Manifest | |
| T-7 | Rented | Directory and Product Hunt submissions prepared, not submitted | | `web-app-listing` | |
| T-6 | Borrowed | Creator briefs sent, with rights, disclosure, and the do-not-say list | | `ugc-creator-briefs` | |
| T-5 | Copy | Sceptical FAQ written: how it works, what it gets wrong, is my data private, is it really free | | Support doc | |
| T-5 | Owned | Push copy written, and the slot rule confirmed | | `push-notifications` | |
| T-4 | Internal | UTM links minted for every outbound placement | | `analytics-tracking` | |

---

## T-3 to T-1 — Rehearse

| Day | Channel | Action | Owner | Asset | Status |
|---|---|---|---|---|---|
| T-3 | Internal | End-to-end test on a phone: land, sign up with a fresh dummy address, receive the magic link, use the feature | | Live production | |
| T-3 | Internal | Verify the feature in **both** light and dark, once more, on production | | Live production | |
| T-2 | Owned | Email staged, suppression query written and tested against a dummy account | | `email-lifecycle` | |
| T-2 | Rented | Posts staged with assets attached | | Scheduler | |
| T-1 | Internal | Block launch-day reply hours in the owner's calendar | | Calendar | |
| T-1 | Internal | Final constraint pass over every asset: no "(beta)", no empty state, no invented claim | | Section 6 of the gate | |

**Never test the announcement email against live member addresses.** Beta and production share
one database, so a beta-triggered send reaches real people. Dummy account only.

---

## T-day — Ship, then reply

| Time (local) | Tier | Action | Owner | Asset | Status |
|---|---|---|---|---|---|
| 07:00 | Owned | Landing live, in-app surface live | | Landing | |
| 07:30 | Owned | Email send begins, **ramped in batches**, feature-users suppressed | | Email | |
| 09:00 | Owned | One push, suppressed for anyone already nudged today | | Push | |
| 10:00 | Rented | Become handle post, Jon's post, directory submissions go live | | Social, listings | |
| 10:00-18:00 | Human | **Reply to every comment and DM.** This is the highest-value block of the day | | | |
| All day | Borrowed | Creator posts land, community threads, whatever was actually secured | | | |
| 18:00 | Internal | Snapshot the primary metric and the two guardrails | | Dashboard | |

**Launch day contains no production work.** If an asset is being made on launch day, T-7 failed.

---

## T+1 to T+7 — The second wave

The launch does not end at 6pm on day one. The second wave is usually where the durable signups
come from, because the day-one post reached people who were not ready and the week-one content
reaches them again with proof.

| Day | Channel | Action | Owner | Asset | Status |
|---|---|---|---|---|---|
| T+1 | Rented | Behind the scenes: how we built it, what we got wrong first | | `reels-scripts` | |
| T+2 | Rented | The mechanism explainer, deeper than day one | | `reels-scripts` | |
| T+3 | Owned | Answer the most-asked launch-day question, publicly | | Post or email | |
| T+4 | Rented | Reshare the best creator or member post, with permission | | `ugc-creator-briefs` | |
| T+7 | Internal | **Post-launch review.** Scheduled at T-14, owner named | | Template below | |

---

## Post-launch review template

Fill this at T+7. It is the reason the launch was worth planning.

**1. Numbers**

| Metric | Baseline (T-13) | T+7 | Delta |
|---|---|---|---|
| Primary metric | | | |
| Guardrail 1 | | | |
| Guardrail 2 | | | |
| Signups | | | |
| Feature usage among existing members | | | |

**2. Channel contribution**

| Tier | Predicted | Actual | Read |
|---|---|---|---|
| Owned | | | |
| Rented | | | |
| Borrowed | | | |

**3. Three questions, answered in one sentence each**
- What worked that we should make standard?
- What did not work, and was it the channel, the creative, or the timing?
- What did the readiness gate catch, and what did it miss?

**4. The asset library**
Which assets are reusable beyond this launch, and where they live. Note that `marketing/out/` is
gitignored, so anything that must survive gets reported by path and preserved deliberately.

**5. One decision**
The single change to make before the next launch. One. A list of twelve is a list of zero.

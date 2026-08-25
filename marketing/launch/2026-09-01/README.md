# Become public launch - Tue 2026-09-01 - read this first

**Verdict: READY-WITH-CUTS.** 9/1 is achievable at the plan's scope *as amended at the 8/25
readiness review* (cuts and reconciliations listed in `content-calendar.md` §2 R-9..R-14 and the
edits marked "8/25 review" across the folder). Four blockers remain, all human, all this week.

## The plan in 20 lines

1. This is a visibility launch, not a deploy: the app has been live for months; 9/1 is the first coordinated announcement.
2. One claim: coach-built programs, set-by-set logging, a photo of your plate, a weekly recap. One CTA: `become.redbtn.io`. Free today.
3. Jon's warm audience is the launch (predicted 85% of signups); the brand handle is a credibility surface, not distribution.
4. Channels: Jon's IG `@jondon275`, a new brand IG + TikTok (one handle string, George claims in-form today), 3 directory submissions on 9/1. No email (compliance gate), no Product Hunt (deferred 10/6), no Reddit, no paid, no creators.
5. Owned tier = one push at members' local 12:00-14:00 (`lifecycle.md` §2 owns copy + runbook), gated on a guard shipping Thu; ungated = no send.
6. Target: 25 signups Tue 9/1–Mon 9/7, rebased off Jon's real reach (under 500 followers → 10; over 5,000 → 60). Baseline recorded Wed 8/26, review Tue 9/8 10:00.
7. All launch stills already exist: rendered + truth-passed Tue 8/25 in this worktree's `marketing/out/` (`assets-manifest.md`); post only from there, never from the main checkout (stale files live there).
8. One film batch, Sat 8/29 09:00–13:00: Jon x5 (HERO, CA-01 missed sessions, CA-02 starting weight, CA-03 soreness, BTS) + story pickup; George x4 screen recordings on iOS/Safari only.
9. Scripts: `reels-pack.md` (shot lists) + `captions-week1.md` (captions, source of record) + `carousels.md` (deck mechanics). Where they disagreed, `content-calendar.md` §2 is binding.
10. Grid seeds Sun 8/30 (6 squares, no launch announcement); launch day: Jon story 09:30 → HERO 10:00 → brand HERO-B 10:05 → directories 10:30/11:00 → push 12:30 → Jon DMs his 15 warm clients 13:00 → WIW-01 16:00.
11. Launch day contains zero production work; asset freeze Fri 8/28 09:00, go/no-go Fri 15:00, `main` freezes Mon 8/31 15:00.
12. Sanctioned code (complete list): push guard, Umami tag, F1 verify-handoff copy, F2a notification-prompt gate, `listings.md` DEV-1..6 metadata/OG branch (merged Mon 8/31 - otherwise every shared link unfurls as a bare URL).
13. Truth rails: no counts, results, pricing beyond "free today", testimonials, or invented programs; LIVE mode logs - the camera never counts reps; 39 of 132 exercises have demo clips, never "every"; The Becoming appears exactly once (`C-24`, Mon 9/7).
14. Jon sign-off queue (Sun 8/30, voice notes): C-09, C-10, C-15, C-18, C-23, his bio, the DM opener; plus Wed: are "30-Day Shred" / "Build serious muscle" real program names (O-5) - until yes, every workout-hub crop stays above the Recommended row.
15. Cuts made for capacity: robots/sitemap (D6) cut to week of 9/8; Umami moved to Wed; Sat rough cuts trimmed to HERO only; YouTube Shorts and X already cut; carousels deck 1 held for week 3.
16. Fallback ladder: batch collapses → one HERO take Sun on Jon's phone, everything else becomes carousels from committed captures. Guard misses → no push. Renders fail → post v2 captures. Cold signup fails tonight → date moves to 9/8 (costs nothing, nothing announced).
17. Measurement: Mongo counts (Wed baseline) + Umami referrers + UTMs minted Fri into `measurement.md` (George creates that file Wed 09:00).
18. Post-launch: T+7 review Tue 9/8 (template pre-filled in `launch-plan.md` §12), then the unsubscribe build + `/api/track`, then PH 10/6.
19. Guardrails that stop the launch: any magic-link failure report (fix before posting anything else); net push-subscription loss beyond pruning.
20. If the site goes down: Jon stops posting immediately; traffic at a broken landing is worse than none.

## Gate table (post-review, Tue 8/25 evening)

| Item | State | Turns green |
|---|---|---|
| 1.2/1.5/1.6 phone pass + cold signup on production | **RED - decides the date** | Tue 8/25 22:00 (George) |
| 3.3/3.4 signup + magic link end to end | **RED - decides the date** | Tue 8/25 22:00 (George) |
| 5.3 Jon has the plan, says yes, sends reach numbers + list of 15 | **RED** | Tue 8/25 (Jon) |
| Handles claimed (availability unverifiable by HTTP) | **RED** | Tue 8/25 22:00 (George) |
| 4.1/4.4 baseline + push-subscription count | **RED** | Wed 8/26 09:00 (no-slip) |
| 2.7/2.8/2.9 renders + video truth pass | **GREEN** (closed 8/25) | done; O-5 names Wed, F3/F6 Fri |
| V1–V4 pre-batch product checks (recap line, generate POST, plate path, program names) | **AMBER** | Wed 8/26 (George + Jon) |
| Push guard merged + deployed | **AMBER** | Thu 8/27; kill push if not by Fri 09:00 |
| 5.2 FAQ (drafted in `launch-day-copy.md`) | **AMBER** | Thu 8/27 14:00 George signs |
| 2.3 light LIVE capture | **AMBER** | Fri 8/28: shoot or cut (cut is fine) |
| 4.3 UTMs minted into `measurement.md` | **AMBER** | Fri 8/28 13:00 |
| DEV metadata/OG branch (link previews) | **AMBER** | Mon 8/31 before 15:00 freeze |
| 5.1 reply hours blocked | **AMBER** | Mon 8/31 09:00 |
| Sat 8/29 film batch | **AMBER** | Sat 8/29 13:00 |

**The one thing most likely to slip:** the Saturday film batch - it is the only 4-hour block, it
has a single human point of failure (Jon), and 6 of the week's 11 assets come out of it. The
fallback (one HERO take Sunday, stills carry the rest) keeps the date but halves the launch.
Second most likely: George's Fri 8/28, the heaviest day (~5h: freeze, constraint pass, listings
staging, UTMs, OG render, F2a, F3/F6, go/no-go) - protect it by finishing Thursday's list Thursday.

## TODAY (Tue 8/25 → Wed 8/26), in priority order

**George**
1. Hand `jon-checklist.md` to Jon; get yes/no on the date by 18:00. Nothing else matters first.
2. Phone pass on production (both themes) + one cold signup on a fresh address, by 20:00. Failure = move to 9/8 tonight.
3. Claim the handles in-form (top candidate `becomeapp.fit`, same string on both platforms), by 22:00.
4. Delete the five stale renders in the main checkout's `marketing/out/` so nobody grabs one by name.
5. Wed 09:00: create `measurement.md` - baseline aggregation, push-subscription count (<15 kills the push), gate log. Does not slip.
6. Wed: V1–V4 checks, failure-case tests, fill both profiles, durable-copy the frozen asset set, Umami (moved here), F3/F6 prep.

**Jon**
1. Text George yes or no on Sept 1 (2 min).
2. Send real Instagram numbers: followers, reach, last-10 reel views, story views; confirm the exact handle (10 min).
3. Write the list of 15 warm clients in your own notes (15 min). Eight is acceptable; zero is not.
4. Block Sat 8/29 9:00–11:30 (your on-camera block) in your phone now.
5. Wed: answer one question - are "30-Day Shred" and "Build serious muscle" the real names of live programs?

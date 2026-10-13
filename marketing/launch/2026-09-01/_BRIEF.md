# Launch brief — fixed facts (orchestrator-provided, 2026-08-25)

NOT FOR COMMIT-POLISH — working input for the launch-plan agents. Do not contradict these.

- **Ship day: Tuesday 2026-09-01** (7 days from today, Tuesday 2026-08-25). "Ship" = public launch
  moment for Become (the app is already live at become.redbtn.io; this is the announcement/visibility
  launch, not a deploy).
- **Social presence today: ZERO.** No brand accounts exist. Jon Don has a personal Instagram
  (@jondon275 known handle family; exact follower count UNKNOWN — the plan must treat his warm
  audience as the #1 channel and assign George/Jon to confirm reach on Day 1).
- **Capacity: one builder (George) + Jon + agents.** The 90-day-template overload lesson applies
  ruled-in: cut lines, do not compress. Every human task needs an owner and a day.
- **Users today: ~60 accounts** (as of 8/12). Every user signed up by email (magic link) — but the
  email-lifecycle skill's compliance gate BLOCKS non-transactional email until unsubscribe
  infrastructure exists (no route/store/header in the codebase). The plan either (a) scopes a minimal
  unsubscribe route + List-Unsubscribe headers as a dev task THIS WEEK with George as owner, or
  (b) uses push + in-app only for existing users. Do not plan a marketing email send that the gate
  forbids.
- **Web push exists** and is usable for existing users (respect the push skill's rules).
- **Cloudflare AI-crawler blocking was lifted 8/25** (managed robots.txt off, Block-AI-bots off).
  The repo still ships no robots.ts/sitemap/llms.txt. SEO/GEO content is explicitly OUT of launch-week
  scope (domain decision pending) — only the technical basics may appear as optional dev tasks.
- **Asset inventory that EXISTS today** (local renders, gitignored; paths relative to marketing/):
  out/become-{social-square,story-poster,open-graph}.png, out/become-reel.mp4,
  out/collection/{square×16,story×15,landscape×15} (NOTE: rendered BEFORE the 8/25 truth pass —
  7 rows of campaigns.json changed; a re-render is owed and is part of this launch work),
  out/videos/×19 + out/videos-reviewed/×19 (6s/8s vertical spots),
  webapp/public/screenshots/v2/ (15 themed product captures + manifest.json).
- **Hard constraints (non-negotiable, from become-context):** no fabricated testimonials/counts/
  results/pricing; screenshots only from dummy accounts; no camera-roll photos of Jon (filmed-for-
  purpose content is fine and REQUIRED); The Becoming ≤ one mention; responsible fitness claims;
  LIVE mode = live set logging (the camera does NOT count reps — never claim it); demo clips on 39
  of 132 exercises, never "every"; app is free, no pricing exists, never invent any.
- **Honest framing the plan must carry:** 7 days from zero ≠ audience building. The goals are:
  (1) surfaces exist and look alive on 9/1 (accounts, pinned content, listings),
  (2) Jon's warm audience is activated,
  (3) the content flywheel is running (batch filmed, calendar loaded ≥2 weeks),
  (4) launch day has a coordinated moment (posts + directories + push + landing),
  (5) measurement exists at least minimally.
- Deliverables live in marketing/launch/2026-09-01/ (this folder), committed to the repo.

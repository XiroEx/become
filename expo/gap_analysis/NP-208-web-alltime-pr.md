# NP-208 — Web: Show the All-Time Personal Record on the Workout Summary

- **Ticket:** NP-208
- **Board Ref:** [NP-208](https://board.redbtn.io/b/6a70c4ea2fff468f8e253a89?card=6abb12572379586ae015c730) (filed against NP-028's decision card pending its own board card)
- **Wave:** 0
- **Store v1:** yes
- **Size:** S
- **Priority:** P1
- **Story / Cluster:** Training parity audit: browse, programs, enrolment and the live workout
- **Origin:** Decision card NP-028 ("Decide four training rules for v1: PR meaning, kg labels, the rest alert, Track and Live")
- **Stakeholder decision (Jon Don, 2026-10-13):**
  > "yes the PR is a personal record for all time."

## Summary & Objective

Today the webapp summary's "new personal record" flag compares the just-finished set against the member's **previous session only** (`webapp/components/WorkoutSummary.tsx:106-120`). The server already computes an **all-time** PR (`newPRsAchieved`), but no web screen reads it. Jon decided the summary's "new personal record" means the all-time record, not a session-over-session beat.

This ticket changes the web summary to read and display the server's all-time `newPRsAchieved` instead of (or in addition to, if a "beat last time" line is still wanted elsewhere) its own session-only comparison, so the rule the web ships is the same rule the native port (NP-086) copies.

**This is the web change that must land before the native port starts**, per NP-028's "a change the web must make first is carded on the web before the native port starts." NP-086 (native workout summary) and NP-080 (native live view PR line) depend on this ticket's outcome, not the other way around.

## Rules That Travel (both apps must agree)

1. "New personal record" means **all-time**, matching the server's `newPRsAchieved` for the relevant exercise/metric — never a session-only comparison.
2. The web summary (`WorkoutSummary.tsx`) is the reference implementation; native (`expo/components/live/WorkoutSummary.tsx`, NP-086) copies its rule exactly once this ships.
3. No new "session PR" concept survives in the shipped UI language the member sees as "new personal record" — if the product still wants a "better than last time" signal, it must be labelled differently from "PR" so the two apps cannot say different things about what a PR is.

## Acceptance Criteria

- [ ] (id: np208-record) The summary's "new personal record" flag is driven by the server's all-time `newPRsAchieved`, not a session-over-session comparison
- [ ] (id: np208-single-rule) `webapp/components/WorkoutSummary.tsx:106-120`'s session-only compare is removed or no longer drives the "new personal record" label
- [ ] (id: np208-tests) A webapp unit/contract test asserts a member whose current set beats an earlier (non-adjacent) session, but not the literal previous one, still sees "new personal record"

# NP-209 — Server and Web: Unit-Aware Set Weight Storage (kg Throughout)

- **Ticket:** NP-209
- **Board Ref:** [NP-209](https://board.redbtn.io/b/6a70c4ea2fff468f8e253a89?card=6abb12572379586ae015c730) (filed against NP-028's decision card pending its own board card)
- **Wave:** 0
- **Store v1:** yes
- **Size:** M
- **Priority:** P1
- **Story / Cluster:** Training parity audit: browse, programs, enrolment and the live workout
- **Origin:** Decision card NP-028 ("Decide four training rules for v1: PR meaning, kg labels, the rest alert, Track and Live")
- **Stakeholder decision (Jon Don, 2026-10-13):**
  > "the KG members should be able to use KG throughout the whole app. yes you should be asked if you dont pick 'lb or Kg' which one you want to do."

## Summary & Objective

Today every lifting load the web shows is labelled lbs, kilogram members included (`webapp/lib/workout/dumbbellWeight.ts:89-94`), and native's `expo/lib/live/bellStyle.ts` copies the same lb-only labelling. Jon decided kg members must see kg **throughout the whole app** — not just a display-side relabel, because the server decision on how set weights are stored has to land first (converting on read everywhere is fragile and compounds rounding error; the canonical storage unit vs. display unit has to be picked once).

This ticket is the **web/server change that must land before the native port starts**, per NP-028's "a change the web must make first is carded on the web before the native port starts." NP-080 (native tracking inputs) and NP-084 (native equipment-aware weight logging) depend on this ticket's outcome.

## Scope

1. **Server decision on storage:** pick one canonical unit for a logged set's weight (recommend storing the raw number plus the unit it was entered in, or always normalizing to one canonical unit on write — a server-side decision this ticket records once made) so conversion is never ambiguous.
2. **Member unit preference:** a member who has not explicitly chosen lb or kg is asked which they want (Jon: "yes you should be asked if you dont pick 'lb or Kg'"). This preference, once set, governs every lifting-load label and input across the web app — not only the dumbbell/kettlebell copy in `dumbbellWeight.ts`, but every weight input and display in the live workout, history and summaries.
3. **Web ships first:** `webapp/lib/workout/dumbbellWeight.ts` and any other lb-only lifting-load copy change to read the member's unit preference and the server's stored/converted value before the native equivalents (`expo/lib/live/bellStyle.ts`, NP-084; native tracking inputs, NP-080) port the same rule.

## Rules That Travel (both apps must agree)

1. A kg member sees kg on every lifting load, everywhere in the app — not lbs with a kg subtitle, and not lbs alone.
2. A member who has not chosen lb or kg is asked, once, which unit they want; the choice is stored and read by both apps.
3. Native (`bellStyle.ts` / NP-084, tracking inputs / NP-080) copies the web's unit-and-storage rule exactly once this ships — it does not invent its own conversion.

## Acceptance Criteria

- [ ] (id: np209-storage) The server's decision on how a set's weight is stored (raw + unit, or normalized) is recorded here once made, with the migration path for existing sets
- [ ] (id: np209-ask) A member with no stored lb/kg preference is asked to choose on first relevant screen; the choice persists and is read by `dumbbellWeight.ts` and every other lifting-load display
- [ ] (id: np209-kg-everywhere) A kg member sees kg (not lbs) on every lifting load in the web app: live workout, history, summaries and dumbbell/kettlebell labels
- [ ] (id: np209-web-first) This lands on the web before NP-080/NP-084 port the same rule natively

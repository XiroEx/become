# VENDORED: @redbtn/redtutorial v0.1.0

This is a vendored mirror of `@redbtn/redtutorial` (`src/` of
https://github.com/redbtn-io/redtutorial @ v0.1.0), inlined so the Become
build succeeds before the package is published to registry.redbtn.io.

**Do not hand-edit these files** — change them upstream in redbtn-io/redtutorial
and re-mirror.

## Follow-up (publish-then-swap)

Once `@redbtn/redtutorial` is published:

1. `npm install @redbtn/redtutorial` in `webapp/`
2. Replace imports of `@/lib/redtutorial` with `@redbtn/redtutorial`
   (currently: `components/tutorial/TutorialRoot.tsx`, `lib/tutorials/becomeTour.ts`,
   `app/api/tutorial-progress/route.ts` — types only)
3. Delete this directory.

Local-only deltas vs the package source: `'use client'` banners on
`react/TutorialProvider.tsx` and `react/TutorialOverlay.tsx` (Next app router).

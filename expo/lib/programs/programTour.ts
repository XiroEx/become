/**
 * THE "DESIGN YOUR OWN PROGRAM" TIP TOUR (NP-330).
 *
 * Native counterpart of the `programs-new` segment in
 * `webapp/lib/tutorials/sections/programs.ts`: on the web, landing on
 * `/dashboard/programs/new` auto-starts an 8-step onboarding tour (a centered
 * modal with dots, "Walk me through it" on step 1) that walks the three-step
 * builder before the member ever touches it. Native has no DOM to anchor a
 * spotlight overlay to (the interactive tour itself stays NP-164), but the
 * COPY is not web-only content — reusing it here keeps the one button
 * native's empty state offers ("Walk me through it") doing what its name
 * says instead of skipping straight to the builder.
 *
 * The step order and every word of `title`/`body` are copied verbatim from
 * the matching `id` in `webapp/lib/tutorials/sections/programs.ts`'s
 * `programs-new` segment so the two never drift in meaning, only in whether
 * a real element is spotlighted. `nextLabel` is also copied for step 1 (the
 * web's own `nextLabel: 'Walk me through it'`); the last step's label is
 * native-specific — tapping it is what actually opens the builder.
 */

export interface ProgramTourStep {
  title: string;
  body: string;
  nextLabel: string;
}

export const PROGRAM_TOUR_STEPS: readonly ProgramTourStep[] = [
  {
    title: "Design your own program",
    body: "Pick the exercises, prescribe the sets and reps, and structure it in phases — then follow it with the same live workout view as coach-built programs.",
    nextLabel: "Walk me through it",
  },
  {
    title: "Three steps",
    body: "Basics, Phases & Workouts, then Review & Save. Completed steps turn green, and you can tap a pill to jump back.",
    nextLabel: "Next",
  },
  {
    title: "Name and goal",
    body: "The two required fields. A short description helps future-you remember what this program is for.",
    nextLabel: "Next",
  },
  {
    title: "Duration & schedule",
    body: "Set how many weeks it runs and how many days per week you train — days per week decides how many workouts each phase holds.",
    nextLabel: "Next",
  },
  {
    title: "Audience & equipment",
    body: "Tag the experience level and the equipment it needs, so the program’s requirements are clear at a glance.",
    nextLabel: "Next",
  },
  {
    title: "Phases & workouts",
    body: "Phases are blocks of weeks, each phase holds one workout per training day, and each workout holds its exercises.",
    nextLabel: "Next",
  },
  {
    title: "Moving through",
    body: "Next unlocks once the required fields on the current step are filled — fill as you go and it never blocks you for long.",
    nextLabel: "Next",
  },
  {
    title: "Drafts & saving",
    body: "Your draft autosaves on this device as you type. A floating button saves the finished program from any step.",
    nextLabel: "Start building",
  },
];

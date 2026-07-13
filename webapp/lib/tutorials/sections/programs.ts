import type { TutorialSection } from './types'

// Programs section — the custom-program surface, shown in pieces per route:
//
//   programs-mine  /dashboard/programs/mine          — your built programs
//   programs-new   /dashboard/programs/new           — the 3-step creator
//   programs-edit  /dashboard/programs/[id]/edit     — deep-dive on the builder
//                                                      (phases → workouts → exercises)
//
// The creator/editor (ProgramCreator) is a wizard: step 2 (Phases & Workouts)
// isn't in the DOM on page load, so the NEW segment coaches what's visible on
// step 1 plus the wizard chrome, and the EDIT segment does the hands-on walk —
// in edit mode the loaded program is already valid, so the "Phases & Workouts"
// pill is unlocked immediately and the tour can invite a real click
// (advanceOn: click), then spotlight Add Phase / workout tabs / exercises.
//
// /programs/new is entitlement-gated (custom-programs → upgrade pitch instead
// of the builder). Every anchored step there carries a short waitFor timeout so
// locked users get the intro modal and the rest skips fast + invisibly
// (the overlay renders nothing while a step is waiting).
export const programsSection: TutorialSection = {
  steps: [
    // ── /dashboard/programs/mine ─────────────────────────────────────────────
    {
      id: 'programs-mine-intro',
      // No target → centered modal; this route has no entitlement gate.
      title: 'My Programs',
      body: 'Every training program you build yourself lives here — create them, refine them, and enroll when you are ready to run one.',
      nextLabel: 'Show me',
    },
    {
      id: 'programs-mine-list',
      target: '[data-tour="programs-list"]',
      title: 'Your programs',
      body: 'Each card is one of your programs. Enroll starts training with it, Edit reopens the builder, Delete removes it for good.',
    },
    {
      id: 'programs-mine-create',
      target: '[data-tour="programs-create"]',
      title: 'Build a new one',
      body: 'Start a program from scratch — a three-step builder walks you through basics, phases and workouts, then review.',
      placement: 'bottom',
    },

    // ── /dashboard/programs/new — the creator wizard ─────────────────────────
    {
      id: 'programs-new-intro',
      title: 'Design your own program',
      body: 'Pick the exercises, prescribe the sets and reps, and structure it in phases — then follow it with the same live workout view as coach-built programs.',
      nextLabel: 'Walk me through it',
    },
    {
      id: 'programs-new-steps',
      target: '[data-tour="program-steps"]',
      waitFor: { selector: '[data-tour="program-steps"]', timeoutMs: 2500 },
      title: 'Three steps',
      body: 'Basics, Phases & Workouts, then Review & Save. Completed steps turn green, and you can tap a pill to jump back.',
      placement: 'bottom',
    },
    {
      id: 'programs-new-basics',
      target: '[data-tour="program-basics"]',
      waitFor: { selector: '[data-tour="program-basics"]', timeoutMs: 2500 },
      title: 'Name and goal',
      body: 'The two required fields. A short description helps future-you remember what this program is for.',
      placement: 'bottom',
    },
    {
      id: 'programs-new-schedule',
      target: '[data-tour="program-schedule"]',
      waitFor: { selector: '[data-tour="program-schedule"]', timeoutMs: 2500 },
      title: 'Duration & schedule',
      body: 'Set how many weeks it runs and how many days per week you train — days per week decides how many workouts each phase holds.',
      placement: 'bottom',
    },
    {
      id: 'programs-new-equipment',
      target: '[data-tour="program-equipment"]',
      waitFor: { selector: '[data-tour="program-equipment"]', timeoutMs: 2500 },
      title: 'Audience & equipment',
      body: 'Tag the experience level (above) and the equipment it needs, so the program’s requirements are clear at a glance.',
      placement: 'top',
    },
    {
      id: 'programs-new-phases',
      target: '[data-tour="program-step-phases"]',
      waitFor: { selector: '[data-tour="program-step-phases"]', timeoutMs: 2500 },
      title: 'Phases & workouts',
      body: 'Step 2 is the heart of the builder: phases are blocks of weeks, each phase holds one workout per training day, and each workout holds its exercises.',
      placement: 'bottom',
    },
    {
      id: 'programs-new-nav',
      target: '[data-tour="program-wizard-nav"]',
      waitFor: { selector: '[data-tour="program-wizard-nav"]', timeoutMs: 2500 },
      title: 'Moving through',
      body: 'Next unlocks once the required fields on the current step are filled — fill as you go and it never blocks you for long.',
      placement: 'top',
    },
    {
      id: 'programs-new-save',
      target: '[data-tour="program-save"]',
      waitFor: { selector: '[data-tour="program-save"]', timeoutMs: 2500 },
      title: 'Drafts & saving',
      body: 'Your draft autosaves on this device as you type. This floating button saves the finished program from any step.',
      placement: 'top',
    },

    // ── /dashboard/programs/[programId]/edit — hands-on builder walk ─────────
    {
      id: 'programs-edit-intro',
      target: '[data-tour="program-steps"]',
      // The program loads async before the builder renders — give it room.
      waitFor: { selector: '[data-tour="program-steps"]', timeoutMs: 10000 },
      title: 'Editing your program',
      body: 'Same three-step builder, prefilled with your program. Since it’s already complete, every step is unlocked.',
      placement: 'bottom',
    },
    {
      id: 'programs-edit-open-phases',
      target: '[data-tour="program-step-phases"]',
      title: 'Open the training editor',
      body: 'Tap Phases & Workouts to jump straight to the training content — or press Next and explore it later.',
      placement: 'bottom',
      allowInteraction: true,
      advanceOn: { event: 'click' },
    },
    {
      id: 'programs-edit-add-phase',
      target: '[data-tour="program-add-phase"]',
      waitFor: { selector: '[data-tour="program-add-phase"]', timeoutMs: 4000 },
      title: 'Add a phase',
      body: 'A phase is a block of weeks with its own focus — Foundation, Build, Peak. Adding one creates a workout slot for every training day.',
      placement: 'bottom',
    },
    {
      id: 'programs-edit-phase-card',
      target: '[data-tour="phase-card"]',
      waitFor: { selector: '[data-tour="phase-card"]', timeoutMs: 2500 },
      title: 'Inside a phase',
      body: 'Give it a weeks range and a focus. Tap the header to collapse or expand; the trash icon removes the phase and its workouts.',
      placement: 'bottom',
    },
    {
      id: 'programs-edit-workout-tabs',
      target: '[data-tour="workout-tabs"]',
      waitFor: { selector: '[data-tour="workout-tabs"]', timeoutMs: 2500 },
      title: 'One workout per day',
      body: 'Switch training days here. “Copy current to…” clones this day’s workout onto another day — build once, tweak the copy.',
      placement: 'bottom',
    },
    {
      id: 'programs-edit-add-exercise',
      target: '[data-tour="add-exercise"]',
      waitFor: { selector: '[data-tour="add-exercise"]', timeoutMs: 2500 },
      title: 'Add exercises',
      body: 'Fill the day with exercises — typing a name searches the full library plus your custom exercises, and Quick Add drops in common picks. Sets, reps, and rest live on each row.',
      placement: 'bottom',
    },
    {
      id: 'programs-edit-groups',
      target: '[data-tour="combine-exercises"]',
      waitFor: { selector: '[data-tour="combine-exercises"]', timeoutMs: 2500 },
      title: 'Supersets & circuits',
      body: 'Select two or more exercises with the circles on their left, then combine them into a superset, circuit, EMOM, and more. Drag the handles to reorder.',
      placement: 'bottom',
    },
    {
      id: 'programs-edit-save',
      target: '[data-tour="program-save"]',
      waitFor: { selector: '[data-tour="program-save"]', timeoutMs: 2500 },
      title: 'Save your changes',
      body: 'The floating save follows you on every step — amber with a pulse means unsaved changes. Saved programs update everywhere you’re enrolled.',
      placement: 'top',
    },
  ],
  segments: {
    'programs-mine': {
      steps: ['programs-mine-intro', 'programs-mine-list', 'programs-mine-create'],
      trigger: { type: 'route', match: '/dashboard/programs/mine', delayMs: 600 },
    },
    'programs-new': {
      steps: [
        'programs-new-intro',
        'programs-new-steps',
        'programs-new-basics',
        'programs-new-schedule',
        'programs-new-equipment',
        'programs-new-phases',
        'programs-new-nav',
        'programs-new-save',
      ],
      trigger: { type: 'route', match: '/dashboard/programs/new', delayMs: 600 },
    },
    'programs-edit': {
      steps: [
        'programs-edit-intro',
        'programs-edit-open-phases',
        'programs-edit-add-phase',
        'programs-edit-phase-card',
        'programs-edit-workout-tabs',
        'programs-edit-add-exercise',
        'programs-edit-groups',
        'programs-edit-save',
      ],
      // Dynamic [programId] route → RegExp form (string matches are exact,
      // '*' is prefix-only). Anchored so /programs/new|mine can never match.
      trigger: {
        type: 'route',
        match: /^\/dashboard\/programs\/[^/]+\/edit\/?$/,
        delayMs: 800,
      },
    },
  },
}

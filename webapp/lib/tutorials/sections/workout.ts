import type { TutorialSection } from './types'

// Workout section — covers the full training surface, one segment per route:
//
//   /dashboard/workout                          → browse programs / your training
//   /dashboard/workout/[programId]              → program detail (phases, days, exercises)
//   /dashboard/workout/[programId]/schedule     → schedule setup / view
//   /dashboard/workout/[programId]/journey      → program-complete recap
//   /dashboard/workout/[programId]/workout      → Track view (set-logging form)
//   /dashboard/workout/[programId]/workout/live → Live view (immersive tracker)
//
// Dynamic [programId] routes use RegExp triggers (routeMatches supports
// string | RegExp; the reported path comes from usePathname(), so no query
// string). The program-detail regex excludes the static siblings that also
// live under /dashboard/workout/ (create, hub, library, quick-session).
//
// Program lists, exercise lists, and set inputs are dynamic — we coach the
// CONTAINER/concept, never individual items. State-dependent anchors
// (Continue Training, schedule view-vs-create mode, journey PRs) rely on the
// tour's `onMissingTarget: 'skip'` so either page state plays cleanly.
export const workoutSection: TutorialSection = {
  steps: [
    // ── /dashboard/workout — browse & your training ─────────────────────────
    {
      id: 'workout-upcoming',
      target: '[data-tour="workout-upcoming"]',
      title: 'This week at a glance',
      body: 'Your scheduled sessions show up here so you always know what is next.',
      placement: 'bottom',
    },
    {
      id: 'workout-quick-links',
      target: '[data-tour="workout-quick-links"]',
      title: 'Workouts, programs, and AI',
      body: 'Jump to the exercise hub, browse programs, or have Become generate a custom program for you.',
      placement: 'bottom',
    },
    {
      id: 'workout-quick-session',
      target: '[data-tour="workout-quick-session"]',
      title: 'Workout Now',
      body: 'Not on a program? Log a one-off session — no setup required.',
      placement: 'bottom',
    },
    {
      id: 'workout-continue',
      target: '[data-tour="workout-continue"]',
      title: 'Continue training',
      body: 'Programs you are enrolled in live here — tap the play button to start today’s workout.',
      placement: 'bottom',
    },
    {
      id: 'workout-browse',
      target: '#browse-programs',
      title: 'Browse programs',
      body: 'The full program library — each one is a multi-week plan built around a goal.',
      placement: 'top',
    },
    {
      id: 'workout-search',
      target: '[data-tour="workout-search"]',
      title: 'Find your fit',
      body: 'Search by name, tag, or description — or use Filters to match your experience level.',
      placement: 'bottom',
      allowInteraction: true,
    },
    {
      id: 'workout-history',
      target: 'a[href="/dashboard/history"]',
      title: 'Training history',
      body: 'Every past session you have logged, in one place.',
      placement: 'bottom',
    },

    // ── /dashboard/workout/[programId] — program detail ─────────────────────
    {
      id: 'workout-program-start',
      target: '[data-tour="program-start"]',
      title: 'Start the program',
      body: 'Enroll here — pick a start date and Become builds your schedule around it.',
    },
    {
      id: 'workout-program-live',
      target: '[data-tour="program-live"]',
      title: 'Straight to work',
      body: 'This jumps directly into today’s session — it turns into Resume if you left one unfinished.',
    },
    {
      id: 'workout-program-phases',
      target: '[data-tour="program-phases"]',
      title: 'Phases',
      body: 'Programs progress in phases — tap one to see its focus and weeks.',
      placement: 'bottom',
      allowInteraction: true,
    },
    {
      id: 'workout-program-days',
      target: '[data-tour="program-days"]',
      title: 'Training days',
      body: 'Each phase has a set of training days — tap a day to preview its workout.',
      placement: 'bottom',
      allowInteraction: true,
    },
    {
      id: 'workout-program-exercises',
      target: '[data-tour="program-exercises"]',
      title: 'The workout itself',
      body: 'Every exercise expands with sets, reps, form cues, and a video demo.',
      placement: 'top',
    },

    // ── /dashboard/workout/[programId]/schedule — schedule setup / view ─────
    {
      id: 'workout-schedule-steps',
      target: '[data-tour="schedule-steps"]',
      title: 'Three quick steps',
      body: 'Pick your training days, choose a start date, then confirm the preview.',
      placement: 'bottom',
    },
    {
      id: 'workout-schedule-days',
      target: '[data-tour="schedule-days"]',
      title: 'Your training days',
      body: 'Tap the weekdays you want to train — Become maps every workout onto them.',
      placement: 'bottom',
      allowInteraction: true,
    },
    {
      id: 'workout-schedule-stats',
      target: '[data-tour="schedule-stats"]',
      title: 'Schedule at a glance',
      body: 'Sessions completed, your training days, and when the program started.',
      placement: 'bottom',
    },
    {
      id: 'workout-schedule-actions',
      target: '[data-tour="schedule-actions"]',
      title: 'Adjust anytime',
      body: 'Open the full calendar, change training days, or rebuild the schedule from scratch.',
      placement: 'top',
    },

    // ── /dashboard/workout/[programId]/journey — program recap ──────────────
    {
      id: 'workout-journey-hero',
      target: '[data-tour="journey-hero"]',
      title: 'Program complete',
      body: 'Finish a program and this recap celebrates the whole run.',
      placement: 'bottom',
    },
    {
      id: 'workout-journey-stats',
      target: '[data-tour="journey-stats"]',
      title: 'The numbers',
      body: 'Sessions completed, total weight lifted, and how your bodyweight changed.',
      placement: 'bottom',
    },
    {
      id: 'workout-journey-prs',
      target: '[data-tour="journey-prs"]',
      title: 'Personal records',
      body: 'Your heaviest lifts from the program, ranked.',
      placement: 'top',
    },
    {
      id: 'workout-journey-next',
      target: '[data-tour="journey-next"]',
      title: 'What’s next',
      body: 'Find your next challenge or review the full training log.',
      placement: 'top',
    },

    // ── /dashboard/workout/[programId]/workout — Track view ─────────────────
    {
      id: 'workout-track-toggle',
      target: '[aria-label="Workout view"]',
      title: 'Track or go Live',
      body: 'Two ways to run a session: Track is a checklist form, Live is a full-screen coach — progress is shared, so switch anytime.',
      placement: 'bottom',
    },
    {
      id: 'workout-track-progress',
      target: '[data-tour="track-progress"]',
      title: 'Session progress',
      body: 'Your completion for the whole workout — every set you log saves automatically.',
      placement: 'bottom',
    },
    {
      id: 'workout-track-exercises',
      target: '[data-tour="track-exercises"]',
      title: 'Log your sets',
      body: 'Tap an exercise to expand it, then enter reps and weight — filled sets check off on their own.',
      placement: 'top',
      allowInteraction: true,
    },
    {
      id: 'workout-track-swap',
      target: 'button[title="Swap exercise"]',
      title: 'Swap exercises',
      body: 'Equipment taken or movement not working? Swap in an alternative without losing progress.',
      placement: 'bottom',
    },

    // ── /dashboard/workout/[programId]/workout/live — Live tracker ──────────
    {
      id: 'workout-live-timer',
      target: '[data-tour="live-timer"]',
      title: 'Session clock',
      body: 'Your running workout time — it keeps counting through rests.',
      placement: 'bottom',
    },
    {
      id: 'workout-live-set-progress',
      target: '[data-tour="live-set-progress"]',
      title: 'Set progress',
      body: 'One bar per set of the current exercise — they fill as you complete them.',
      placement: 'bottom',
    },
    {
      id: 'workout-live-info',
      target: '[data-tour="live-exercise-info"]',
      title: 'Your current exercise',
      body: 'The movement, coach cues, your last numbers, and your PR — plus a form video playing behind.',
      placement: 'top',
    },
    {
      id: 'workout-live-inputs',
      target: '[data-tour="live-inputs"]',
      title: 'Log the set',
      body: 'Enter weight and reps here — beat your PR and it lights up.',
      placement: 'top',
      allowInteraction: true,
    },
    {
      id: 'workout-live-complete',
      target: '[data-tour="live-complete-set"]',
      title: 'Complete the set',
      body: 'Tap when you are done — the rest timer starts, then Live advances to the next set for you.',
      placement: 'top',
    },
    {
      id: 'workout-live-dots',
      target: '[data-tour="live-exercise-dots"]',
      title: 'The whole session',
      body: 'One dot per exercise — tap to peek at the full plan and jump around. Tap the video to go fullscreen.',
      placement: 'left',
      allowInteraction: true,
    },
  ],
  segments: {
    'workout-browse': {
      steps: [
        'workout-upcoming',
        'workout-quick-links',
        'workout-quick-session',
        'workout-continue',
        'workout-browse',
        'workout-search',
        'workout-history',
      ],
      trigger: { type: 'route', match: '/dashboard/workout', delayMs: 600 },
    },
    'workout-program-detail': {
      steps: [
        'workout-program-start',
        'workout-program-live',
        'workout-program-phases',
        'workout-program-days',
        'workout-program-exercises',
      ],
      // Any /dashboard/workout/<programId> EXCEPT the static siblings
      // (create/hub/library/quick-session) and without deeper segments.
      trigger: {
        type: 'route',
        match: /^\/dashboard\/workout\/(?!create$|hub$|library$|quick-session$)[^/]+$/,
        delayMs: 600,
      },
    },
    'workout-schedule': {
      steps: [
        'workout-schedule-steps',
        'workout-schedule-days',
        'workout-schedule-stats',
        'workout-schedule-actions',
      ],
      trigger: {
        type: 'route',
        match: /^\/dashboard\/workout\/[^/]+\/schedule$/,
        // The page decides create-vs-view mode after an API roundtrip; give it
        // a beat so the right anchors exist before the segment starts.
        delayMs: 900,
      },
    },
    'workout-journey': {
      steps: [
        'workout-journey-hero',
        'workout-journey-stats',
        'workout-journey-prs',
        'workout-journey-next',
      ],
      trigger: {
        type: 'route',
        match: /^\/dashboard\/workout\/[^/]+\/journey$/,
        delayMs: 900,
      },
    },
    'workout-tracker': {
      steps: [
        'workout-track-toggle',
        'workout-track-progress',
        'workout-track-exercises',
        'workout-track-swap',
      ],
      trigger: {
        type: 'route',
        match: /^\/dashboard\/workout\/[^/]+\/workout$/,
        delayMs: 800,
      },
    },
    'workout-live': {
      steps: [
        'workout-live-timer',
        'workout-live-set-progress',
        'workout-live-info',
        'workout-live-inputs',
        'workout-live-complete',
        'workout-live-dots',
      ],
      trigger: {
        type: 'route',
        match: /^\/dashboard\/workout\/[^/]+\/workout\/live$/,
        // Live loads the workout + video before its overlays mount.
        delayMs: 1000,
      },
    },
  },
}

import type { TutorialSection } from './types'

// Mind section — four segments across the Mind/mood area:
//
//   mind          /dashboard/mind            — the Mind home (daily session ritual)
//   mind-arsenal  /dashboard/mind/arsenal    — unlocked systems library ("More →")
//   mind-becoming /dashboard/mind/becoming   — the mind's training log
//   mind-section  /dashboard/mind/[section]  — a system's own dashboard
//
// IMPORTANT — the home segment uses a SELECTOR trigger, not a route trigger.
// /dashboard/mind is gated twice: FeatureGuard (non-admins see a "Coming Soon"
// screen) and first-run IdentityOnboarding (new users see onboarding, not the
// journey). A route trigger would fire over those screens, find no anchors,
// skip every step, and permanently consume the segment. The session card
// ([data-tour="mind-session"]) only exists once the real Mind home renders,
// so triggering on it plays the tour exactly when there is something to show.
//
// The [section] route renders one of SEVEN system dashboards (state-shift,
// self-image, mission, discipline, anti-sabotage, social, vision) inside the
// same chrome. We tour the PATTERN once — header + tool area — rather than
// each system, via a RegExp that enumerates the valid slugs (and therefore
// can't fire on /arsenal, /becoming, or an invalid slug mid-redirect).
export const mindSection: TutorialSection = {
  steps: [
    // ── Mind home ──
    {
      id: 'mind-session',
      target: '[data-tour="mind-session"]',
      title: "Today's session",
      body: 'A short mind-training ritual composed fresh for you each day — check in, breathe, affirm, lock in. Tap Begin when you are ready.',
      placement: 'bottom',
    },
    {
      id: 'mind-chapters',
      target: '[data-tour="mind-chapters"]',
      title: 'Chapters',
      body: 'Sessions earn XP. Five chapters — Reset to Architect — and each one unlocks new mental tools.',
      placement: 'bottom',
    },
    {
      id: 'mind-arsenal-link',
      target: '[data-tour="mind-arsenal-link"]',
      title: 'Your Arsenal',
      body: 'The tools you have unlocked — meditations, journaling, goals, and quick themed sessions.',
      placement: 'top',
    },
    {
      id: 'mind-becoming-link',
      target: '[data-tour="mind-becoming-link"]',
      title: 'The Becoming',
      body: 'Your training log for the mind — where you started, where you are, and the proof you are changing.',
      placement: 'top',
    },
    {
      id: 'mind-coach',
      target: '[data-tour="mind-coach"]',
      title: 'Talk to your coach',
      body: 'An AI mindset coach for the hard part — the resistance, the doubt, the next move.',
      placement: 'top',
    },

    // ── Arsenal ──
    {
      id: 'mind-arsenal-systems',
      target: '[data-tour="arsenal-systems"]',
      title: 'Your systems',
      body: 'Each card opens that system’s full dashboard — the deep tools for that skill.',
      placement: 'bottom',
    },
    {
      id: 'mind-arsenal-play',
      target: 'button[aria-label="Start focused session"]',
      title: 'Quick session',
      body: 'The play button skips the dashboard and launches a short, fresh session themed on that system.',
      placement: 'left',
    },
    {
      id: 'mind-arsenal-locked',
      // Only present while something is still locked — skipped otherwise.
      target: '[data-tour="arsenal-locked"]',
      title: 'Locked for now',
      body: 'More systems unlock as you advance chapters. Keep showing up.',
      placement: 'top',
    },

    // ── The Becoming ──
    {
      id: 'mind-becoming-score',
      target: '[data-tour="becoming-score"]',
      title: 'Becoming score',
      body: 'Every session banks XP here — this total never resets, and your streak rides along.',
      placement: 'bottom',
    },
    {
      id: 'mind-becoming-journey',
      target: '[data-tour="becoming-journey"]',
      title: 'Then, now, next',
      body: 'Where you started, the chapter you are in, and what you are building toward.',
      placement: 'bottom',
    },
    {
      id: 'mind-becoming-wins',
      target: '[data-tour="becoming-wins"]',
      title: 'Evidence wall',
      body: 'Wins you bank in sessions collect here — proof, in your own words, that it is working.',
      placement: 'top',
    },

    // ── A system's dashboard (representative — same chrome for all seven) ──
    {
      id: 'mind-section-header',
      target: '[data-tour="mind-section-header"]',
      title: 'A system’s home',
      body: 'Every system in your Arsenal opens a page like this one, with its own practices and history.',
      placement: 'bottom',
    },
    {
      id: 'mind-section-body',
      target: '[data-tour="mind-section-body"]',
      title: 'The deep tools',
      body: 'Practices, tracking, and progress for this skill live here — and grow as you level up.',
      placement: 'top',
    },
  ],
  segments: {
    mind: {
      steps: ['mind-session', 'mind-chapters', 'mind-arsenal-link', 'mind-becoming-link', 'mind-coach'],
      // Selector, not route — see the header comment (FeatureGuard/onboarding gates).
      trigger: { type: 'selector', selector: '[data-tour="mind-session"]', delayMs: 600 },
    },
    'mind-arsenal': {
      steps: ['mind-arsenal-systems', 'mind-arsenal-play', 'mind-arsenal-locked'],
      trigger: { type: 'route', match: '/dashboard/mind/arsenal', delayMs: 600 },
    },
    'mind-becoming': {
      steps: ['mind-becoming-score', 'mind-becoming-journey', 'mind-becoming-wins'],
      trigger: { type: 'route', match: '/dashboard/mind/becoming', delayMs: 600 },
    },
    'mind-section': {
      steps: ['mind-section-header', 'mind-section-body'],
      trigger: {
        type: 'route',
        // Only the seven real system slugs — never /arsenal, /becoming, or an
        // unknown slug that [section]/page.tsx is about to redirect away.
        match: /^\/dashboard\/mind\/(state-shift|self-image|mission|discipline|anti-sabotage|social|vision)\/?$/,
        delayMs: 600,
      },
    },
  },
}

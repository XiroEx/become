import type { TutorialSection } from './types'

// Account section — profile, settings, and the dashboard tile customizer.
// Three segments, one per route:
//   /dashboard/profile   — identity card, mindset progress, icon picker, gear
//   /dashboard/settings  — tabbed settings (Profile / Training / Settings) + Save
//   /dashboard/customize — the tile editor: pin (add), unpin (remove), drag (reorder)
//
// The Settings page's Training and Settings tab panes aren't mounted until
// their tab is active, so we describe them in the tabs step instead of
// stepping through them. The mindset-progress card only renders once mind
// data loads — the tour-level `onMissingTarget: 'skip'` covers it.
export const accountSection: TutorialSection = {
  steps: [
    // ── /dashboard/profile ───────────────────────────────────────────────────
    {
      id: 'account-profile-identity',
      target: '[data-tour="profile-identity"]',
      title: 'Your identity card',
      body: 'Name, email, fitness focus, and how long you have been at it — you at a glance.',
      placement: 'bottom',
    },
    {
      id: 'account-profile-mind',
      target: '[data-tour="profile-mind"]',
      title: 'Mindset progress',
      body: 'Your chapter and XP from the Mind section — the bar fills as you grow.',
      placement: 'bottom',
    },
    {
      id: 'account-profile-icon',
      target: '[data-tour="profile-icon-picker"]',
      title: 'Pick your look',
      body: 'Choose a preset icon, or upload your own photo and zoom it to fit.',
      placement: 'top',
    },
    {
      id: 'account-profile-settings-link',
      target: 'a[aria-label="Settings"]',
      title: 'Account & preferences',
      body: 'Everything configurable — account, training preferences, notifications — lives behind the gear.',
      placement: 'bottom',
    },

    // ── /dashboard/settings ──────────────────────────────────────────────────
    {
      id: 'account-settings-tabs',
      target: '[data-tour="settings-tabs"]',
      title: 'Three tabs, all of it',
      body: 'Profile holds your account and body stats. Training covers your goal, experience, and equipment. Settings has notifications and nutrition planning.',
      placement: 'bottom',
    },
    {
      id: 'account-settings-account',
      target: '[data-tour="settings-account"]',
      title: 'Account basics',
      body: 'Update your display name, or add a passkey for faster sign-in. Your email is fixed.',
      placement: 'bottom',
    },
    {
      id: 'account-settings-body-stats',
      target: '[data-tour="settings-body-stats"]',
      title: 'Body stats',
      body: 'Height and weight power your BMI and trends. Flip between Imperial and Metric anytime — values convert for you.',
      placement: 'top',
    },
    {
      id: 'account-settings-save',
      target: '[data-tour="settings-save"]',
      title: 'Save your changes',
      body: 'Edits on this page apply only after you tap Save.',
      placement: 'top',
    },

    // ── /dashboard/customize ─────────────────────────────────────────────────
    {
      // No target → centered modal: frame the palette + lineup concept first.
      id: 'account-customize-intro',
      title: 'Make the dashboard yours',
      body: 'The dashboard is built from tiles, and this is the tile editor: your pinned lineup on top, a palette of every tile below.',
      nextLabel: 'Show me',
    },
    {
      id: 'account-customize-pinned',
      target: '[data-testid="pinned-section"]',
      title: 'Your pinned lineup',
      body: 'Pinned tiles stay at the top of the dashboard in exactly this order. Drag a tile to rearrange it, or tap Unpin to remove it.',
      placement: 'bottom',
    },
    {
      id: 'account-customize-palette',
      target: '[data-tour="customize-palette"]',
      title: 'The tile palette',
      body: 'Every tile, grouped by domain. Tap Pin to add one to your dashboard — changes save automatically, and unpinned tiles can still rotate in when relevant.',
      placement: 'top',
    },
  ],
  segments: {
    'account-profile': {
      steps: [
        'account-profile-identity',
        'account-profile-mind',
        'account-profile-icon',
        'account-profile-settings-link',
      ],
      trigger: { type: 'route', match: '/dashboard/profile', delayMs: 600 },
    },
    'account-settings': {
      steps: [
        'account-settings-tabs',
        'account-settings-account',
        'account-settings-body-stats',
        'account-settings-save',
      ],
      trigger: { type: 'route', match: '/dashboard/settings', delayMs: 600 },
    },
    'account-customize': {
      steps: [
        'account-customize-intro',
        'account-customize-pinned',
        'account-customize-palette',
      ],
      trigger: { type: 'route', match: '/dashboard/customize', delayMs: 600 },
    },
  },
}

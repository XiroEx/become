/**
 * Which channel this build is.
 *
 * There are two RedRun workspaces off the same repo and the same database:
 * production (become.redbtn.io, `main`) and beta (become-beta.redbtn.io,
 * `beta`). They are deliberately near-identical, which is exactly why the build
 * has to say which one it is — otherwise an installed PWA from beta is
 * indistinguishable from the production one sitting next to it on the home
 * screen, and a tester cannot tell which app they just opened.
 *
 * The signal is NEXT_PUBLIC_APP_NAME, which is already set per workspace. It is
 * a NEXT_PUBLIC_ var so it is inlined at build time — each channel builds
 * separately, so that is the correct behaviour here rather than a limitation.
 */

export const IS_BETA = /beta/i.test(process.env.NEXT_PUBLIC_APP_NAME ?? '')

/** Full product name for titles and the PWA install prompt. */
export const APP_NAME = IS_BETA ? 'Become (beta)' : 'Become'

/** Home-screen label. Kept short — launchers truncate past ~12 characters. */
export const APP_SHORT_NAME = IS_BETA ? 'Become beta' : 'Become'

export const APP_DESCRIPTION = IS_BETA
  ? 'Beta channel for Become. Same data as the live app — changes here are real.'
  : 'Transform your body and mind with personalized fitness coaching.'

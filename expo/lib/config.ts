/**
 * App-wide configuration constants.
 *
 * Single source of truth for the webapp backend base URL. Every native screen
 * that talks to the Become backend (auth, dashboard, programs, nutrition, …)
 * imports WEBAPP_BASE_URL from here so there is exactly one place to change the
 * environment (prod vs. a local dev backend).
 */

export const WEBAPP_BASE_URL = "https://become.redbtn.io";

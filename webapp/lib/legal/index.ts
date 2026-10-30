/**
 * Legal surfaces and constants — re-exported from @become/core (Decision NP-017).
 */
export * from '@become/core/legal'

// LOCAL OVERRIDES until @become/core is republished (the published 0.1.0 still
// says v1.2.0). An explicit export wins over the `export *` above. These four
// MUST equal shared/core/src/legal/index.ts; tests/unit/legal/privacyCoreParity
// checks it. LEGAL_VERSION v1.3.0 is the Oct 30 2026 legal package (Jon's
// approved wording): it changes what members agree to, so every member is
// asked to agree again (ConsentGate compares the stored termsVersion).
export const LEGAL_VERSION = 'v1.3.0'
export const LEGAL_LAST_UPDATED = 'October 30, 2026'
export const LEGAL_LAST_UPDATED_ISO = '2026-10-30'
export const LEGAL_VENUE =
  'the state courts located in Nassau County, New York, and the United States District Court for the Eastern District of New York'

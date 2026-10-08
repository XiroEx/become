/**
 * ─── POST-ONBOARDING TRIAL OFFER (NP-129) ACCEPTANCE TESTS ────────────────────
 *
 * Verifies:
 *   1. isTrialEligible and trialOfferDue logic (pure domain rules)
 *   2. Copy parity with webapp/lib/trialOfferCopy.ts
 *   3. NP-052 compliance: Linking.openURL / openExternally with zero expo-web-browser imports
 *   4. expo/app/onboarding.tsx routing strictly through finishOnboarding on dismissal
 */

import * as fs from "fs";
import * as path from "path";
import {
  TRIAL_DAYS,
  isTrialEligible,
  trialOfferDue,
  type TrialOfferSnapshot,
} from "@/lib/billing/trial";
import {
  CONTINUE_FREE_LABEL,
  TERMS_REFUND_HREF,
  TRIAL_AGREEMENT_TEXT,
  TRIAL_CTA_LABEL,
  TRIAL_OFFER_DETAIL,
  TRIAL_OFFER_HEADING,
  TRIAL_OFFER_SUBHEADING,
} from "@/lib/billing/trialOfferCopy";

const REPO_ROOT = path.resolve(__dirname, "../..");

const read = (rel: string): string => {
  const file = path.join(REPO_ROOT, rel);
  expect(fs.existsSync(file)).toBe(true);
  return fs.readFileSync(file, "utf8");
};

describe("(NP-129) isTrialEligible", () => {
  it("returns true when account has never held a subscription", () => {
    expect(isTrialEligible(undefined)).toBe(true);
    expect(isTrialEligible(null)).toBe(true);
    expect(isTrialEligible({})).toBe(true);
    expect(isTrialEligible({ status: null })).toBe(true);
    expect(isTrialEligible({ status: "none" })).toBe(true);
  });

  it("returns false for any spent or existing subscription status", () => {
    const statuses = [
      "trialing",
      "active",
      "past_due",
      "canceled",
      "unpaid",
      "incomplete",
      "incomplete_expired",
      "paused",
    ];
    for (const status of statuses) {
      expect(isTrialEligible({ status })).toBe(false);
    }
  });

  it("TRIAL_DAYS is exactly 10", () => {
    expect(TRIAL_DAYS).toBe(10);
  });
});

describe("(NP-129) trialOfferDue", () => {
  const baseEligible = (over: Partial<TrialOfferSnapshot> = {}): TrialOfferSnapshot => ({
    tier: "free",
    checkoutAvailable: true,
    subscription: { status: "none" },
    ...over,
  });

  it("offers the trial to a brand-new free member when checkout is available", () => {
    expect(trialOfferDue(baseEligible())).toBe(true);
    expect(trialOfferDue(baseEligible({ subscription: null }))).toBe(true);
    expect(trialOfferDue(baseEligible({ subscription: undefined }))).toBe(true);
  });

  it("bails when checkout is not available", () => {
    expect(trialOfferDue(baseEligible({ checkoutAvailable: false }))).toBe(false);
    expect(trialOfferDue(baseEligible({ checkoutAvailable: null }))).toBe(false);
    expect(trialOfferDue(baseEligible({ checkoutAvailable: undefined }))).toBe(false);
  });

  it("bails when member already has plus tier", () => {
    expect(trialOfferDue(baseEligible({ tier: "plus" }))).toBe(false);
  });

  it("bails when subscription has been spent", () => {
    for (const status of ["trialing", "active", "past_due", "canceled"]) {
      expect(trialOfferDue(baseEligible({ subscription: { status } }))).toBe(false);
    }
  });

  it("fails closed on missing snapshot", () => {
    expect(trialOfferDue(null)).toBe(false);
    expect(trialOfferDue(undefined)).toBe(false);
  });
});

describe("(NP-129) Copy parity with webapp", () => {
  it("native copy constants match webapp/lib/trialOfferCopy.ts identically", () => {
    const webCopySrc = read("webapp/lib/trialOfferCopy.ts");

    expect(webCopySrc).toContain(TRIAL_OFFER_HEADING);
    expect(webCopySrc).toContain(TRIAL_OFFER_SUBHEADING);
    expect(webCopySrc).toContain(TRIAL_OFFER_DETAIL);
    expect(webCopySrc).toContain(TRIAL_AGREEMENT_TEXT);
    expect(webCopySrc).toContain(TRIAL_CTA_LABEL);
    expect(webCopySrc).toContain(CONTINUE_FREE_LABEL);
    expect(webCopySrc).toContain(TERMS_REFUND_HREF);
  });
});

describe("(NP-129) NP-052 external purchase compliance", () => {
  it("never imports expo-web-browser in trial or billing modules", () => {
    const filesToCheck = [
      "expo/lib/billing/trial.ts",
      "expo/lib/billing/trialOfferCopy.ts",
      "expo/components/onboarding/TrialOfferModal.tsx",
      "expo/lib/entitlements/billing.ts",
      "expo/app/onboarding.tsx",
    ];

    for (const file of filesToCheck) {
      const src = read(file);
      expect(src).not.toMatch(/from\s+["']expo-web-browser["']/);
    }
  });

  it("TrialOfferModal uses openExternally and rememberBillingHandover", () => {
    const modalSrc = read("expo/components/onboarding/TrialOfferModal.tsx");
    expect(modalSrc).toContain("openExternally(");
    expect(modalSrc).toContain("rememberBillingHandover(");
  });
});

describe("(NP-129) Onboarding navigation parity", () => {
  it("onboarding.tsx mounts TrialOfferModal and navigates through finishOnboarding", () => {
    const onboardingSrc = read("expo/app/onboarding.tsx");

    expect(onboardingSrc).toContain("import TrialOfferModal from \"@/components/onboarding/TrialOfferModal\"");
    expect(onboardingSrc).toContain("const [showTrialOffer, setShowTrialOffer] = useState(false)");
    expect(onboardingSrc).toContain("<TrialOfferModal onDismiss={finishOnboarding} />");
    expect(onboardingSrc).toMatch(/finishOnboarding\s*=\s*useCallback\(\(\)\s*=>\s*\{\s*router\.replace\("\/\(tabs\)\/dashboard"\)/);
    expect(onboardingSrc).toContain("setShowTrialOffer(true)");
  });
});

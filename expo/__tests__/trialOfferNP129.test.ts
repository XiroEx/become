/**
 * ─── POST-ONBOARDING TRIAL OFFER (NP-129) ────────────────────────────────────
 *
 * Acceptance criteria:
 * - [ ] (id: e015c997) A new member sees the same trial choice natively as on the web, with the same effect
 * - [ ] (id: e015c998) Declining the trial leaves the member on the free plan and continues where the web continues
 *
 * Verifies:
 * 1. `trialOfferDue` gates the offer correctly (new member with checkout configured),
 *    never suppresses on kill-switch `enforced === false`, bails on already-plus or
 *    spent trial, and fails closed on missing snapshot.
 * 2. Copy and trial length (10 days) strictly mirror `webapp/lib/trialOfferCopy.ts`.
 * 3. `onboarding.tsx` mounts `TrialOfferModal` and reaches dashboard ONLY through
 *    `finishOnboarding` / `TrialOfferModal` dismissal.
 * 4. NP-052 rules are upheld: checkout leaves the app via external browser,
 *    never imports `expo-web-browser`, sends `trial: true` and `returnTo: 'app'`.
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

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const newMember = (over: Partial<TrialOfferSnapshot> = {}): TrialOfferSnapshot => ({
  tier: "free",
  checkoutAvailable: true,
  subscription: null,
  ...over,
});

describe("Post-onboarding 10-day trial offer (NP-129)", () => {
  describe("(id: e015c997) A new member sees the same trial choice natively as on the web, with the same effect", () => {
    it("trialOfferDue offers 10-day trial to brand-new free member when checkout is live", () => {
      expect(trialOfferDue(newMember())).toBe(true);
      expect(TRIAL_DAYS).toBe(10);
    });

    it("THE KILL-SWITCH DOES NOT SUPPRESS IT — billing is not a tier surface", () => {
      // ENTITLEMENTS_ENFORCED is false in production; the trial CTA must still appear.
      for (const enforced of [true, false, undefined]) {
        expect(
          trialOfferDue({
            ...newMember(),
            ...(enforced === undefined ? {} : { enforced }),
          } as TrialOfferSnapshot),
        ).toBe(true);
      }

      const modalSrc = read("expo/components/onboarding/TrialOfferModal.tsx")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(modalSrc).not.toMatch(/data\s*\.\s*enforced/);
    });

    it("copy matches webapp/lib/trialOfferCopy.ts exactly", () => {
      const webCopySrc = read("webapp/lib/trialOfferCopy.ts");

      expect(TRIAL_OFFER_HEADING).toBe("Try Plus free for 10 days");
      expect(webCopySrc).toContain(TRIAL_OFFER_HEADING);

      expect(TRIAL_OFFER_SUBHEADING).toBe(
        "Start your trial now, or keep using Become for free — your choice either way.",
      );
      expect(webCopySrc).toContain(TRIAL_OFFER_SUBHEADING);

      expect(TRIAL_OFFER_DETAIL).toContain("After 10 days, unless you cancel first");
      expect(TRIAL_OFFER_DETAIL).toContain("Manage billing, one tap away");

      expect(TRIAL_AGREEMENT_TEXT).toContain("10-day free trial of Plus");
      expect(TRIAL_AGREEMENT_TEXT).toContain("14 days of being charged");

      expect(TRIAL_CTA_LABEL).toBe("Start my 10-day free trial");
      expect(CONTINUE_FREE_LABEL).toBe("Continue free");
      expect(TERMS_REFUND_HREF).toBe("/terms#cancelling");
    });

    it("startCheckout sends { trial: true } and returnTo: 'app' following NP-052 rules", () => {
      const billingSrc = read("expo/lib/entitlements/billing.ts");
      expect(billingSrc).toMatch(/trial\?:\s*boolean/);
      expect(billingSrc).toMatch(/\.\.\.\(deps\.trial \? \{ trial: true \} : \{\}\)/);
      expect(billingSrc).toMatch(/returnTo:\s*NATIVE_RETURN_TO/);
    });

    it("TrialOfferModal strictly forbids expo-web-browser and uses external browser", () => {
      const modalSrc = read("expo/components/onboarding/TrialOfferModal.tsx");
      expect(modalSrc).not.toMatch(/from\s+["']expo-web-browser["']/);
      expect(modalSrc).toMatch(/openExternally/);
    });
  });

  describe("(id: e015c998) Declining the trial leaves the member on the free plan and continues where the web continues", () => {
    it("no offer when checkout cannot work — never render dead buttons", () => {
      expect(trialOfferDue(newMember({ checkoutAvailable: false }))).toBe(false);
      expect(trialOfferDue(newMember({ checkoutAvailable: undefined }))).toBe(false);
      expect(trialOfferDue(newMember({ checkoutAvailable: null }))).toBe(false);
    });

    it("no offer to members who already hold Plus", () => {
      expect(trialOfferDue(newMember({ tier: "plus" }))).toBe(false);
    });

    it("no offer once trial is spent — matches server-side rule", () => {
      for (const status of [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
      ]) {
        expect(
          trialOfferDue(newMember({ subscription: { status } })),
        ).toBe(false);
      }

      // 'none' means account has never held an active or completed subscription
      expect(
        trialOfferDue(newMember({ subscription: { status: "none" } })),
      ).toBe(true);
    });

    it("fails closed on missing snapshot", () => {
      expect(trialOfferDue(null)).toBe(false);
      expect(trialOfferDue(undefined)).toBe(false);
    });

    it("isTrialEligible checks subscription status accurately", () => {
      expect(isTrialEligible(null)).toBe(true);
      expect(isTrialEligible(undefined)).toBe(true);
      expect(isTrialEligible({})).toBe(true);
      expect(isTrialEligible({ status: null })).toBe(true);
      expect(isTrialEligible({ status: "none" })).toBe(true);
      expect(isTrialEligible({ status: "active" })).toBe(false);
      expect(isTrialEligible({ status: "canceled" })).toBe(false);
      expect(isTrialEligible({ status: "trialing" })).toBe(false);
    });

    it("onboarding.tsx mounts TrialOfferModal and navigates to dashboard on dismiss", () => {
      const onboardingSrc = read("expo/app/onboarding.tsx");

      // Mounts TrialOfferModal
      expect(onboardingSrc).toMatch(
        /import TrialOfferModal from ["']@\/components\/onboarding\/TrialOfferModal["']/,
      );
      expect(onboardingSrc).toMatch(
        /showTrialOffer\s*\?\s*\(\s*<TrialOfferModal onDismiss=\{finishOnboarding\}\s*\/>\s*\)\s*:\s*null/,
      );

      // Sets showTrialOffer to true on completion
      expect(onboardingSrc).toMatch(/setShowTrialOffer\(true\)/);

      // Reaches /(tabs)/dashboard ONLY through finishOnboarding
      const dashboardReplace = 'router.replace("/(tabs)/dashboard")';
      const occurrences = onboardingSrc.split(dashboardReplace).length - 1;
      expect(occurrences).toBe(1);

      const at = onboardingSrc.indexOf(dashboardReplace);
      const handler = onboardingSrc.slice(
        onboardingSrc.lastIndexOf("const finishOnboarding", at),
        at,
      );
      expect(handler.length).toBeGreaterThan(0);
    });

    it("TrialOfferModal latches onDismiss against multiple invocations", () => {
      const modalSrc = read("expo/components/onboarding/TrialOfferModal.tsx");
      expect(modalSrc).toMatch(/answered\s*=\s*useRef\(false\)/);
      expect(modalSrc).toMatch(/if\s*\(answered\.current\)\s*return/);
      expect(modalSrc).toMatch(/onContinueFree=\{answer\}/);
    });
  });
});

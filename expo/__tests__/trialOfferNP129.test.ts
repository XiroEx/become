/**
 * ─── THE 10-DAY PLUS TRIAL AFTER ONBOARDING (NP-129) ─────────────────────────
 *
 * Native counterpart of `webapp/tests/unit/billing/trialOfferGate.test.ts` and
 * `webapp/tests/unit/billing/trialOfferCard.test.tsx`.
 *
 * Acceptance criteria, each asserted under its card ID:
 *   (id: e015c997) A new member sees the same trial choice natively as on the web, with the same effect
 *   (id: e015c998) Declining the trial leaves the member on the free plan and continues where the web continues
 */

import * as fs from "fs";
import * as path from "path";
import {
  isTrialEligible,
  TRIAL_DAYS,
  trialOfferDue,
  type TrialOfferSnapshot,
} from "../lib/billing/trial";
import {
  CONTINUE_FREE_LABEL,
  TERMS_REFUND_HREF,
  TRIAL_AGREEMENT_TEXT,
  TRIAL_CTA_LABEL,
  TRIAL_OFFER_DETAIL,
  TRIAL_OFFER_HEADING,
  TRIAL_OFFER_SUBHEADING,
} from "../lib/billing/trialOfferCopy";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

/** Source with comments stripped so explanatory prose cannot satisfy or break checks. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const MODAL_PATH = "expo/components/onboarding/TrialOfferModal.tsx";
const ONBOARDING_PATH = "expo/app/onboarding.tsx";
const BILLING_PATH = "expo/lib/entitlements/billing.ts";
const TRIAL_PATH = "expo/lib/billing/trial.ts";
const TRIAL_COPY_PATH = "expo/lib/billing/trialOfferCopy.ts";
const WEB_TRIAL_COPY_PATH = "webapp/lib/trialOfferCopy.ts";

const newMember = (over: Partial<TrialOfferSnapshot> = {}): TrialOfferSnapshot => ({
  tier: "free",
  checkoutAvailable: true,
  subscription: null,
  ...over,
});

describe("NP-129 — Offer 10-day Plus trial after onboarding", () => {
  describe("(id: e015c997) A new member sees the same trial choice natively as on the web, with the same effect", () => {
    it("offers the trial to a brand-new free member on a billing-configured install", () => {
      expect(trialOfferDue(newMember())).toBe(true);
      expect(trialOfferDue(newMember({ subscription: { status: "none" } }))).toBe(true);
      expect(TRIAL_DAYS).toBe(10);
    });

    it("does not suppress the trial offer on enforced === false (billing control, not tier surface)", () => {
      for (const enforced of [true, false, undefined]) {
        expect(
          trialOfferDue({
            ...newMember(),
            ...(enforced === undefined ? {} : { enforced }),
          } as TrialOfferSnapshot),
        ).toBe(true);
      }
      // Modal code must not read enforced
      expect(code(MODAL_PATH)).not.toMatch(/enforced/);
    });

    it("matches copy constants with webapp/lib/trialOfferCopy.ts", () => {
      const webCopySrc = read(WEB_TRIAL_COPY_PATH);
      expect(webCopySrc).toContain("TRIAL_OFFER_HEADING");
      expect(webCopySrc).toContain("TRIAL_OFFER_SUBHEADING");
      expect(webCopySrc).toContain("TRIAL_OFFER_DETAIL");
      expect(webCopySrc).toContain("TRIAL_AGREEMENT_TEXT");
      expect(webCopySrc).toContain("TRIAL_CTA_LABEL");
      expect(webCopySrc).toContain("CONTINUE_FREE_LABEL");
      expect(webCopySrc).toContain("TERMS_REFUND_HREF");

      expect(TRIAL_OFFER_HEADING).toBe("Try Plus free for 10 days");
      expect(TRIAL_OFFER_SUBHEADING).toBe(
        "Start your trial now, or keep using Become for free — your choice either way.",
      );
      expect(TRIAL_CTA_LABEL).toBe("Start my 10-day free trial");
      expect(CONTINUE_FREE_LABEL).toBe("Continue free");
      expect(TERMS_REFUND_HREF).toBe("/terms#cancelling");
      expect(TRIAL_AGREEMENT_TEXT).toContain("10-day free trial of Plus");
      expect(TRIAL_AGREEMENT_TEXT).toContain("14 days of being charged");
    });

    it("adheres to NP-052 external purchase rules (no expo-web-browser imports)", () => {
      for (const file of [MODAL_PATH, TRIAL_PATH, TRIAL_COPY_PATH, BILLING_PATH]) {
        const src = read(file);
        expect(src).not.toMatch(/from\s+["']expo-web-browser["']/);
        expect(src).not.toMatch(/WebBrowser\./);
        expect(src).not.toMatch(/from\s+["'][^"']*browserLauncher["']/);
        expect(src).not.toMatch(/from\s+["'][^"']*openWebSignedIn["']/);
      }
    });

    it("mounts TrialOfferModal in onboarding flow after profile save", () => {
      const src = read(ONBOARDING_PATH);
      expect(src).toMatch(/import \{ TrialOfferModal \} from ["']@\/components\/onboarding\/TrialOfferModal["']/);
      expect(src).toMatch(/\{showTrialOffer && <TrialOfferModal onDismiss=\{finishOnboarding\} \/>\}/);
      expect(src).toMatch(/setShowTrialOffer\(true\)/);
    });
  });

  describe("(id: e015c998) Declining the trial leaves the member on the free plan and continues where the web continues", () => {
    it("does not offer trial once spent or if member already holds Plus", () => {
      expect(trialOfferDue(newMember({ tier: "plus" }))).toBe(false);

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
    });

    it("does not offer trial when checkout is not configured or snapshot is missing", () => {
      expect(trialOfferDue(newMember({ checkoutAvailable: false }))).toBe(false);
      expect(trialOfferDue(newMember({ checkoutAvailable: null }))).toBe(false);
      expect(trialOfferDue(newMember({ checkoutAvailable: undefined }))).toBe(false);
      expect(trialOfferDue(null)).toBe(false);
      expect(trialOfferDue(undefined)).toBe(false);
    });

    it("reaches /(tabs)/dashboard strictly through finishOnboarding on dismissal", () => {
      const src = read(ONBOARDING_PATH);
      const push = 'router.replace("/(tabs)/dashboard")';
      const pushes = src.split(push).length - 1;
      expect(pushes).toBe(1);

      const at = src.indexOf(push);
      const handler = src.slice(src.lastIndexOf("const finishOnboarding", at), at);
      expect(handler.length).toBeGreaterThan(0);
      expect(src).toMatch(/const finishOnboarding = useCallback\(\(\) => \{/);
    });

    it("latches answer so onDismiss is called at most once", () => {
      const modalSrc = read(MODAL_PATH);
      expect(modalSrc).toMatch(/answered\s*=\s*useRef\(false\)/);
      expect(modalSrc).toMatch(/if \(answered\.current\) return/);
      expect(modalSrc).toMatch(/onContinueFree=\{answer\}/);

      const uses = modalSrc.match(/trialOfferDue\(/g) ?? [];
      expect(uses.length).toBeGreaterThanOrEqual(2);
    });

    it("verifies isTrialEligible logic directly", () => {
      expect(isTrialEligible(null)).toBe(true);
      expect(isTrialEligible(undefined)).toBe(true);
      expect(isTrialEligible({})).toBe(true);
      expect(isTrialEligible({ status: null })).toBe(true);
      expect(isTrialEligible({ status: "none" })).toBe(true);
      expect(isTrialEligible({ status: "active" })).toBe(false);
      expect(isTrialEligible({ status: "canceled" })).toBe(false);
    });
  });
});

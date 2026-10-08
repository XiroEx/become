/* eslint-disable import/first */
// NP-164 — DECIDE THE GUIDED TOUR ON NATIVE ONCE THE WEB'S DECLINE-THE-TUTORIAL CHANGE SHIPS
//
// Acceptance criteria, each asserted under its id:
//
//   (id: e015ca58) The decision is recorded, and no native screen waits on tour state
//     - The decision is recorded in expo/gap_analysis/PARITY_GAP_ANALYSIS.md (Section 11 Question 12,
//       Section 5 Side-by-side matrix, Section 7 Tier 3 Web-only table, Section 10 Risks).
//     - Jon's decision (choice b: a short native coach-mark tour through each main hub with
//       an explicit decline option) is recorded.
//     - No native screen waits on tour state: no route in expo/app imports @redbtn/redtutorial,
//       onboardingSettled, or holds screen display behind tour completion.
//
//   (id: e015ca59) If a native tour is chosen, it is carded with its own progress key and never
//     writes the web tour's progress
//     - The native tour is carded as NP-207 in PARITY_GAP_ANALYSIS.md (Wave 4, Store v1: no, Size M, P3)
//       and specified in expo/gap_analysis/NP-207-native-guided-tour.md.
//     - Uses its own progress key ("native-onboarding") strictly separate from web ("become-onboarding").
//     - Contract guard rejects any native write to the web tour's progress key.
//     - Upfront decline option ("nah I'm good") is specified so the tour is not annoying.

import * as fs from "fs";
import * as path from "path";
import {
  WEB_TOUR_PROGRESS_KEY,
  NATIVE_TOUR_PROGRESS_KEY,
  NATIVE_TOUR_HUBS,
  NP_207_CARD,
  canWriteNativeTourProgress,
  assertValidNativeTourProgressKey,
} from "../lib/tour/tourConfig";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GAP_ANALYSIS_PATH = path.resolve(
  __dirname,
  "..",
  "gap_analysis",
  "PARITY_GAP_ANALYSIS.md",
);
const CARD_SPEC_PATH = path.resolve(
  __dirname,
  "..",
  "gap_analysis",
  "NP-207-native-guided-tour.md",
);

describe("NP-164 — Guided tour decision on native", () => {
  describe("(id: e015ca58) The decision is recorded, and no native screen waits on tour state", () => {
    it("records Jon's decision (choice b) in PARITY_GAP_ANALYSIS.md", () => {
      expect(fs.existsSync(GAP_ANALYSIS_PATH)).toBe(true);
      const gapAnalysis = fs.readFileSync(GAP_ANALYSIS_PATH, "utf8");

      // Question 12 is answered with Jon's decision (choice b).
      expect(gapAnalysis).toMatch(
        /12\.\s+Answered\s+10\/8\s+\(Jon,\s+NP-164\):\s+choice\s+\(b\)/i,
      );
      expect(gapAnalysis).toMatch(
        /short native coach-mark tour with its own progress key/i,
      );
      expect(gapAnalysis).toMatch(
        /bring(?:s)? the member through each main hub of our app/i,
      );
      expect(gapAnalysis).toMatch(/choice to decline/i);

      // Section 5 matrix and Section 7 Tier 3 table reference the decision and NP-207.
      expect(gapAnalysis).toMatch(
        /\|\s*Guided tour\s*\|.*Decided.*choice \(b\).*NP-164,\s*NP-207\s*\|/,
      );

      // Web surfaces moving notes the decision.
      expect(gapAnalysis).toMatch(
        /NP-164 decided.*Jon chose \(b\) short native hub tour with decline.*NP-207/,
      );
    });

    it("ensures no native screen or route imports web tutorial machinery or waits on tour state", () => {
      const appDir = path.resolve(__dirname, "..", "app");
      const files: string[] = [];

      function walk(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
            files.push(fullPath);
          }
        }
      }

      walk(appDir);
      expect(files.length).toBeGreaterThan(10);

      for (const filePath of files) {
        const content = fs.readFileSync(filePath, "utf8");
        // No native route should import the web DOM spotlight library
        expect(content).not.toContain("@redbtn/redtutorial");
        // No native route should import web onboardingSettled gate
        expect(content).not.toContain("onboardingSettled");
        // No native route should query or wait on /api/tutorial-progress
        expect(content).not.toContain("/api/tutorial-progress");
      }
    });

    it("verifies native dashboard check-in and program nudge do not wait on tour state", () => {
      const dashboardPath = path.resolve(
        __dirname,
        "..",
        "app",
        "(app)",
        "(tabs)",
        "dashboard",
        "index.tsx",
      );
      const dashboardContent = fs.readFileSync(dashboardPath, "utf8");

      // Native check-in prompts directly on checkin.data?.due, gating only on active program/nudge
      expect(dashboardContent).toMatch(/checkin\.data\?\.due/);
      expect(dashboardContent).not.toMatch(/tourWasSettled/);
      expect(dashboardContent).not.toMatch(/tutorialBusy/);
      expect(dashboardContent).not.toMatch(/useTutorial/);
    });
  });

  describe("(id: e015ca59) If a native tour is chosen, it is carded with its own progress key and never writes the web tour's progress", () => {
    it("cards the native tour as NP-207 in PARITY_GAP_ANALYSIS.md", () => {
      const gapAnalysis = fs.readFileSync(GAP_ANALYSIS_PATH, "utf8");

      // Appended to ticket index
      expect(gapAnalysis).toMatch(
        /\|\s*\[NP-207\]\(https:\/\/board\.redbtn\.io\/b\/6a70c4ea2fff468f8e253a89\?card=6abb12652379586ae015ca57\)\s*\|\s*4\s*\|\s*no\s*\|\s*M\s*\|\s*P3\s*\|\s*Short native coach-mark tour through the main hubs with decline option and separate progress key\s*\|\s*Native onboarding, the guided tour and the post-onboarding trial\s*\|/,
      );

      // Added to Wave 4 tickets list
      expect(gapAnalysis).toMatch(/Tickets:.*NP-164,.*NP-207/);
    });

    it("has a detailed card specification document for NP-207", () => {
      expect(fs.existsSync(CARD_SPEC_PATH)).toBe(true);
      const cardSpec = fs.readFileSync(CARD_SPEC_PATH, "utf8");

      expect(cardSpec).toMatch(/# NP-207 — Short Native Coach-Mark Tour Through Main Hubs/);
      expect(cardSpec).toMatch(/Wave:\*\* 4/);
      expect(cardSpec).toMatch(/Store v1:\*\* no/);
      expect(cardSpec).toMatch(/Size:\*\* M/);
      expect(cardSpec).toMatch(/Priority:\*\* P3/);
      expect(cardSpec).toMatch(/native-onboarding/);
      expect(cardSpec).toMatch(/become-onboarding/);
      expect(cardSpec).toMatch(/nah I'm good/i);
    });

    it("defines a separate native tour progress key distinct from web", () => {
      expect(NATIVE_TOUR_PROGRESS_KEY).toBe("native-onboarding");
      expect(WEB_TOUR_PROGRESS_KEY).toBe("become-onboarding");
      expect(NATIVE_TOUR_PROGRESS_KEY).not.toBe(WEB_TOUR_PROGRESS_KEY);
      expect(NP_207_CARD.progressKey).toBe(NATIVE_TOUR_PROGRESS_KEY);
      expect(NP_207_CARD.webProgressKey).toBe(WEB_TOUR_PROGRESS_KEY);
    });

    it("strictly forbids writing the web tour's progress key from native", () => {
      // canWriteNativeTourProgress returns false for web key
      expect(canWriteNativeTourProgress(WEB_TOUR_PROGRESS_KEY)).toBe(false);
      expect(canWriteNativeTourProgress(NATIVE_TOUR_PROGRESS_KEY)).toBe(true);

      // assertValidNativeTourProgressKey throws on web key
      expect(() => {
        assertValidNativeTourProgressKey(WEB_TOUR_PROGRESS_KEY);
      }).toThrow(/Violation of NP-164: Native must never write web tour progress key/);

      // assertValidNativeTourProgressKey passes on native key
      expect(() => {
        assertValidNativeTourProgressKey(NATIVE_TOUR_PROGRESS_KEY);
      }).not.toThrow();
    });

    it("covers each main hub of the app with an upfront choice to decline", () => {
      expect(NP_207_CARD.allowsDecline).toBe(true);
      expect(NP_207_CARD.blocksScreens).toBe(false);

      const hubIds = NATIVE_TOUR_HUBS.map((h) => h.id);
      expect(hubIds).toContain("dashboard");
      expect(hubIds).toContain("programming");
      expect(hubIds).toContain("nutrition");
      expect(hubIds).toContain("mind");
      expect(hubIds).toContain("profile");
    });
  });
});

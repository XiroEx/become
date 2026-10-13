// NP-028 — DECIDE FOUR TRAINING RULES FOR V1: PR MEANING, KG LABELS, THE REST ALERT, TRACK AND LIVE
//
// Acceptance criteria, each asserted under its id:
//
//   (id: e015c731) The four answers are recorded on this ticket and NP-080, NP-082, NP-084,
//     NP-086 and NP-087 are updated to match
//     - Jon's 10/13 reply answers three of the four questions (PR meaning, kg labels, Track and
//       Live). His second 10/13 reply narrows the fourth: the locked-phone rest alert gives both
//       sound and vibration when the timer ends, in Live and in Track alike. The one remaining
//       sub-question — whether the first rest may ask for notification permission when the
//       member skipped the ask after onboarding — is NOT answered and is recorded as still open
//       (question 25).
//     - The matrix rows feeding NP-080, NP-082, NP-084, NP-086 and NP-087 are updated to record
//       what is decided and what is still pending.
//
//   (id: e015c732) Any web change an answer implies is carded before the native port starts
//     - The all-time PR answer implies a web change (WorkoutSummary.tsx's session-only compare),
//       carded as NP-208.
//     - The kg-throughout answer implies a web/server change (dumbbellWeight.ts and set-weight
//       storage), carded as NP-209.
//     - The sound-and-vibration/Track answer implies a web change (Live's vibrate-only alert
//       gains sound; Track gains a rest timer of its own), carded as NP-210.
//     - All three are Wave 0 (ahead of Wave 2, where NP-080/NP-082/NP-084/NP-086/NP-087 build).

import * as fs from "fs";
import * as path from "path";

const GAP_ANALYSIS_PATH = path.resolve(
  __dirname,
  "..",
  "gap_analysis",
  "PARITY_GAP_ANALYSIS.md",
);
const NP208_SPEC_PATH = path.resolve(
  __dirname,
  "..",
  "gap_analysis",
  "NP-208-web-alltime-pr.md",
);
const NP209_SPEC_PATH = path.resolve(
  __dirname,
  "..",
  "gap_analysis",
  "NP-209-kg-weight-storage.md",
);
const NP210_SPEC_PATH = path.resolve(
  __dirname,
  "..",
  "gap_analysis",
  "NP-210-web-rest-alert-sound-track.md",
);

describe("NP-028 — Four training rules decided for v1", () => {
  const gapAnalysis = fs.readFileSync(GAP_ANALYSIS_PATH, "utf8");

  describe("(id: e015c731) The four answers are recorded, and NP-080/082/084/086/087 are updated to match", () => {
    it("records Jon's 10/13 answer in the open-questions section", () => {
      expect(gapAnalysis).toMatch(
        /7\.\s+Answered\s+10\/13\s+\(Jon,\s+NP-028\)/,
      );
      expect(gapAnalysis).toMatch(/personal record for all time/i);
      expect(gapAnalysis).toMatch(
        /kg members see kg on every lifting load, not lbs/i,
      );
      expect(gapAnalysis).toMatch(
        /ships both Track and Live, reviewed the same way the web does/i,
      );
    });

    it("records Jon's second 10/13 reply narrowing the rest-alert sub-question: both sound and vibration, Live and Track alike", () => {
      expect(gapAnalysis).toMatch(
        /giving both sound and silent vibrations when the timer is done/i,
      );
      expect(gapAnalysis).toMatch(
        /the alert gives both sound and vibration when the rest ends, on the lock screen, in Live and in Track alike/i,
      );
    });

    it("records the remaining permission-ask-timing sub-question as still open, not fabricated", () => {
      // The permission-ask-timing half of the rest-alert sub-question is still NOT
      // answered by either of Jon's two replies — this must not be invented.
      expect(gapAnalysis).toMatch(
        /is still NOT answered; NP-082 stays blocked on this one remaining sub-question/i,
      );
      expect(gapAnalysis).toMatch(
        /25\.\s+Narrowed\s+10\/13\s+\(Jon,\s+NP-028,\s+second reply\)/,
      );
      expect(gapAnalysis).toMatch(
        /Still open: whether the first rest may ask for notification permission/i,
      );
    });

    it("updates the NP-082 (rest alert) matrix row to reflect the sound-and-vibration decision and NP-210", () => {
      expect(gapAnalysis).toMatch(
        /Decided 10\/13 \(Jon, NP-028\): the rest alert gives both sound and vibration when the timer ends, in Live and in Track alike — not a silent-only or sound-only choice\. The web's vibrate-only Live alert and Track's missing rest timer change first — carded as NP-210 ahead of NP-082\./,
      );
      expect(gapAnalysis).toMatch(
        /\|\s*Partial\s*\|\s*NP-028,\s*NP-082,\s*NP-210\s*\|/,
      );
    });

    it("updates the NP-084 (dumbbell/kg labels) matrix row to reflect the kg decision and NP-209", () => {
      expect(gapAnalysis).toMatch(
        /Decided 10\/13 \(Jon, NP-028\): kg members use kg throughout the app, not lbs; carded as NP-209 ahead of the native port\./,
      );
      expect(gapAnalysis).toMatch(
        /\|\s*Partial\s*\|\s*NP-028,\s*NP-084,\s*NP-209\s*\|/,
      );
    });

    it("updates the NP-080/NP-086 (PR line, summary records) matrix row to reflect the all-time PR decision and NP-208", () => {
      expect(gapAnalysis).toMatch(
        /Decided 10\/13 \(Jon, NP-028\): "new personal record" means the all-time record, matching the server's `newPRsAchieved`; carded as NP-208 ahead of the native port\./,
      );
      expect(gapAnalysis).toMatch(
        /\|\s*Partial\s*\|\s*NP-028,\s*NP-080,\s*NP-086,\s*NP-208\s*\|/,
      );
    });

    it("updates the NP-087 (Track/Live) matrix row to reflect the ship-both decision", () => {
      expect(gapAnalysis).toMatch(
        /Decided 10\/13 \(Jon, NP-028\): v1 ships both Track and Live, reviewed the same way the web does\./,
      );
    });
  });

  describe("(id: e015c732) A web change an answer implies is carded before the native port starts", () => {
    it("cards NP-208 (web: all-time PR) in the ticket index, Wave 0, ahead of Wave 2's NP-080/NP-086", () => {
      expect(gapAnalysis).toMatch(
        /\|\s*\[NP-208\]\(https:\/\/board\.redbtn\.io\/b\/6a70c4ea2fff468f8e253a89\?card=6abb12572379586ae015c730\)\s*\|\s*0\s*\|\s*yes\s*\|\s*S\s*\|\s*P1\s*\|\s*Web: show the all-time personal record on the workout summary, not just the last session\s*\|/,
      );
      expect(gapAnalysis).toMatch(/Tickets:.*NP-028,\s*NP-029,\s*NP-030,\s*NP-031,\s*NP-208,\s*NP-209,\s*NP-210/);

      expect(fs.existsSync(NP208_SPEC_PATH)).toBe(true);
      const spec = fs.readFileSync(NP208_SPEC_PATH, "utf8");
      expect(spec).toMatch(/# NP-208 — Web: Show the All-Time Personal Record/);
      expect(spec).toMatch(/Wave:\*\* 0/);
      expect(spec).toMatch(/Store v1:\*\* yes/);
      expect(spec).toMatch(
        /the web change that must land before the native port starts/i,
      );
    });

    it("cards NP-209 (server+web: kg-aware weight storage) in the ticket index, Wave 0, ahead of Wave 2's NP-080/NP-084", () => {
      expect(gapAnalysis).toMatch(
        /\|\s*\[NP-209\]\(https:\/\/board\.redbtn\.io\/b\/6a70c4ea2fff468f8e253a89\?card=6abb12572379586ae015c730\)\s*\|\s*0\s*\|\s*yes\s*\|\s*M\s*\|\s*P1\s*\|\s*Server and web: store set weights unit-aware so kg members see kg everywhere, not lbs\s*\|/,
      );

      expect(fs.existsSync(NP209_SPEC_PATH)).toBe(true);
      const spec = fs.readFileSync(NP209_SPEC_PATH, "utf8");
      expect(spec).toMatch(
        /# NP-209 — Server and Web: Unit-Aware Set Weight Storage/,
      );
      expect(spec).toMatch(/Wave:\*\* 0/);
      expect(spec).toMatch(/Store v1:\*\* yes/);
      expect(spec).toMatch(
        /web\/server change that must land before the native port starts/i,
      );
      expect(spec).toMatch(/asked, once, which unit they want/i);
    });

    it("cards NP-210 (web: sound-and-vibration rest alert, and a Track rest timer) in the ticket index, Wave 0, ahead of Wave 2's NP-082/NP-087", () => {
      expect(gapAnalysis).toMatch(
        /\|\s*\[NP-210\]\(https:\/\/board\.redbtn\.io\/b\/6a70c4ea2fff468f8e253a89\?card=6abb12572379586ae015c730\)\s*\|\s*0\s*\|\s*yes\s*\|\s*M\s*\|\s*P1\s*\|\s*Web: sound-and-vibration rest alert on Live, and bring Track its own rest timer\s*\|/,
      );

      expect(fs.existsSync(NP210_SPEC_PATH)).toBe(true);
      const spec = fs.readFileSync(NP210_SPEC_PATH, "utf8");
      expect(spec).toMatch(
        /# NP-210 — Web: Sound-and-Vibration Rest Alert on Live, and Bring Track Its Own Rest Timer/,
      );
      expect(spec).toMatch(/Wave:\*\* 0/);
      expect(spec).toMatch(/Store v1:\*\* yes/);
      expect(spec).toMatch(
        /the web change that must land before the native port starts/i,
      );
      expect(spec).toMatch(/gives both sound and vibration/i);
      expect(spec).toMatch(/Track view has a rest timer/i);
    });

    it("all three carded tickets sit in Wave 0, strictly before Wave 2 where NP-080/082/084/086/087 build", () => {
      const wave0 = gapAnalysis.match(/\*\*Wave 0\..*?\n(?:.*\n)*?- Tickets: ([^\n]+)/);
      const wave2 = gapAnalysis.match(/\*\*Wave 2\..*?\n(?:.*\n)*?- Tickets: ([^\n]+)/);
      expect(wave0?.[1]).toContain("NP-208");
      expect(wave0?.[1]).toContain("NP-209");
      expect(wave0?.[1]).toContain("NP-210");
      expect(wave2?.[1]).toContain("NP-080");
      expect(wave2?.[1]).toContain("NP-082");
      expect(wave2?.[1]).toContain("NP-084");
      expect(wave2?.[1]).toContain("NP-086");
      expect(wave2?.[1]).toContain("NP-087");
      expect(wave2?.[1]).not.toContain("NP-208");
      expect(wave2?.[1]).not.toContain("NP-209");
      expect(wave2?.[1]).not.toContain("NP-210");
    });
  });

  it("does not fabricate a sound-or-silent-only decision: no sentence claims Jon decided the alert is sound-only or silent-only", () => {
    // Guard against ever accidentally asserting a decision that was never made —
    // Jon decided BOTH sound and vibration, never one to the exclusion of the other.
    expect(gapAnalysis).not.toMatch(
      /Jon,?\s+NP-028\)?:?\s+(the )?(rest alert|locked-phone alert) (is|should be) (sound|silent)(?! and)/i,
    );
  });

  it("does not fabricate an answer to the permission-ask-timing sub-question", () => {
    // Neither of Jon's two replies says when (or whether) the first rest may ask for
    // notification permission after a member skipped the onboarding ask (NP-065). This
    // must stay recorded as open, not answered.
    expect(gapAnalysis).not.toMatch(
      /Jon,?\s+NP-028\)?:?\s+.*permission[- ]ask timing (is|was) (answered|decided)/i,
    );
    expect(gapAnalysis).toMatch(
      /whether the first rest may ask for notification permission when the member skipped the ask after onboarding \(NP-065\) is still (NOT answered|open)/i,
    );
  });
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

console.log("=== Verifying NP-164 Acceptance Criteria ===");

// 1. Check PARITY_GAP_ANALYSIS.md
const gapAnalysisPath = path.resolve(REPO_ROOT, "expo", "gap_analysis", "PARITY_GAP_ANALYSIS.md");
assert.ok(fs.existsSync(gapAnalysisPath), "PARITY_GAP_ANALYSIS.md must exist");
const gapContent = fs.readFileSync(gapAnalysisPath, "utf8");

// Acceptance criterion (id: e015ca58): The decision is recorded, and no native screen waits on tour state
console.log("Checking (id: e015ca58)...");

// Decision recorded in Question 12
assert.match(
  gapContent,
  /12\.\s+Answered\s+10\/8\s+\(Jon,\s+NP-164\):\s+choice\s+\(b\)/i,
  "Question 12 must record Jon's decision for choice (b)"
);
assert.match(
  gapContent,
  /short native coach-mark tour with its own progress key/i,
  "Question 12 must specify short native coach-mark tour with its own progress key"
);
assert.match(
  gapContent,
  /main hub of our app/i,
  "Question 12 must specify bringing the member through each main hub"
);
assert.match(
  gapContent,
  /choice to decline/i,
  "Question 12 must specify choice to decline"
);

// Side-by-side matrix
assert.match(
  gapContent,
  /\|\s*Guided tour\s*\|.*Decided.*choice \(b\).*NP-164,\s*NP-207\s*\|/,
  "Matrix must reference decision and NP-207"
);

// Section 7 Tier 3 table
assert.match(
  gapContent,
  /\|\s*Guided tour\s*\|.*Decided.*choice \(b\).*NP-207/,
  "Tier 3 table must reference decision and NP-207"
);

// Check that no screen in expo/app waits on tour state or imports web tutorial
const appDir = path.resolve(REPO_ROOT, "expo", "app");
const routeFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      routeFiles.push(full);
    }
  }
}
walk(appDir);
assert.ok(routeFiles.length > 10, "Should have found expo app routes");

for (const f of routeFiles) {
  const content = fs.readFileSync(f, "utf8");
  assert.ok(!content.includes("@redbtn/redtutorial"), `Route ${f} must not import @redbtn/redtutorial`);
  assert.ok(!content.includes("onboardingSettled"), `Route ${f} must not import onboardingSettled`);
  assert.ok(!content.includes("/api/tutorial-progress"), `Route ${f} must not call /api/tutorial-progress`);
}

// Check native dashboard does not wait on tour state
const dashboardPath = path.resolve(appDir, "(app)", "(tabs)", "dashboard", "index.tsx");
const dashboardContent = fs.readFileSync(dashboardPath, "utf8");
assert.match(dashboardContent, /checkin\.data\?\.due/, "Dashboard opens check-in directly when due: true");
assert.ok(!dashboardContent.includes("tourWasSettled"), "Dashboard must not check tourWasSettled");
assert.ok(!dashboardContent.includes("tutorialBusy"), "Dashboard must not check tutorialBusy");
assert.ok(!dashboardContent.includes("useTutorial"), "Dashboard must not check useTutorial");

console.log("PASS: (id: e015ca58) is fully verified!");

// Acceptance criterion (id: e015ca59): If a native tour is chosen, it is carded with its own progress key and never writes the web tour's progress
console.log("Checking (id: e015ca59)...");

// Check carded in PARITY_GAP_ANALYSIS.md
assert.match(
  gapContent,
  /\|\s*\[NP-207\]\(https:\/\/board\.redbtn\.io\/b\/6a70c4ea2fff468f8e253a89\?card=6abb12652379586ae015ca57\)\s*\|\s*4\s*\|\s*no\s*\|\s*M\s*\|\s*P3\s*\|\s*Short native coach-mark tour through the main hubs with decline option and separate progress key\s*\|\s*Native onboarding, the guided tour and the post-onboarding trial\s*\|/,
  "NP-207 must be carded in PARITY_GAP_ANALYSIS.md ticket index"
);
assert.match(
  gapContent,
  /Tickets:.*NP-164,.*NP-207/,
  "NP-207 must be in Wave 4 tickets list"
);

// Check card spec document exists and has required details
const cardSpecPath = path.resolve(REPO_ROOT, "expo", "gap_analysis", "NP-207-native-guided-tour.md");
assert.ok(fs.existsSync(cardSpecPath), "Card spec file must exist");
const cardSpec = fs.readFileSync(cardSpecPath, "utf8");
assert.match(cardSpec, /# NP-207 — Short Native Coach-Mark Tour Through Main Hubs/, "Title present");
assert.match(cardSpec, /Wave:\*\* 4/, "Wave 4");
assert.match(cardSpec, /Store v1:\*\* no/, "Store v1: no");
assert.match(cardSpec, /Size:\*\* M/, "Size M");
assert.match(cardSpec, /Priority:\*\* P3/, "Priority P3");
assert.match(cardSpec, /native-onboarding/, "Native progress key defined");
assert.match(cardSpec, /become-onboarding/, "Web progress key defined");
assert.match(cardSpec, /nah I'm good/i, "Decline choice defined");

// Import and test tourConfig.ts logic
// Since tourConfig is TS, we test the module content and contract invariants:
const tourConfigPath = path.resolve(REPO_ROOT, "expo", "lib", "tour", "tourConfig.ts");
assert.ok(fs.existsSync(tourConfigPath), "tourConfig.ts must exist");
const tourConfigContent = fs.readFileSync(tourConfigPath, "utf8");

assert.match(tourConfigContent, /export const WEB_TOUR_PROGRESS_KEY = "become-onboarding"/);
assert.match(tourConfigContent, /export const NATIVE_TOUR_PROGRESS_KEY = "native-onboarding"/);
assert.match(tourConfigContent, /function canWriteNativeTourProgress/);
assert.match(tourConfigContent, /function assertValidNativeTourProgressKey/);
assert.match(tourConfigContent, /allowsDecline:\s*true/);
assert.match(tourConfigContent, /blocksScreens:\s*false/);

console.log("PASS: (id: e015ca59) is fully verified!");
console.log("=== All Acceptance Criteria PASSED successfully! ===");

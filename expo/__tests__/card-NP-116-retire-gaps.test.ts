// NP-116 — RETIRE expo/gap_analysis/GAPS.md
//
// Acceptance criteria:
//   (id: 96d40d39) Every surface row in GAPS.md is checked against main, and each is either folded into PARITY_GAP_ANALYSIS.md section 7 or dropped with the evidence named in the PR body
//   (id: 96d40d3a) expo/gap_analysis/GAPS.md and expo/__tests__/gaps.test.ts are deleted
//   (id: 96d40d3b) No file in the repo still points a reader at GAPS.md (grep is clean)
//   (id: 96d40d3c) expo typecheck, lint and Jest are green with the format test removed

import * as fs from "fs";
import * as path from "path";
import {
  NATIVE_BUILDER_HAS_EXERCISE_ROWS,
  programCreateDestination,
  programEditDestination,
} from "../lib/programs/customPrograms";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OLD_GAPS_PATH = path.resolve(REPO_ROOT, "expo", "gap_analysis", "GAPS.md");
const OLD_TEST_PATH = path.resolve(REPO_ROOT, "expo", "__tests__", "gaps.test.ts");
const PARITY_GAP_PATH = path.resolve(REPO_ROOT, "expo", "gap_analysis", "PARITY_GAP_ANALYSIS.md");

describe("NP-116: Retire GAPS.md and format test", () => {
  it("(id: 96d40d3a) GAPS.md and gaps.test.ts are deleted", () => {
    expect(fs.existsSync(OLD_GAPS_PATH)).toBe(false);
    expect(fs.existsSync(OLD_TEST_PATH)).toBe(false);
  });

  it("(id: 96d40d3b) No file points a reader at the deleted GAPS.md path", () => {
    const filesToCheck = [
      path.resolve(REPO_ROOT, "expo", "lib", "dev", "devOnlyRoute.tsx"),
      path.resolve(REPO_ROOT, "expo", "gap_analysis", "PARITY_GAP_ANALYSIS.md"),
      path.resolve(REPO_ROOT, "NATIVE_MVP_PLAN.md"),
      path.resolve(REPO_ROOT, "HEALTH_INTEGRATIONS_DISCOVERY.md"),
    ];

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, "utf8");
      expect(content).not.toMatch(/GAPS\.md/i);
    }
  });

  it("(id: 96d40d39) Section 7 of PARITY_GAP_ANALYSIS.md preserves active Tier 3 deferrals", () => {
    const content = fs.readFileSync(PARITY_GAP_PATH, "utf8");
    const section7 = content.split("## 7. Web-only (Tier 3) decisions")[1]?.split("## 8. What only native can do")[0];
    expect(section7).toBeDefined();

    // The 4 still-true Tier 3 editor/admin surfaces are folded in with URLs, reasons, Tier 3 and permanent revisit:
    expect(section7).toContain("Admin program editor / catalog builder");
    expect(section7).toContain("https://become.redbtn.io/dashboard/admin/programs/[programId]/edit");
    expect(section7).toContain("Exercise editor + video upload");
    expect(section7).toContain("Admin food review");
    expect(section7).toContain("Admin user / cohort tooling");
  });

  it("(id: 96d40d39) Member program builder is verified native on main, disproving the stale GAPS.md claim", () => {
    expect(NATIVE_BUILDER_HAS_EXERCISE_ROWS).toBe(true);
    expect(programCreateDestination()).toEqual({
      surface: "native",
      route: "/(tabs)/programming/new",
    });
    expect(programEditDestination("test-123")).toEqual({
      surface: "native",
      route: "/(tabs)/programming/test-123/edit",
    });
  });

  it("(id: 96d40d39) Native recipe create and edit routes are present, disproving deferral", () => {
    const recipeNewRoute = path.resolve(REPO_ROOT, "expo", "app", "(app)", "(tabs)", "nutrition", "recipes", "new.tsx");
    const recipeEditRoute = path.resolve(REPO_ROOT, "expo", "app", "(app)", "(tabs)", "nutrition", "recipes", "[id]", "edit.tsx");
    expect(fs.existsSync(recipeNewRoute)).toBe(true);
    expect(fs.existsSync(recipeEditRoute)).toBe(true);
  });
});

import * as fs from "fs";
import * as path from "path";

const GAPS_PATH = path.resolve(__dirname, "..", "gap_analysis", "GAPS.md");

describe("GAPS.md catalog", () => {
  it("is committed at expo/gap_analysis/GAPS.md", () => {
    expect(fs.existsSync(GAPS_PATH)).toBe(true);
  });

  it("lists ≥6 deferred surfaces", () => {
    const md = fs.readFileSync(GAPS_PATH, "utf8");
    // Each surface row starts with "| **<name>** |".
    const rows = md.match(/^\| \*\*[^*]+\*\* \|/gm) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(6);
  });

  it("every surface row references a https://become.redbtn.io URL or 'n/a' for native-only surfaces", () => {
    const md = fs.readFileSync(GAPS_PATH, "utf8");
    const surfaceLines = md
      .split("\n")
      .filter((l) => /^\| \*\*[^*]+\*\* \|/.test(l));
    for (const line of surfaceLines) {
      const hasUrl = line.includes("become.redbtn.io");
      const hasNa = /\| n\/a/i.test(line);
      expect(hasUrl || hasNa).toBe(true);
    }
  });

  it("every surface row declares a Tier classification (1/2/3)", () => {
    const md = fs.readFileSync(GAPS_PATH, "utf8");
    const surfaceLines = md
      .split("\n")
      .filter((l) => /^\| \*\*[^*]+\*\* \|/.test(l));
    for (const line of surfaceLines) {
      expect(line).toMatch(/Tier [123]/);
    }
  });

  it("every surface row declares a revisit date or 'permanent'", () => {
    const md = fs.readFileSync(GAPS_PATH, "utf8");
    const surfaceLines = md
      .split("\n")
      .filter((l) => /^\| \*\*[^*]+\*\* \|/.test(l));
    for (const line of surfaceLines) {
      const hasPermanent = /permanent/i.test(line);
      const hasDate = /\d{4}-\d{2}-\d{2}/.test(line);
      const hasRevisitClause = /when /i.test(line);
      expect(hasPermanent || hasDate || hasRevisitClause).toBe(true);
    }
  });
});

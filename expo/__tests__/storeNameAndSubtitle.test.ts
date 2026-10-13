// The store name and subtitle (card 6ab02826).
//
// `STORE_LISTING.md` is the source of truth for four strings that are typed
// into a browser, not compiled: the App Store name, the Play app name, the iOS
// subtitle and the Play short description. Nothing else in the repo can catch a
// copy edit that puts one of them over a store limit — App Store Connect and
// Play Console would, at submission, which is the most expensive place to find
// out.
//
// So this file re-derives every character count in that document from the
// strings themselves, re-checks each against its store's limit, and holds the
// invariants the card actually asks for: 30 characters or fewer, the same name
// on both stores, a name that still reads as "Become", and a home-screen label
// that still matches `app.json`.
//
// It deliberately does NOT assert that the name has been reserved or that Jon
// has signed off. Neither is a fact a test can know; both live in the sign-off
// table in the document, filled in by the human who did it.

import * as fs from "fs";
import * as path from "path";

const EXPO_DIR = path.resolve(__dirname, "..");
const DOC_PATH = path.join(EXPO_DIR, "STORE_LISTING.md");
const RELEASE_PATH = path.join(EXPO_DIR, "RELEASE.md");
const APP_JSON_PATH = path.join(EXPO_DIR, "app.json");

const doc = fs.readFileSync(DOC_PATH, "utf8");
const releaseMd = fs.readFileSync(RELEASE_PATH, "utf8");
const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, "utf8")) as {
  expo: { name?: string };
};

/** Store-side hard limits. Both stores count characters, not bytes. */
const LIMITS = {
  appStoreName: 30,
  playAppName: 30,
  iosSubtitle: 30,
  playShortDescription: 80,
  /** Not a store limit — launchers truncate a home-screen label near here. */
  homeScreenLabel: 12,
} as const;

/** The body of a `## heading`, up to the next heading of the same level. */
function section(heading: string): string {
  const lines = doc.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) {
    throw new Error(`STORE_LISTING.md has no "## ${heading}" section`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** Every data row of the markdown tables in `body`, cells trimmed. */
function tableRows(body: string): string[][] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((cell) => /^:?-{2,}:?$/.test(cell)))
    .filter((cells) => !/^(Field|Order|Acceptance|Name)$/.test(cells[0] ?? ""));
}

/** Column `index` of a row, or a readable failure naming the row. */
function cell(cells: string[], index: number, where: string): string {
  const value = cells[index];
  if (value === undefined) {
    throw new Error(`${where}: no column ${index} in row "${cells.join(" | ")}"`);
  }
  return value;
}

/** A cell that holds exactly one backticked string, e.g. `` `Become` ``. */
function backticked(value: string, where: string): string {
  const match = /^`(.+)`$/.exec(value);
  if (!match?.[1]) {
    throw new Error(`${where}: expected a single \`backticked\` string, got "${value}"`);
  }
  return match[1];
}

/** The first integer in a limit cell ("30", "80", "~12", "45 / 12"). */
function limitOf(value: string, where: string): number {
  const match = /\d+/.exec(value);
  if (!match) throw new Error(`${where}: no number in limit cell "${value}"`);
  return Number(match[0]);
}

interface DecisionRow {
  field: string;
  limit: number;
  copy: string;
  printedCount: number;
}

const decisionRows: DecisionRow[] = tableRows(section("The decision")).map((cells) => {
  const where = `"The decision" row "${cells[0] ?? "?"}"`;
  if (cells.length !== 5) {
    throw new Error(`${where}: expected 5 columns (field, where, limit, copy, count)`);
  }
  return {
    field: cell(cells, 0, where),
    limit: limitOf(cell(cells, 2, where), where),
    copy: backticked(cell(cells, 3, where), where),
    printedCount: Number(cell(cells, 4, where)),
  };
});

function decision(field: string): DecisionRow {
  const row = decisionRows.find((candidate) => candidate.field === field);
  if (!row) {
    throw new Error(
      `"The decision" table has no "${field}" row (has: ${decisionRows
        .map((r) => r.field)
        .join(", ")})`,
    );
  }
  return row;
}

interface LadderRung {
  order: number;
  candidate: string;
  printedCount: number;
}

const ladder: LadderRung[] = tableRows(section("Try the names in this order")).map((cells) => {
  const where = `name ladder rung ${cells[0] ?? "?"}`;
  return {
    order: Number(cell(cells, 0, where)),
    candidate: backticked(cell(cells, 1, where), where),
    printedCount: Number(cell(cells, 2, where)),
  };
});

const appStoreName = decision("App Store name");
const playAppName = decision("Play app name");
const iosSubtitle = decision("iOS subtitle");
const playShortDescription = decision("Play short description");
const homeScreenLabel = decision("Home-screen label");

/** Words a store rejects, or that outlive their truth, in a name or subtitle. */
const BANNED = /\b(free|sale|discount|best|cheap|new|#1|no\.?\s?1|beta)\b/i;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

describe("STORE_LISTING.md: the decision table", () => {
  it("has a row for every field a submission has to fill", () => {
    expect(decisionRows.map((row) => row.field)).toEqual([
      "App Store name",
      "Play app name",
      "iOS subtitle",
      "Play short description",
      "Home-screen label",
    ]);
  });

  it("prints a character count that matches the string it is next to", () => {
    for (const row of decisionRows) {
      expect({ field: row.field, count: row.printedCount }).toEqual({
        field: row.field,
        count: row.copy.length,
      });
    }
  });

  it("keeps every string inside the limit printed beside it", () => {
    for (const row of decisionRows) {
      expect(row.copy.length).toBeLessThanOrEqual(row.limit);
    }
  });

  it("documents the real store limits, so the table cannot be relaxed", () => {
    expect(appStoreName.limit).toBe(LIMITS.appStoreName);
    expect(playAppName.limit).toBe(LIMITS.playAppName);
    expect(iosSubtitle.limit).toBe(LIMITS.iosSubtitle);
    expect(playShortDescription.limit).toBe(LIMITS.playShortDescription);
    expect(homeScreenLabel.limit).toBe(LIMITS.homeScreenLabel);
  });
});

describe("the name", () => {
  it("is 30 characters or fewer — the App Store Connect Name limit", () => {
    expect(appStoreName.copy.length).toBeGreaterThan(0);
    expect(appStoreName.copy.length).toBeLessThanOrEqual(LIMITS.appStoreName);
  });

  it("still reads as Become: the brand word comes first", () => {
    expect(appStoreName.copy.startsWith("Become")).toBe(true);
  });

  it("is the same string on Play, which the card requires", () => {
    expect(playAppName.copy).toBe(appStoreName.copy);
  });

  it("is one of the rungs of the ladder, so the fallback list stays current", () => {
    expect(ladder.map((rung) => rung.candidate)).toContain(appStoreName.copy);
  });

  it("carries no price, promotional word or emoji (Apple 2.3.7, Play title rules)", () => {
    expect(appStoreName.copy).not.toMatch(BANNED);
    expect(appStoreName.copy).not.toMatch(EMOJI);
  });
});

describe("the name ladder", () => {
  it("is numbered from 1 with no gaps", () => {
    expect(ladder.map((rung) => rung.order)).toEqual(
      ladder.map((_, index) => index + 1),
    );
  });

  it("starts with plain Become, because that is Jon's answer on the card", () => {
    expect(ladder[0]?.candidate).toBe("Become");
  });

  it("offers a real fallback list — at least three alternatives", () => {
    expect(ladder.length).toBeGreaterThanOrEqual(4);
  });

  it("holds the card's two rules on every rung: 30 or fewer, reads as Become", () => {
    for (const rung of ladder) {
      expect({ candidate: rung.candidate, length: rung.candidate.length }).toEqual({
        candidate: rung.candidate,
        length: rung.printedCount,
      });
      expect(rung.candidate.length).toBeLessThanOrEqual(LIMITS.appStoreName);
      expect(rung.candidate.startsWith("Become")).toBe(true);
      expect(rung.candidate).not.toMatch(BANNED);
      expect(rung.candidate).not.toMatch(EMOJI);
    }
  });

  it("lists each candidate once", () => {
    const candidates = ladder.map((rung) => rung.candidate);
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});

describe("the subtitle and the short description", () => {
  it("fits Apple's 30-character subtitle field", () => {
    expect(iosSubtitle.copy.length).toBeGreaterThan(0);
    expect(iosSubtitle.copy.length).toBeLessThanOrEqual(LIMITS.iosSubtitle);
  });

  it("fits Play's 80-character short description field", () => {
    expect(playShortDescription.copy.length).toBeGreaterThan(0);
    expect(playShortDescription.copy.length).toBeLessThanOrEqual(
      LIMITS.playShortDescription,
    );
  });

  it("spends no word twice across the name and the subtitle", () => {
    // Apple indexes the name and the subtitle together, so a word repeated
    // between them wastes part of 60 characters that cannot be bought back.
    const words = (text: string) =>
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2);
    const nameWords = new Set(words(appStoreName.copy));
    const repeated = words(iosSubtitle.copy).filter((word) => nameWords.has(word));
    expect(repeated).toEqual([]);
  });

  it("carries no price, promotional word or emoji", () => {
    for (const row of [iosSubtitle, playShortDescription]) {
      expect(row.copy).not.toMatch(BANNED);
      expect(row.copy).not.toMatch(EMOJI);
    }
  });
});

describe("the home-screen label is a different name, and did not change", () => {
  it("matches app.json's expo.name — the icon still says Become", () => {
    expect(appJson.expo.name).toBe("Become");
    expect(homeScreenLabel.copy).toBe(appJson.expo.name);
  });

  it("stays short enough that a launcher does not truncate it", () => {
    expect(homeScreenLabel.copy.length).toBeLessThanOrEqual(LIMITS.homeScreenLabel);
  });

  it("explains that the store name and the icon label are allowed to differ", () => {
    // Jon's question on the card. The answer has to stay in the document.
    expect(doc).toMatch(/CFBundleDisplayName/);
    expect(doc).toMatch(/App Store Connect → App Information → Name/);
  });
});

describe("the parts of the card no test can verify", () => {
  it("has a sign-off row for each of the card's three acceptance criteria", () => {
    const signOff = section("Sign-off");
    expect(signOff).toMatch(/reserved in App Store Connect/i);
    expect(signOff).toMatch(/Subtitle \(iOS\) and short description \(Play\)/i);
    expect(signOff).toMatch(/Jon has signed off on the name/i);
  });

  it("names the human step and what gates it", () => {
    const reserving = section("Reserving it");
    expect(reserving).toMatch(/6ab0281d/); // App Store Connect record + Team ID
    expect(reserving).toMatch(/6ab02822/); // Play Console record + App Signing
  });
});

describe("the release process points at this document", () => {
  it("links STORE_LISTING.md", () => {
    expect(releaseMd).toMatch(/STORE_LISTING\.md/);
  });

  it("has the name and subtitle on both store checklists, marked blocking", () => {
    const iosChecklist = releaseMd.slice(
      releaseMd.indexOf("## App Store Connect (iOS) checklist"),
      releaseMd.indexOf("## Play Console (Android) checklist"),
    );
    const playChecklist = releaseMd.slice(
      releaseMd.indexOf("## Play Console (Android) checklist"),
      releaseMd.indexOf("## Reviewer demo account"),
    );
    for (const checklist of [iosChecklist, playChecklist]) {
      expect(checklist).not.toHaveLength(0);
      const row = checklist
        .split("\n")
        .find((line) => line.includes("STORE_LISTING.md"));
      expect(row).toBeDefined();
      expect(row).toMatch(/\*\*Blocking\.\*\*/);
    }
  });
});

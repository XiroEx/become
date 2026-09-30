import * as fs from "fs";
import * as path from "path";

/**
 * NOT ONE COLOUR LITERAL LEFT (NP-123).
 *
 * The app was dark-only because 43 `#0a0a0a` literals sat in plain RN `style`
 * objects — a SafeAreaView, a Stack's `contentStyle`, a tab bar, a lucide
 * `color` prop, a modal backdrop — while the classes beside them followed the
 * system colour scheme. A phone in light mode drew light-mode TEXT on those
 * hard-coded dark surfaces.
 *
 * So the rule that keeps it fixed is not "remember the hook": it is that a hex
 * colour cannot exist in `app/`, `components/` or `lib/`. Every colour comes
 * from a Tailwind class or from `useThemeTokens()`, and both of those have two
 * values.
 *
 * COMMENTS ARE STRIPPED FIRST, on purpose: the notes that explain WHICH literal
 * was deleted (and why the light one is 240 points away) are worth keeping, and
 * a comment paints nothing. `lib/theme/tokens.ts` is the one place a colour
 * VALUE is written down, as an RGB triplet, twice — once per mode.
 *
 * ESLint carries the same ban (`eslint.config.mjs`,
 * `no-restricted-syntax`), so it also fails in the editor and in `npm run lint`.
 * This test is the one that runs in CI.
 */

const EXPO_DIR = path.resolve(__dirname, "..");
const SCANNED_DIRS = ["app", "components", "lib"];

/** Any CSS hex colour: #rgb, #rgba, #rrggbb, #rrggbbaa. */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])/;

/** `rgb(10 10 10)` / `rgba(0,0,0,.5)` written out by hand rather than derived. */
const LITERAL_RGB = /["'`]\s*rgba?\(\s*\d/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out.sort();
}

/** Strips `//` line comments and `/* *\/` blocks. Quotes are not code here:
 *  no source file in this app puts a `//` sequence inside a string literal, and
 *  a false STRIP could only ever hide a literal the other assertions catch. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const FILES = SCANNED_DIRS.flatMap((dir) =>
  sourceFiles(path.join(EXPO_DIR, dir)),
);

describe("no colour literal survives in the app's source", () => {
  it("scans the whole of app/, components/ and lib/", () => {
    // A walk that finds nothing would pass every assertion below.
    expect(FILES.length).toBeGreaterThan(150);
    expect(FILES.some((f) => f.includes(`${path.sep}app${path.sep}`))).toBe(true);
    expect(FILES.some((f) => f.includes(`components${path.sep}`))).toBe(true);
  });

  it("has no hex colour anywhere in the code", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const code = stripComments(fs.readFileSync(file, "utf8"));
      code.split("\n").forEach((line, i) => {
        if (HEX_COLOUR.test(line)) {
          offenders.push(`${path.relative(EXPO_DIR, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("has no hand-written rgb()/rgba() string either", () => {
    // `lib/theme/tokens.ts` is the exception: it is where the two palettes and
    // the scrim are written down, which is the whole point of a token file.
    const offenders: string[] = [];
    for (const file of FILES) {
      if (file.endsWith(path.join("lib", "theme", "tokens.ts"))) continue;
      const code = stripComments(fs.readFileSync(file, "utf8"));
      code.split("\n").forEach((line, i) => {
        if (LITERAL_RGB.test(line)) {
          offenders.push(`${path.relative(EXPO_DIR, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("would catch one if it came back", () => {
    // The regex, not the walk: proof that the assertion above can fail.
    expect(HEX_COLOUR.test('style={{ backgroundColor: "#0a0a0a" }}')).toBe(true);
    expect(HEX_COLOUR.test('backgroundColor: "#0008"')).toBe(true);
    expect(HEX_COLOUR.test('color="#a1a1aa"')).toBe(true);
    expect(LITERAL_RGB.test('backgroundColor: "rgba(0, 0, 0, 0.5)"')).toBe(true);
    // And that it does not fire on the things that are allowed.
    expect(HEX_COLOUR.test("backgroundColor: colors.background")).toBe(false);
    expect(HEX_COLOUR.test('className="bg-background"')).toBe(false);
    expect(HEX_COLOUR.test("`#${triplet}`")).toBe(false);
  });

  it("strips comments rather than banning the words in them", () => {
    const src = [
      "// it used to be #0a0a0a",
      "/* and #fafafa in a block */",
      'const a = "#123456";',
    ].join("\n");
    const code = stripComments(src);
    expect(code).not.toContain("#0a0a0a");
    expect(code).not.toContain("#fafafa");
    expect(HEX_COLOUR.test(code)).toBe(true);
  });
});

describe("ESLint bans them too", () => {
  const config = fs.readFileSync(path.join(EXPO_DIR, "eslint.config.mjs"), "utf8");

  it("carries a no-restricted-syntax rule for hex literals", () => {
    expect(config).toContain("no-restricted-syntax");
    expect(config).toMatch(/Literal\[value=\/\^#/);
  });

  it("points at the hook in the failure message", () => {
    expect(config).toContain("useThemeTokens");
  });
});

import * as fs from "fs";
import * as path from "path";
import { stripComments } from "./noHexColorLiterals.test";

/**
 * NO `style` CALLBACKS LEFT (NP-314).
 *
 * On RN 0.86.3 + NativeWind 4.2, a `Pressable` whose `style` prop is a
 * FUNCTION (`style={({ pressed }) => [...]}` / `=> ({...})`) renders with
 * NONE of those styles applied — on an Android S23 Ultra (One UI 7), the
 * children render and the container style does not. There were 9 such call
 * sites across 8 files, each broken on device despite passing in Jest (RN's
 * test renderer evaluates the callback as documented; the device runtime did
 * not): an invisible Mindset CTA, a stacked Up Next row, a Becoming door
 * drawn with no card/border/padding, a Training Log row and its "Correct
 * this workout" button, and the Personal Records rows.
 *
 * The fix is mechanical and the rule stays mechanical too: `style` is never a
 * function. Build a static array from `lib/a11y/usePressed()`'s boolean
 * instead. ESLint carries the same ban (`eslint.config.mjs`,
 * `no-restricted-syntax` on `JSXAttribute[name.name='style'] >
 * JSXExpressionContainer > ArrowFunctionExpression` / `FunctionExpression`);
 * this test is the one that runs in CI regardless of which lint config a
 * future refactor leaves in place.
 */

const EXPO_DIR = path.resolve(__dirname, "..");
const SCANNED_DIRS = ["app", "components", "lib"];

/**
 * `style={(` catches both arrow functions (`({ pressed }) => `) and plain
 * function expressions (`function ({ pressed }) {`) — anything that opens a
 * parameter list right after `style={`. A static array/object always opens
 * with `style={[` or `style={{` or `style={someIdentifier}`.
 */
const STYLE_CALLBACK = /style=\{\s*\(/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out.sort();
}

const FILES = SCANNED_DIRS.flatMap((dir) =>
  sourceFiles(path.join(EXPO_DIR, dir)),
);

describe("no Pressable/View style callback survives in the app's source", () => {
  it("scans the whole of app/, components/ and lib/", () => {
    expect(FILES.length).toBeGreaterThan(150);
  });

  it("has no `style={(...) => ...}` anywhere in the code", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const code = stripComments(fs.readFileSync(file, "utf8"));
      code.split("\n").forEach((line, i) => {
        if (STYLE_CALLBACK.test(line)) {
          offenders.push(`${path.relative(EXPO_DIR, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("would catch one if it came back", () => {
    expect(STYLE_CALLBACK.test("style={({ pressed }) => [styles.card]}")).toBe(true);
    expect(STYLE_CALLBACK.test("style={(pressed) => ({ opacity: 1 })}")).toBe(true);
    expect(STYLE_CALLBACK.test("style={ ({ pressed }) => [styles.card] }")).toBe(true);
    // And that it does not fire on the things that are allowed.
    expect(STYLE_CALLBACK.test("style={[styles.card, { opacity: pressed ? 0.85 : 1 }]}")).toBe(false);
    expect(STYLE_CALLBACK.test("style={styles.card}")).toBe(false);
    expect(STYLE_CALLBACK.test("style={{ opacity: 1 }}")).toBe(false);
  });
});

describe("ESLint bans them too", () => {
  const config = fs.readFileSync(path.join(EXPO_DIR, "eslint.config.mjs"), "utf8");

  it("carries a no-restricted-syntax rule for style callbacks", () => {
    expect(config).toContain("no-restricted-syntax");
    expect(config).toMatch(/JSXAttribute\[name\.name='style'\]/);
    expect(config).toContain("ArrowFunctionExpression");
    expect(config).toContain("FunctionExpression");
  });

  it("points at usePressed in the failure message", () => {
    expect(config).toContain("lib/a11y/usePressed()");
  });
});

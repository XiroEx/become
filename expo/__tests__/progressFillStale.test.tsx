/**
 * Jon, 2026-10-29: on a day with nothing logged, the macro bars kept the
 * previous day's colour. ProgressFill's worklet read the target from the JS
 * `pct` it captured when built, and was not rebuilt when `pct` changed, so it
 * animated toward the old value. It is now rebuilt on `pct` (dependency
 * array). The jest reanimated mock re-runs the style on every render anyway, so
 * this is pinned at the source.
 */
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(
  path.join(__dirname, "..", "components/motion/ProgressFill.tsx"),
  "utf8",
);


describe("ProgressFill follows pct down to zero", () => {
  it("the animated style is rebuilt whenever pct changes", () => {
    const start = src.indexOf("useAnimatedStyle(");
    const call = src.slice(start, src.indexOf(");", src.indexOf("}),", start)) + 2);
    expect(call).toContain("[clamped]");
  });

});

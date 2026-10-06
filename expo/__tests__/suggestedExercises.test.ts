// Native port of webapp/tests/unit/suggestedExercises.test.ts (NP-289): the
// "Add an exercise" sheet's suggestion list must use the same source, order
// and dedupe/limit rules as the web so the two apps never disagree about
// what the empty state shows for the same anchor exercise.
import {
  buildSuggestedExercises,
  type SuggestedCandidate,
} from "@/lib/workout/suggestedExercises";

const cand = (slug: string, name = slug): SuggestedCandidate => ({
  slug,
  name,
  trackingType: "reps_weight",
});

describe("buildSuggestedExercises", () => {
  it("returns an empty list for empty candidates", () => {
    expect(buildSuggestedExercises([], [])).toEqual([]);
  });

  it("drops exercises already in the workout", () => {
    const out = buildSuggestedExercises(
      [cand("incline-bench"), cand("flat-bench"), cand("cable-fly")],
      ["flat-bench"],
    );
    expect(out.map((c) => c.slug)).toEqual(["incline-bench", "cable-fly"]);
  });

  it("matches workout slugs case-insensitively", () => {
    const out = buildSuggestedExercises([cand("Flat-Bench")], ["flat-bench"]);
    expect(out).toEqual([]);
  });

  it("dedupes repeated candidate slugs", () => {
    const out = buildSuggestedExercises([cand("cable-fly"), cand("cable-fly")], []);
    expect(out.map((c) => c.slug)).toEqual(["cable-fly"]);
  });

  it("preserves the incoming (score) order", () => {
    const out = buildSuggestedExercises([cand("a"), cand("b"), cand("c")], []);
    expect(out.map((c) => c.slug)).toEqual(["a", "b", "c"]);
  });

  it("caps at the given limit", () => {
    const candidates = ["a", "b", "c", "d", "e"].map((s) => cand(s));
    const out = buildSuggestedExercises(candidates, [], 3);
    expect(out.map((c) => c.slug)).toEqual(["a", "b", "c"]);
  });

  it("defaults to a limit of 6", () => {
    const candidates = Array.from({ length: 10 }, (_, i) => cand(`ex-${i}`));
    const out = buildSuggestedExercises(candidates, []);
    expect(out).toHaveLength(6);
  });
});

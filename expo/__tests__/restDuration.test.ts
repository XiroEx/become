/**
 * THE ONE REST-DURATION RULE (NP-082, ported from the web's NP-210).
 *
 * The numbers below are the web's, case for case:
 * `webapp/lib/workout/restDuration.ts` (`parseRestTime`,
 * `getSmartRestDefault`, `getRestDuration`, `restGroupContext`) and the
 * cases in `webapp/tests/unit/restDuration.test.ts`. If native ever answers a
 * different number for the same exercise, the two apps rest differently for
 * the same set — which is exactly what PR #1962 removed on the web by
 * extracting this rule, and what this file stops native re-inventing.
 */
import {
  getRestDuration,
  getSmartRestDefault,
  parseRestSeconds,
  restAfterStep,
  restGroupContext,
} from "@/lib/live/restDuration";

describe("parseRestSeconds (the web's parseRestTime)", () => {
  it.each([
    ["90s", 90],
    ["60s", 60],
    ["120", 120],
    ["3min", 180],
    ["2 min", 120],
    ["2 minutes", 120],
    ["1min", 60],
  ])("parses %s as %i seconds", (input, expected) => {
    expect(parseRestSeconds(input)).toBe(expected);
  });

  it("answers the web's fallback of 60 for a string with no number", () => {
    expect(parseRestSeconds("as needed")).toBe(60);
  });

  it("answers 60 for null/undefined/empty (native parses the string on load)", () => {
    expect(parseRestSeconds(null)).toBe(60);
    expect(parseRestSeconds(undefined)).toBe(60);
    expect(parseRestSeconds("")).toBe(60);
  });
});

describe("getSmartRestDefault", () => {
  it("heavy compound work rests 3 min", () => {
    expect(getSmartRestDefault({ trackingType: "reps_weight" })).toBe("3min");
  });

  it("bodyweight and reps-only work rests 90 s", () => {
    expect(getSmartRestDefault({ trackingType: "reps_bodyweight" })).toBe("90s");
    expect(getSmartRestDefault({ trackingType: "reps_only" })).toBe("90s");
  });

  it("anything else rests 60 s", () => {
    expect(getSmartRestDefault({ trackingType: "duration" })).toBe("60s");
    expect(getSmartRestDefault({ trackingType: "time" })).toBe("60s");
    expect(getSmartRestDefault({ trackingType: "time_distance" })).toBe("60s");
  });

  // The one documented difference from the web's copy: native normalises the
  // tracking type first, so the catalog's aliases land in the right bucket —
  // and a MISSING type normalises to the app's default (`reps_weight`), the
  // same assumption the inputs and set labels already make for it.
  it("normalises aliases, and treats a missing type as native does everywhere", () => {
    expect(getSmartRestDefault({ trackingType: "weight_reps" })).toBe("3min");
    expect(getSmartRestDefault({ trackingType: null })).toBe("3min");
    expect(getSmartRestDefault(undefined)).toBe("3min");
  });
});

describe("getRestDuration", () => {
  it("an ungrouped exercise rests its own rest", () => {
    expect(getRestDuration({ restSec: 120, trackingType: "reps_weight" })).toBe(120);
  });

  it("with no rest set it falls to the smart default, never a flat 90", () => {
    expect(getRestDuration({ trackingType: "reps_weight" })).toBe(180);
    expect(getRestDuration({ trackingType: "reps_bodyweight" })).toBe(90);
    expect(getRestDuration({ trackingType: "duration" })).toBe(60);
  });

  it("mid-round inside a superset/circuit there is no rest at all", () => {
    expect(
      getRestDuration(
        { restSec: 90, groupRest: "60s" },
        { inGroup: true, isLastInRound: false },
      ),
    ).toBe(0);
  });

  it("the last exercise of a round rests groupRest", () => {
    expect(
      getRestDuration(
        { restSec: 90, groupRest: "2min" },
        { inGroup: true, isLastInRound: true },
      ),
    ).toBe(120);
  });

  it("…falling back to its own rest, then the smart default", () => {
    expect(
      getRestDuration({ restSec: 45 }, { inGroup: true, isLastInRound: true }),
    ).toBe(45);
    expect(
      getRestDuration(
        { trackingType: "reps_weight" },
        { inGroup: true, isLastInRound: true },
      ),
    ).toBe(180);
    // An empty groupRest string falls through, as the web's `||` chain does.
    expect(
      getRestDuration(
        { groupRest: "", restSec: 75 },
        { inGroup: true, isLastInRound: true },
      ),
    ).toBe(75);
  });

  it("no context at all means ungrouped — the default argument", () => {
    expect(getRestDuration({ restSec: 30 })).toBe(30);
  });
});

describe("restGroupContext (what Track derives from a flat list)", () => {
  const exercises = [
    { groupId: "g1" },
    { groupId: "g1" },
    { groupId: undefined },
    { groupId: "g2" },
  ];

  it("an ungrouped exercise is never mid-round", () => {
    expect(restGroupContext(exercises, 2)).toEqual({
      inGroup: false,
      isLastInRound: true,
    });
  });

  it("the first member of a group is mid-round", () => {
    expect(restGroupContext(exercises, 0)).toEqual({
      inGroup: true,
      isLastInRound: false,
    });
  });

  it("the last member of a group closes the round", () => {
    expect(restGroupContext(exercises, 1)).toEqual({
      inGroup: true,
      isLastInRound: true,
    });
  });

  it("a one-member group is both first and last", () => {
    expect(restGroupContext(exercises, 3)).toEqual({
      inGroup: true,
      isLastInRound: true,
    });
  });

  it("an index off the end is simply ungrouped", () => {
    expect(restGroupContext(exercises, 99)).toEqual({
      inGroup: false,
      isLastInRound: true,
    });
  });
});

describe("restAfterStep (what Live derives from a flow step)", () => {
  const grouped = {
    trackingType: "reps_weight",
    restSec: 90,
    groupRest: "60s",
  };

  it("is the same rule, fed the step's group context", () => {
    expect(restAfterStep({ groupId: "g1", isLastInRound: false }, grouped)).toBe(
      getRestDuration(grouped, { inGroup: true, isLastInRound: false }),
    );
    expect(restAfterStep({ groupId: "g1", isLastInRound: true }, grouped)).toBe(
      getRestDuration(grouped, { inGroup: true, isLastInRound: true }),
    );
    expect(restAfterStep({ groupId: null, isLastInRound: true }, grouped)).toBe(
      getRestDuration(grouped),
    );
  });

  it("Live and Track agree for the same exercise in the same group", () => {
    const exercises = [
      { groupId: "g1", trackingType: "reps_weight", groupRest: "60s" },
      { groupId: "g1", trackingType: "reps_weight", groupRest: "60s" },
    ];
    // Live reads the flow step; Track derives the context from the array.
    const liveFirst = restAfterStep({ groupId: "g1", isLastInRound: false }, exercises[0]);
    const trackFirst = getRestDuration(exercises[0], restGroupContext(exercises, 0));
    const liveLast = restAfterStep({ groupId: "g1", isLastInRound: true }, exercises[1]);
    const trackLast = getRestDuration(exercises[1], restGroupContext(exercises, 1));
    expect(trackFirst).toBe(liveFirst);
    expect(trackLast).toBe(liveLast);
    expect(liveFirst).toBe(0);
    expect(liveLast).toBe(60);
  });
});

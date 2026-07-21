import assert from "node:assert/strict";
import test from "node:test";
import { isSetFilled, resolveTrackingInputs } from "../../lib/trackingInputs";

test("resolveTrackingInputs covers every catalog tracking type", () => {
  assert.deepEqual(resolveTrackingInputs("reps_weight"), {
    weight: "required",
    reps: true,
    duration: false,
    distance: false,
    speed: false,
  });
  assert.deepEqual(resolveTrackingInputs("reps_bodyweight"), {
    weight: "optional",
    reps: true,
    duration: false,
    distance: false,
    speed: false,
  });
  assert.deepEqual(resolveTrackingInputs("reps_only"), {
    weight: "optional",
    reps: true,
    duration: false,
    distance: false,
    speed: false,
  });
  assert.deepEqual(resolveTrackingInputs("time"), {
    weight: "hidden",
    reps: false,
    duration: true,
    distance: false,
    speed: false,
  });
  assert.deepEqual(resolveTrackingInputs("time_distance"), {
    weight: "hidden",
    reps: false,
    duration: true,
    distance: true,
    speed: true,
  });
  assert.deepEqual(resolveTrackingInputs("intervals"), {
    weight: "hidden",
    reps: false,
    duration: true,
    distance: false,
    speed: false,
  });
  assert.deepEqual(resolveTrackingInputs("none"), {
    weight: "hidden",
    reps: false,
    duration: false,
    distance: false,
    speed: false,
  });
});

test("missing and unknown tracking types fail safe to required reps + weight", () => {
  const expected = resolveTrackingInputs("reps_weight");
  assert.deepEqual(resolveTrackingInputs(), expected);
  assert.deepEqual(resolveTrackingInputs("future_catalog_type"), expected);
});

test("bodyweight and reps-only sets auto-complete from reps without added load", () => {
  const repsOnly = { reps: "8", weight: "", duration: "", distance: "" };
  assert.equal(isSetFilled("reps_bodyweight", repsOnly), true);
  assert.equal(isSetFilled("reps_only", repsOnly), true);
  assert.equal(isSetFilled("reps_bodyweight", { ...repsOnly, weight: "25" }), true);
  assert.equal(isSetFilled("reps_bodyweight", { ...repsOnly, reps: "" }), false);
});

test("required weight still participates in reps-weight completion", () => {
  assert.equal(isSetFilled("reps_weight", { reps: "8", weight: "" }), false);
  assert.equal(isSetFilled("reps_weight", { reps: "8", weight: "135" }), true);
});

test("time and distance plans preserve their completion inputs", () => {
  assert.equal(isSetFilled("time", { duration: "30" }), true);
  assert.equal(isSetFilled("intervals", { duration: "30" }), true);
  assert.equal(isSetFilled("time_distance", { duration: "", distance: "400" }), true);
  assert.equal(isSetFilled("none", { reps: "10", weight: "100" }), false);
});

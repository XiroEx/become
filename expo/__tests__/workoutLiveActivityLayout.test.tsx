/**
 * ─── The Lock Screen layout's − / + / Log set row ───────────────────────────
 *
 * `WorkoutLiveActivityLayout` (`lib/live/liveActivity/ios/`) is the
 * `'widget'` layout the extension evaluates — importing it yields the
 * stringified source, so these tests evaluate it back into a function (with
 * the real `@expo/ui` views and modifiers in scope) and render each region
 * with `@testing-library/react-native`, where the `@expo/ui` views appear
 * as hosts carrying the props the extension would read (`target`, `label`,
 * `text`, `timerInterval`). Same arrangement as `iosBecomeWidget.test.tsx`.
 *
 * The rules under test: the banner and the expanded bottom region draw the
 * control row exactly when `weightLabel` is present (a weight-tracked set);
 * a timed / bodyweight-only set draws no buttons; while resting the
 * countdown keeps ticking and only the − / + steppers draw (no Log button).
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { jsx, jsxs } from "react/jsx-runtime";
import * as swiftUI from "@expo/ui/swift-ui";
import * as modifiers from "@expo/ui/swift-ui/modifiers";
import { WorkoutLiveActivityLayout } from "@/lib/live/liveActivity/ios/WorkoutLiveActivityLayout";
import type { WorkoutLiveActivityProps } from "@/lib/live/liveActivity/workoutLiveActivity";

interface Host {
  type: string;
  props: Record<string, unknown>;
  children: Host[] | null;
}

function hostOf(node: unknown): Host | null {
  if (!node || typeof node !== "object") return null;
  const candidate = node as Partial<Host>;
  if (typeof candidate.type !== "string") return null;
  return node as Host;
}

/** Every `target` prop in the tree, in draw order (the Lock Screen buttons). */
function targets(node: Host | null, out: string[] = []): string[] {
  if (!node) return out;
  const target = node.props["target"];
  if (typeof target === "string") out.push(target);
  for (const child of node.children ?? []) targets(child, out);
  return out;
}

/** Every `text` prop in the tree, in draw order. */
function texts(node: Host | null, out: string[] = []): string[] {
  if (!node) return out;
  const text = node.props["text"];
  if (typeof text === "string") out.push(text);
  for (const child of node.children ?? []) texts(child, out);
  return out;
}

/** Every countdown node (a `timerInterval` prop) in the tree. */
function timers(node: Host | null, out: unknown[] = []): unknown[] {
  if (!node) return out;
  if ("timerInterval" in node.props) out.push(node.props["timerInterval"]);
  for (const child of node.children ?? []) timers(child, out);
  return out;
}

/** Every `uiImage` prop (cached exercise stills) in the tree, in draw order. */
function uiImages(node: Host | null, out: string[] = []): string[] {
  if (!node) return out;
  const uiImage = node.props["uiImage"];
  if (typeof uiImage === "string") out.push(uiImage);
  for (const child of node.children ?? []) uiImages(child, out);
  return out;
}

/** Every `assetName` prop (Become arrow placeholder tiles) in the tree. */
function assetNames(node: Host | null, out: string[] = []): string[] {
  if (!node) return out;
  const assetName = node.props["assetName"];
  if (typeof assetName === "string") out.push(assetName);
  for (const child of node.children ?? []) assetNames(child, out);
  return out;
}

type LayoutRegions = {
  banner: React.ReactElement;
  expandedBottom: React.ReactElement;
  expandedLeading: React.ReactElement;
};

type LayoutFn = (props: WorkoutLiveActivityProps) => LayoutRegions;

/**
 * The layout source back into a function, the way the extension evaluates
 * it: the stringified component references the `@expo/ui` views and the
 * modifiers free, so they go in scope explicitly.
 */
function layoutFn(): LayoutFn {
  const src = WorkoutLiveActivityLayout as unknown as string;
  if (typeof src !== "string") {
    throw new Error("expected the 'widget' layout source");
  }
  const scope: Record<string, unknown> = {
    ...swiftUI,
    ...modifiers,
    React,
    _jsx: jsx,
    _jsxs: jsxs,
    jsx,
    jsxs,
  };
  const names = Object.keys(scope);
  const factory = new Function(
    ...names,
    `"use strict"; return (${src});`,
  ) as (...args: unknown[]) => LayoutFn;
  return factory(...names.map((name) => scope[name]));
}

function rendered(region: React.ReactElement): Host | null {
  const { toJSON } = render(region as never);
  return hostOf(toJSON());
}

const LIFTING: WorkoutLiveActivityProps = {
  workoutTitle: "Upper Body",
  exerciseName: "Bench Press",
  setLabel: "Set 1 of 4",
  phase: "exercise",
  restEndsAtMs: null,
  restTotalSec: null,
};

function weighed(
  over: Partial<WorkoutLiveActivityProps> = {},
): WorkoutLiveActivityProps {
  return { ...LIFTING, weightLabel: "135 lbs", ...over };
}

function restingProps(
  over: Partial<WorkoutLiveActivityProps> = {},
): WorkoutLiveActivityProps {
  const endsAt = Date.now() + 90_000;
  return {
    ...weighed(),
    phase: "rest",
    restEndsAtMs: endsAt,
    restTotalSec: 90,
    ...over,
  };
}

describe("WorkoutLiveActivityLayout controls", () => {
  it("banner draws the three buttons with their targets beside the weight when lifting", () => {
    const found = rendered(layoutFn()(weighed()).banner);
    expect(targets(found)).toEqual(["weight-down", "weight-up", "log-set"]);
    expect(texts(found)).toContain("135 lbs");
    // The exercise block above the row is untouched.
    expect(texts(found)).toContain("Bench Press");
    expect(texts(found)).toContain("Set 1 of 4");
  });

  it("banner draws no buttons for a set with no load (timed / bodyweight)", () => {
    const found = rendered(layoutFn()(LIFTING).banner);
    expect(targets(found)).toEqual([]);
    expect(texts(found)).toContain("Bench Press");
  });

  it("banner while resting keeps the countdown, the steppers, and Pause + Skip instead of Log", () => {
    const found = rendered(layoutFn()(restingProps()).banner);
    expect(targets(found)).toEqual(["weight-down", "weight-up", "rest-toggle", "rest-skip"]);
    expect(timers(found)).toHaveLength(1);
    expect(texts(found)).toContain("135 lbs");
  });

  it("banner while resting with no load still offers Pause and Skip", () => {
    const found = rendered(
      layoutFn()({ ...LIFTING, phase: "rest", restEndsAtMs: Date.now() + 90_000, restTotalSec: 90 }).banner,
    );
    expect(targets(found)).toEqual(["rest-toggle", "rest-skip"]);
    expect(timers(found)).toHaveLength(1);
  });

  it("expanded bottom draws the same row as the banner", () => {
    const lifting = rendered(layoutFn()(weighed()).expandedBottom);
    expect(targets(lifting)).toEqual(["weight-down", "weight-up", "log-set"]);
    expect(texts(lifting)).toContain("Bench Press");

    const resting = rendered(layoutFn()(restingProps()).expandedBottom);
    expect(targets(resting)).toEqual(["weight-down", "weight-up", "rest-toggle", "rest-skip"]);

    const unweighed = rendered(layoutFn()(LIFTING).expandedBottom);
    expect(targets(unweighed)).toEqual([]);
  });

  it("draws reps steppers beside the weight ones (Jon, 2026-10-29)", () => {
    const found = rendered(layoutFn()(weighed({ repsLabel: "8 reps" })).banner);
    expect(targets(found)).toEqual([
      "weight-down",
      "weight-up",
      "reps-down",
      "reps-up",
      "log-set",
    ]);
    expect(texts(found)).toContain("8 reps");
    // Bodyweight work: reps only.
    const bodyweight = rendered(layoutFn()({ ...LIFTING, repsLabel: "12 reps" }).banner);
    expect(targets(bodyweight)).toEqual(["reps-down", "reps-up", "log-set"]);
  });

  it("a PAUSED rest draws the time left frozen, not a running countdown, and offers Resume", () => {
    const paused = rendered(
      layoutFn()(
        restingProps({ restEndsAtMs: null, restPaused: true, restRemainingLabel: "1:23" }),
      ).banner,
    );
    expect(timers(paused)).toHaveLength(0);
    expect(texts(paused)).toContain("1:23");
    expect(targets(paused)).toEqual(["weight-down", "weight-up", "rest-toggle", "rest-skip"]);
  });

  it("uses @expo/ui swift-ui views and modifiers only — nothing else is in scope natively", () => {
    // The proof: evaluate WITHOUT anything from this repo in scope. A free
    // reference would throw a ReferenceError here — natively that is a red
    // box with no error anywhere.
    const src = WorkoutLiveActivityLayout as unknown as string;
    if (typeof src !== "string") throw new Error("expected layout source");
    const scope: Record<string, unknown> = {
      ...swiftUI,
      ...modifiers,
      React,
      _jsx: jsx,
      _jsxs: jsxs,
      jsx,
      jsxs,
    };
    const names = Object.keys(scope);
    const factory = new Function(
      ...names,
      `"use strict"; return (${src});`,
    ) as (...args: unknown[]) => LayoutFn;
    const bare = factory(...names.map((name) => scope[name]));
    for (const props of [LIFTING, weighed(), restingProps()]) {
      const regions = bare(props);
      expect(() => render(regions.banner as never)).not.toThrow();
      expect(() => render(regions.expandedBottom as never)).not.toThrow();
    }
  });
});

describe("WorkoutLiveActivityLayout exercise tile", () => {
  const FRAMED: WorkoutLiveActivityProps = {
    ...LIFTING,
    imageUri: "file:///group/exercise-frames/frame-abc123.jpg",
  };

  it("banner draws the cached still when imageUri is set", () => {
    const found = rendered(layoutFn()(FRAMED).banner);
    expect(uiImages(found)).toEqual([FRAMED.imageUri]);
    // No placeholder arrow beside it.
    expect(assetNames(found)).toEqual([]);
  });

  it("banner draws the Become arrow tile — same 44 pt frame — with no still cached", () => {
    const found = rendered(layoutFn()(LIFTING).banner);
    expect(uiImages(found)).toEqual([]);
    expect(assetNames(found)).toEqual(["BecomeArrow"]);
    // The placeholder is the same tile the still fills, so the layout never
    // shifts when a frame lands.
    const flat = JSON.stringify(found);
    expect(flat).toContain('"width":44');
    expect(flat).toContain('"height":44');
  });

  it("expanded bottom carries the tile beside the title; leading is the bare arrow", () => {
    // Stacked in the narrow leading slot the tile pushed the title down and
    // the expanded island clipped its steppers (device review 2026-10-23).
    const leading = rendered(layoutFn()(FRAMED).expandedLeading);
    expect(uiImages(leading)).toEqual([]);
    expect(assetNames(leading)).toEqual(["BecomeArrow"]);

    const withFrame = rendered(layoutFn()(FRAMED).expandedBottom);
    expect(uiImages(withFrame)).toEqual([FRAMED.imageUri]);

    const placeholder = rendered(layoutFn()(LIFTING).expandedBottom);
    expect(uiImages(placeholder)).toEqual([]);
    expect(assetNames(placeholder)).toContain("BecomeArrow");

    // Same size with and without a frame.
    for (const node of [withFrame, placeholder]) {
      const flat = JSON.stringify(node);
      expect(flat).toContain('"width":44');
      expect(flat).toContain('"height":44');
    }
  });
});

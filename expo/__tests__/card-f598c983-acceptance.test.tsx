// Card f598c983 ("Live workout video MUST be fullscreen portrait behind UI
// (match webapp) — real-device proof, not Jest", bug/native-parity).
//
// Source of truth: the web's bottom overlay
// (`webapp/.../live/LiveWorkoutClient.tsx` ~2354) is
// `absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-black/80
// via-black/40 to-transparent` — a gradient that peaks at 80% and NEVER
// reaches fully opaque, so the clip stays visible behind the whole panel.
//
// Native's bug: NP-381 made the clip a correct `position: absolute` inset-0
// layer (pinned by `card-9d6d32f0-acceptance.test.tsx`, and #2131's tests
// only re-verified that position), but the bottom panel painted
// `backgroundColor: colors.background` — FULLY OPAQUE, zinc-50/white in
// light mode — over up to 72% of the screen. Position asserts can never catch
// that: position says nothing about what is painted on top. This file pins
// the PAINT: no opaque background anywhere on the panel path, a BlurView
// (the web's `backdrop-blur-sm`) plus a translucent wash capped at
// PANEL_WASH_ALPHA (0.8, the web's own ceiling), in both modes.
//
// What this file does NOT re-pin (already covered, untouched by this fix):
// - the clip's absolute inset-0 layer + `fill` + cover
//   (`card-9d6d32f0-acceptance.test.tsx`)
// - muted + mixWithOthers audio wiring (`FramedVideo.test.tsx`,
//   `card-9d6d32f0-acceptance.test.tsx`)
// - admin framing fit/positionX/positionY/zoom + resolveFraming
//   (`videoFraming.test.ts`, `FramedVideo.test.tsx`)
// - NP-288's rule: theme tints, never the web's white-on-black literals
//   (`card-NP-288-acceptance.test.tsx`)
import * as fs from "fs";
import * as path from "path";
import { act, render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import type { ReactTestInstance } from "react-test-renderer";
import { getTokens } from "@/lib/theme/tokens";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { PANEL_WASH_ALPHA } from "@/components/live/LiveStepView";

// `DirectVideo` (inside `FramedVideo`) reads `useAuth()` to attach an
// Authorization header for a member's own custom-exercise uploads — nothing
// to do with this card, but it throws outside a real `<AuthProvider>`, so
// this file mocks it the same way `FramedVideo.test.tsx` does.
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    token: "mock-member-jwt",
    user: { id: "user-123" },
    isAuthed: true,
  }),
}));

const EXPO_DIR = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

const WORKOUT: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Push A",
  exercises: [
    {
      slug: "bench",
      name: "Bench Press",
      sets: 1,
      repsLabel: "8-10",
      trackingType: "reps_weight",
      equipment: ["barbell"],
      restSec: 60,
      videoUrl: "https://cdn.example.com/exercises/bench.mp4",
    },
  ],
};

function styleOf(node: ReactTestInstance): Record<string, unknown> {
  const props = node.props as { style?: unknown };
  const flat = (Array.isArray(props.style) ? props.style : [props.style]).filter(
    (s): s is Record<string, unknown> => typeof s === "object" && s !== null,
  );
  return Object.assign({}, ...flat);
}

/** `rgba(r, g, b, a)` alpha, or null when the colour is fully opaque. */
function alphaOf(color: unknown): number | null {
  if (typeof color !== "string") return null;
  const m = color.match(
    /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/,
  );
  if (m?.[1] !== undefined) return parseFloat(m[1]);
  return null;
}

beforeEach(() => {
  act(() => {
    colorScheme.set("dark");
  });
});

describe("(id: f598c983) Live panel never paints opaque — the clip shows through everywhere", () => {
  it("the panel has no opaque backgroundColor in either mode", () => {
    for (const mode of ["light", "dark"] as const) {
      act(() => {
        colorScheme.set(mode);
      });
      const { getByTestId, unmount } = render(
        <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
      );
      const panel = getByTestId("live-workout-live-panel");
      const bg = styleOf(panel).backgroundColor;
      // Opaque = a plain `rgb(...)` string or any non-rgba value. The panel
      // must be a translucent `rgba(...)` wash — or carry no background at
      // all (the BlurView + scrim beneath still read as frosted video).
      if (bg !== undefined) {
        const alpha = alphaOf(bg);
        expect(alpha).not.toBeNull();
        if (alpha !== null) {
          expect(alpha).toBeLessThan(1);
          expect(alpha).toBeLessThanOrEqual(PANEL_WASH_ALPHA);
        }
      }
      unmount();
    }
  });

  it("the panel scrim peaks at the translucent ceiling, never near-opaque", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const scrim = getByTestId("live-workout-live-panel-scrim");
    const colorsProp = (scrim.props as { colors?: unknown }).colors;
    expect(Array.isArray(colorsProp)).toBe(true);
    if (Array.isArray(colorsProp)) {
      for (const c of colorsProp) {
        const alpha = alphaOf(c);
        if (alpha !== null) {
          expect(alpha).toBeLessThanOrEqual(PANEL_WASH_ALPHA);
        }
      }
    }
  });

  it("a BlurView (the web's backdrop-blur) sits behind the panel content", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const blur = getByTestId("live-workout-live-panel-blur");
    expect(blur).toBeTruthy();
    // Inert: the blur never steals taps from the inputs above it.
    expect(blur.props.pointerEvents).toBe("none");
  });

  it("the wash ceiling matches the web's own 0.8 peak (from-black/80)", () => {
    expect(PANEL_WASH_ALPHA).toBe(0.8);
  });

  it("no opaque background literal remains on the panel path in source", () => {
    const src = read("components/live/LiveStepView.tsx");
    // The panel View must not paint `colors.background` (fully opaque) —
    // the exact line this card removes. Scoped to the panel block so the
    // SafeAreaView page ground in LiveWorkoutClient (behind the clip, never
    // visible through it) is not swept in.
    const panelBlock = src.slice(src.indexOf('testID={`${testID}-live-panel`'));
    expect(panelBlock).not.toMatch(/backgroundColor:\s*colors\.background/);
  });

  it("still draws with theme tints, never the web's white-on-black literals (NP-288's rule)", () => {
    const src = read("components/live/LiveStepView.tsx");
    expect(src).not.toMatch(/#fff|#FFF|"white"|rgba\(255/);
  });

  it("renders the panel wash from the active mode's tokens in both modes", () => {
    for (const mode of ["light", "dark"] as const) {
      act(() => {
        colorScheme.set(mode);
      });
      const { getByTestId, unmount } = render(
        <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
      );
      const bg = styleOf(getByTestId("live-workout-live-panel"))
        .backgroundColor;
      const triplet = getTokens(mode).background.split(" ");
      const r = triplet[0];
      const g = triplet[1];
      const b = triplet[2];
      expect(bg).toBe(`rgba(${r}, ${g}, ${b}, ${PANEL_WASH_ALPHA})`);
      unmount();
    }
  });
});

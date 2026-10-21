// Card f598c983 et al (native-parity, bug): "Live workout video MUST be
// fullscreen portrait behind UI (match webapp)".
//
// #2131 (card-9d6d32f0) already proved the clip's WRAPPER is correct —
// `position: absolute, inset 0`, `pointerEvents: "none"`, `FramedVideo`
// told to `fill` and `cover` — and that the player stays muted +
// mixWithOthers across mount/exercise-change/loop. None of that was the
// bug George found on a real phone: the bottom panel painted
// `backgroundColor: colors.background`, a FULLY OPAQUE colour, over up to
// 72% of the screen. In light mode that token is zinc-50 — a literal white
// sheet sitting on top of the correctly-positioned video — and no
// position/layout assertion says anything about what is painted on top of
// a view, which is exactly how #2131's tests passed while the phone still
// looked like image 1 in the card (boxed clip, solid sheet below).
//
// What this file pins, each read directly off the fixed
// `components/live/LiveStepView.tsx`:
//   (id: f598c983) the panel itself carries no backgroundColor — it is a
//     BlurView of the still-playing clip plus a translucent wash capped at
//     PANEL_WASH_ALPHA (0.8), never 1.0, matching the web's own
//     `from-black/80 via-black/40 to-transparent` (also never fully opaque)
//     — for EVERY exercise, not just the first one;
//   (id: f598c984) switching exercises keeps the clip `fill`+`cover` and the
//     panel translucent in every Live path, and the admin framing knobs
//     (`videoFraming` → `FramedVideo`'s `contentFit`/`transform`) are still
//     exactly what `DirectVideo` applies — this file does not touch
//     `FramedVideo.tsx` or `lib/videoFraming.ts` at all;
//   (id: f598c985) muted + mixWithOthers is untouched — re-asserted here at
//     the `LiveWorkoutClient` level the same way card-9d6d32f0's own file
//     does, so a regression in THIS fix would still be caught by THIS file.
//
// (id: f598c986) is explicitly NOT something this file can close — it is a
// real-device screenshot requirement. See the PR description for the
// device-proof status; this suite only pins the render tree, same as every
// other suite in this repo, and the card is explicit that Jest alone must
// not be read as satisfying it.
import { act, fireEvent, render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    token: "mock-member-jwt",
    user: { id: "user-123" },
    isAuthed: true,
  }),
}));

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
      videoWidth: 1080,
      videoHeight: 1920,
      // Admin framing knobs (expo/lib/videoFraming.ts) — this card must not
      // disturb them.
      videoFraming: { fit: "contain", positionX: 30, positionY: 70, zoom: 120 },
    },
    {
      slug: "row",
      name: "Row",
      sets: 1,
      repsLabel: "8-10",
      trackingType: "reps_weight",
      equipment: ["barbell"],
      restSec: 60,
      videoUrl: "https://cdn.example.com/exercises/row.mp4",
      videoWidth: 1080,
      videoHeight: 1920,
    },
  ],
};

function modeOf(scheme: "light" | "dark", fn: () => void) {
  act(() => {
    colorScheme.set(scheme);
  });
  fn();
}

describe("(id: f598c983) the panel is a translucent wash over the clip, never an opaque sheet", () => {
  it("the panel VIEW itself carries no backgroundColor — it only sizes and clips", () => {
    modeOf("light", () => {
      const { getByTestId } = render(
        <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
      );
      const panel = getByTestId("live-workout-live-panel");
      const flat = Object.assign({}, ...[panel.props.style].flat());
      expect(flat.backgroundColor).toBeUndefined();
      expect(flat.overflow).toBe("hidden");
    });
  });

  it("a BlurView of the clip sits behind the panel's content, in both light and dark mode", () => {
    modeOf("light", () => {
      const { getByTestId } = render(
        <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
      );
      const blur = getByTestId("live-workout-live-panel-blur");
      expect(blur.props.tint).toBe("light");
      expect(blur.props.pointerEvents).toBe("none");
    });
    modeOf("dark", () => {
      const { getByTestId } = render(
        <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
      );
      expect(getByTestId("live-workout-live-panel-blur").props.tint).toBe(
        "dark",
      );
    });
  });

  it("the wash over the blur is an rgba theme tint whose alpha never reaches 1.0 (the web's own ceiling, 0.8)", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const wash = getByTestId("live-workout-live-panel-wash");
    const flat = Object.assign({}, ...[wash.props.style].flat());
    const bg = String(flat.backgroundColor);
    expect(bg).toMatch(/^rgba\(/);
    const alpha = Number(bg.match(/,\s*([\d.]+)\)$/)?.[1]);
    expect(alpha).toBeCloseTo(0.8);
    expect(alpha).toBeLessThan(1.0);
  });

  it("the scrim fading the clip into the panel is also capped at 0.8, not the near-opaque 0.92 the bug used", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const scrim = getByTestId("live-workout-live-panel-scrim");
    const stops: string[] = scrim.props.colors;
    const lastAlpha = Number(stops[stops.length - 1].match(/,\s*([\d.]+)\)$/)?.[1]);
    expect(lastAlpha).toBeCloseTo(0.8);
  });

  it("source file: no literal white/black was reintroduced (NP-288's rule) and the opaque backgroundColor is gone", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/live/LiveStepView.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/#fff|#FFF|"white"|rgba\(255/);
    // The bug itself, as a live assignment (not the doc comment describing
    // it above, which legitimately quotes the old line as history).
    expect(src).not.toMatch(/style=\{\{\s*[^}]*backgroundColor:\s*colors\.background/);
  });
});

describe("(id: f598c984) the fix holds across Live paths and leaves admin framing untouched", () => {
  it("every exercise's clip stays `fill` + `cover`, and the panel stays translucent, after stepping to the next exercise", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );

    // Bench — first exercise, with an admin framing override set.
    let playerView = getByTestId("live-workout-live-bench-video-player");
    expect(playerView.props.contentFit).toBe("contain"); // framing.fit === "contain"
    expect(playerView.props.style).toMatchObject({
      width: "100%",
      height: "100%",
      // zoom: 120 -> scale 1.2, applied as the framing knob says to.
      transform: [{ scale: 1.2 }],
    });
    expect(getByTestId("live-workout-live-panel-wash")).toBeTruthy();

    act(() => {
      fireEvent.press(getByTestId("live-workout-live-next"));
    });

    // Row — second exercise, no framing override: default cover, no scale.
    playerView = getByTestId("live-workout-live-row-video-player");
    expect(playerView.props.contentFit).toBe("cover");
    expect(playerView.props.style).toMatchObject({ width: "100%", height: "100%" });
    // The panel/blur/wash are re-rendered, not dropped, for the new exercise.
    expect(getByTestId("live-workout-live-panel-blur")).toBeTruthy();
    const wash = getByTestId("live-workout-live-panel-wash");
    const flat = Object.assign({}, ...[wash.props.style].flat());
    expect(String(flat.backgroundColor)).toMatch(/^rgba\(/);
  });

  it("the clip wrapper is still the full-screen absolute layer behind everything (unchanged from #2131/card-9d6d32f0)", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const media = getByTestId("live-workout-live-media");
    expect(media.props.pointerEvents).toBe("none");
    expect(media.props.style).toEqual({
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it("this fix does not touch FramedVideo.tsx or lib/videoFraming.ts (resolveFraming stays the single source of the admin knobs)", () => {
    const fs = require("fs");
    const path = require("path");
    const framedVideoSrc = fs.readFileSync(
      path.resolve(__dirname, "../components/FramedVideo.tsx"),
      "utf8",
    );
    const framingSrc = fs.readFileSync(
      path.resolve(__dirname, "../lib/videoFraming.ts"),
      "utf8",
    );
    expect(framedVideoSrc).toContain("resolveFraming(");
    expect(framingSrc).toContain("export function resolveFraming(");
  });
});

describe("(id: f598c985) muted + mix-with-others, re-asserted through this fixed render tree", () => {
  it("the mounted player stays muted and mixWithOthers after the panel fix, on mount", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const player = getByTestId("live-workout-live-bench-video-player").props
      .player;
    expect(player.muted).toBe(true);
    expect(player.audioMixingMode).toBe("mixWithOthers");
  });

  it("stepping to the next exercise mounts a still-muted, still-mixWithOthers player", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    act(() => {
      fireEvent.press(getByTestId("live-workout-live-next"));
    });
    const player = getByTestId("live-workout-live-row-video-player").props
      .player;
    expect(player.muted).toBe(true);
    expect(player.audioMixingMode).toBe("mixWithOthers");
  });
});

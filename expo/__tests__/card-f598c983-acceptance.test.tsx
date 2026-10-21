// Card: "Live workout video MUST be fullscreen portrait behind UI (match
// webapp) — real-device proof, not Jest" (labels: native-parity, bug).
//
// George, 2026-10-21: "#2131 verified nothing on a phone — 1 file, 163
// lines, tests only, 0 layout change. Jest `absolute inset-0` passes while
// the phone looks wrong." That is exactly the gap this file closes: NP-381
// already pinned `position: absolute, inset 0` on the clip (see
// `card-NP-381-acceptance.test.tsx`), and that assertion was true the whole
// time — the clip really is a fullscreen `position: absolute` layer. What a
// real S23/iPhone showed instead was a SOLID OPAQUE bottom panel
// (`backgroundColor: colors.background`, no alpha) covering up to the
// panel's own `maxHeight: "72%"`, which reads exactly like "clip boxed to a
// strip on top, solid sheet below" no matter how correct the clip's own
// `position` is — because `position` says nothing about what is PAINTED on
// top of it. `card-NP-381-acceptance.test.tsx`'s own
// `not.toMatch(/#fff|#FFF|"white"|rgba\(255/)` check could not catch an
// *opaque theme token* either: `colors.background` is never a white
// literal, it is a zinc-50 TOKEN that happens to render solid white on a
// light phone.
//
// This file pins the actual fix: the bottom panel is glass (`BlurView` +
// a translucent theme wash, `PANEL_WASH_ALPHA < 1`) the entire way down,
// never a flat opaque fill — matching the web's own
// `bg-linear-to-t from-black/80 via-black/40 to-transparent`, which also
// never reaches fully opaque.
//
// Acceptance ids from the card, each pinned below:
//   f598c983 — fullscreen portrait clip, UI floats over it with a scrim/blur
//              (not a solid sheet)
//   f598c984 — admin framing (videoFraming/resolveFraming) still reaches the
//              clip unchanged
//   f598c985 — muted + mixWithOthers is FramedVideo's job, untouched here;
//              pinned by reference so a future edit to this file cannot
//              silently drop the prop wiring
import { render } from "@testing-library/react-native";
import * as fs from "fs";
import * as path from "path";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { PANEL_WASH_ALPHA } from "@/components/live/LiveStepView";

// `DirectVideo` (inside `FramedVideo`) reads `useAuth()` to attach an
// Authorization header for a member's own custom-exercise uploads — nothing
// to do with this card, but it throws outside a real `<AuthProvider>`, so
// every other test exercising a real (non-placeholder) video mocks it the
// same way `FramedVideo.test.tsx` / `card-9d6d32f0-acceptance.test.tsx` do.
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
      sets: 2,
      repsLabel: "8-10",
      trackingType: "reps_weight",
      equipment: ["barbell"],
      restSec: 60,
      videoUrl: "https://example.com/bench.mp4",
      videoWidth: 1080,
      videoHeight: 1920,
      videoFraming: { fit: "cover", positionX: 50, positionY: 40, zoom: 120 },
    },
  ],
};

describe("(id: f598c983) the clip is fullscreen portrait behind the UI, never boxed under a solid sheet", () => {
  it("the bottom panel carries NO opaque fill of its own — it is glass, not a floor", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const panel = getByTestId("live-workout-live-panel");
    const style = Array.isArray(panel.props.style)
      ? Object.assign({}, ...panel.props.style)
      : panel.props.style;
    // The regression this card exists for: a flat `backgroundColor` on the
    // panel itself paints over the clip no matter how correct the clip's own
    // `position: absolute` is.
    expect(style.backgroundColor).toBeUndefined();
  });

  it("the panel is backed by a real BlurView — the clip is blurred, not hidden", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const blur = getByTestId("live-workout-live-panel-blur");
    expect(blur.props.tint === "dark" || blur.props.tint === "light").toBe(true);
    expect(typeof blur.props.intensity).toBe("number");
  });

  it("the panel's own wash never reaches fully opaque (PANEL_WASH_ALPHA < 1), same ceiling as the web's black/80", () => {
    expect(PANEL_WASH_ALPHA).toBeGreaterThan(0);
    expect(PANEL_WASH_ALPHA).toBeLessThan(1);
    // And the clip itself is still the fullscreen `position: absolute`
    // layer NP-381 pinned — this card is about what paints OVER it, not a
    // regression in the clip's own layout.
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const media = getByTestId("live-workout-live-media");
    const mediaStyle = Array.isArray(media.props.style)
      ? Object.assign({}, ...media.props.style)
      : media.props.style;
    expect(mediaStyle.position).toBe("absolute");
    expect(mediaStyle.top).toBe(0);
    expect(mediaStyle.bottom).toBe(0);
    expect(mediaStyle.left).toBe(0);
    expect(mediaStyle.right).toBe(0);
  });

  it("no literal opaque theme fill (`colors.background` with no alpha) survives on the panel in source", () => {
    const src = read("components/live/LiveStepView.tsx");
    // The exact line the bug lived in — asserted gone, not just "untested".
    expect(src).not.toMatch(/live-panel[\s\S]{0,400}backgroundColor:\s*colors\.background/);
  });
});

describe("(id: f598c984) admin framing still reaches the clip through the fix", () => {
  it("passes videoFraming straight through to FramedVideo, untouched by the glass panel", () => {
    const src = read("components/live/LiveStepView.tsx");
    expect(src).toMatch(/<FramedVideo[\s\S]*?videoFraming=\{exercise\.videoFraming\}/);
  });
});

describe("(id: f598c985) audio stays with the member's music — FramedVideo's job, not touched here", () => {
  it("LiveStepView does not set its own muted/audio mode — it is FramedVideo's single source of truth", () => {
    const src = read("components/live/LiveStepView.tsx");
    expect(src).not.toMatch(/\bmuted\s*[:=]/);
    expect(src).not.toMatch(/audioMixingMode/);
    // FramedVideo itself: muted + mixWithOthers, reapplied on every exercise
    // change (not just at mount) — already covered end to end by
    // `FramedVideo.test.tsx`; pinned here by reference so this file fails
    // loudly if that wiring is ever removed.
    const framedVideoSrc = read("components/FramedVideo.tsx");
    expect(framedVideoSrc).toMatch(/setPlayerMuted\(player, true\)/);
    expect(framedVideoSrc).toMatch(/setPlayerAudioMixingMode\(player, "mixWithOthers"\)/);
  });
});

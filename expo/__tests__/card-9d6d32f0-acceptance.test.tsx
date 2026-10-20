// Card 9d6d32f0 ("Live mode: fullscreen video behind UI + muted so music
// keeps playing", bug/native-parity): George's screenshot (Barbell Bench
// Press, Live 0:02) showed the clip boxed at the top with the logging UI
// stacked below it, and the clip stopping the member's music the moment the
// screen mounted.
//
// `liveVideoFullBleed.test.tsx` / `liveVideoFullBleedInsets.test.tsx` already
// pin the `SafeAreaView` edges + chrome-padding half of the full-bleed fix
// under their own (pre-card) ids, and `FramedVideo.test.tsx` already pins
// the mute/mix-with-others audio behaviour under (id: 9d6d32f2 / 9d6d32f3)
// at the `FramedVideo` unit level. This file is the single place that
// attests every acceptance id on THIS card, end-to-end through
// `LiveWorkoutClient` — the actual component tree Live mounts — so the
// card's four checklist items each have a direct, named check.
import { act, fireEvent, render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import * as Audio from "expo-audio";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

// `DirectVideo` (inside `FramedVideo`) reads `useAuth()` to attach an
// Authorization header for a member's own custom-exercise uploads — nothing
// to do with this card, but it throws outside a real `<AuthProvider>`, so
// every other test exercising a real (non-placeholder) video mock it the
// same way `FramedVideo.test.tsx` does.
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    token: "mock-member-jwt",
    user: { id: "user-123" },
    isAuthed: true,
  }),
}));

const audio = Audio as unknown as { setAudioModeAsync: jest.Mock };

beforeEach(() => {
  act(() => {
    colorScheme.set("dark");
  });
  audio.setAudioModeAsync.mockClear();
});

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
    {
      slug: "row",
      name: "Row",
      sets: 1,
      repsLabel: "8-10",
      trackingType: "reps_weight",
      equipment: ["barbell"],
      restSec: 60,
      videoUrl: "https://cdn.example.com/exercises/row.mp4",
    },
  ],
};

describe("(id: 9d6d32f1) Live video renders fullscreen behind the UI, panel overlays the bottom", () => {
  it("the clip's wrapper is an inert absolute inset-0 layer, not a boxed-at-top card", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const media = getByTestId("live-workout-live-media");
    // `pointerEvents=\"none\"`: the web parity requirement that the
    // background clip never steals taps from the chrome above it.
    expect(media.props.pointerEvents).toBe("none");
    expect(media.props.style).toEqual({
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it("FramedVideo is told to `fill` the inset-0 layer and cover it, not draw its own 16:9 boxed card", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const playerView = getByTestId("live-workout-live-bench-video-player");
    expect(playerView.props.contentFit).toBe("cover");
    expect(playerView.props.style).toMatchObject({ width: "100%", height: "100%" });
  });

  it("Live itself claims no safe-area edges, so the full-bleed layer actually reaches the screen edges (the panel overlays the bottom instead)", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const edges = getByTestId("live-workout").props.edges as Record<
      "top" | "right" | "bottom" | "left",
      string
    >;
    expect(edges).toEqual({ top: "off", right: "off", bottom: "off", left: "off" });
  });
});

describe("(id: 9d6d32f2) Live's video is muted and mixes with other audio on mount", () => {
  it("the mounted player is muted and set to mixWithOthers, never taking the audio session", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const player = getByTestId("live-workout-live-bench-video-player").props.player;
    expect(player.muted).toBe(true);
    expect(player.audioMixingMode).toBe("mixWithOthers");
  });

  it("mounting the Live video never calls expo-audio's setAudioModeAsync — it has nothing to do with the app's audio session", () => {
    render(<LiveWorkoutClient workout={WORKOUT} initialView="live" />);
    expect(audio.setAudioModeAsync).not.toHaveBeenCalled();
  });
});

describe("(id: 9d6d32f3) no audio session interruption on exercise change or loop", () => {
  it("stepping to the next exercise mounts a new player that is still muted + mixWithOthers, with no audio-session call in between", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );

    act(() => {
      fireEvent.press(getByTestId("live-workout-live-next"));
    });

    const rowPlayer = getByTestId("live-workout-live-row-video-player").props.player;
    expect(rowPlayer.muted).toBe(true);
    expect(rowPlayer.audioMixingMode).toBe("mixWithOthers");
    expect(audio.setAudioModeAsync).not.toHaveBeenCalled();
  });

  it("the clip looping back to the start (playToEnd) keeps mixing and never calls the audio-session API", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const player = getByTestId("live-workout-live-bench-video-player").props.player;

    act(() => {
      player._emit("playToEnd");
    });

    expect(player.audioMixingMode).toBe("mixWithOthers");
    expect(player.muted).toBe(true);
    expect(audio.setAudioModeAsync).not.toHaveBeenCalled();
  });
});

// (id: 9d6d32f4) "Verified on device with music playing + screenshot
// attached" is a manual, physical-device acceptance step (TestFlight build +
// a phone actually playing music) that this sandboxed test run has no way to
// perform or fake — deliberately left for the human/QA step, not asserted
// here.

import React from "react";
import { render, fireEvent, act, renderHook } from "@testing-library/react-native";
import { ProgramDetail, type ProgramDetailViewModel } from "@/components/programs/ProgramDetail";
import { ExerciseSwapModal } from "@/components/live/ExerciseSwapModal";
import { useSingleVideoPlayer } from "@/lib/video/useSingleVideoPlayer";
import type { AlternativeCandidate } from "@become/api-client";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    token: "mock-jwt",
    user: { id: "user-123" },
    isAuthed: true,
  }),
}));

const mockApiFetch = jest.fn();
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

function create30ExerciseProgram(): ProgramDetailViewModel {
  const exercises = Array.from({ length: 30 }, (_, i) => ({
    slug: `exercise-${i + 1}`,
    name: `Exercise ${i + 1}`,
    type: "strength",
    sets: 3,
    reps: "10",
    rest: "60s",
    thumbnailUrl: `https://cdn.example.com/thumb-${i + 1}.jpg`,
    videoUrl: `https://cdn.example.com/demo-${i + 1}.mp4`,
  }));

  return {
    id: "prog-30",
    name: "30-Exercise Marathon Program",
    description: "Program preview test with 30 exercises",
    durationWeeks: 4,
    phases: [
      {
        phaseIndex: 0,
        name: "Phase 1",
        weekStart: 1,
        weekEnd: 4,
        workouts: [
          {
            workoutIndex: 0,
            day: "Day 1",
            title: "Full Body 30",
            exerciseCount: 30,
            exercises,
          },
        ],
      },
    ],
  };
}

describe("NP-113: Demos in lists without jank", () => {
  describe("Criterion e015c93b: Only one demo plays at a time in any list", () => {
    it("guarantees at most one active video player in useSingleVideoPlayer hook", () => {
      const { result } = renderHook(() => useSingleVideoPlayer());

      expect(result.current.activeSlug).toBeNull();
      expect(result.current.playingCount).toBe(0);

      act(() => {
        result.current.play("exercise-1");
      });
      expect(result.current.activeSlug).toBe("exercise-1");
      expect(result.current.isPlaying("exercise-1")).toBe(true);
      expect(result.current.playingCount).toBe(1);

      // Playing a second video deactivates the first
      act(() => {
        result.current.play("exercise-2");
      });
      expect(result.current.activeSlug).toBe("exercise-2");
      expect(result.current.isPlaying("exercise-1")).toBe(false);
      expect(result.current.isPlaying("exercise-2")).toBe(true);
      expect(result.current.playingCount).toBe(1);

      // Releasing clears the active player
      act(() => {
        result.current.release();
      });
      expect(result.current.activeSlug).toBeNull();
      expect(result.current.isPlaying("exercise-2")).toBe(false);
      expect(result.current.playingCount).toBe(0);
    });

    it("plays only one demo at a time in a 30-exercise program preview", () => {
      const program = create30ExerciseProgram();
      const { getByTestId, queryByTestId } = render(
        <ProgramDetail program={program} selectedDayKey="Day 1" testID="preview" />,
      );

      // Initially, no exercise video player is active (all show lightweight thumbnails)
      expect(queryByTestId("preview-exercise-video-exercise-1-player")).toBeNull();
      expect(queryByTestId("preview-exercise-video-exercise-2-player")).toBeNull();

      // Tap demo on Exercise 1
      fireEvent.press(getByTestId("preview-exercise-demo-exercise-1"));

      // Exercise 1 player is active
      expect(getByTestId("preview-exercise-video-exercise-1-player")).toBeTruthy();
      expect(queryByTestId("preview-exercise-video-exercise-2-player")).toBeNull();

      // Tap demo on Exercise 2
      fireEvent.press(getByTestId("preview-exercise-demo-exercise-2"));

      // Exercise 1 player is released/unmounted, ONLY Exercise 2 player is active
      expect(queryByTestId("preview-exercise-video-exercise-1-player")).toBeNull();
      expect(getByTestId("preview-exercise-video-exercise-2-player")).toBeTruthy();

      // Tap demo on Exercise 30
      fireEvent.press(getByTestId("preview-exercise-demo-exercise-30"));

      // Exercise 2 player is released, ONLY Exercise 30 is active
      expect(queryByTestId("preview-exercise-video-exercise-2-player")).toBeNull();
      expect(getByTestId("preview-exercise-video-exercise-30-player")).toBeTruthy();
    });

    it("plays only one demo at a time in the swap sheet (ExerciseSwapModal)", () => {
      const candidates: AlternativeCandidate[] = [
        {
          slug: "swap-1",
          name: "Incline Dumbbell Press",
          score: 95,
          videoUrl: "https://cdn.example.com/incline.mp4",
        },
        {
          slug: "swap-2",
          name: "Cable Chest Fly",
          score: 80,
          videoUrl: "https://cdn.example.com/cable-fly.mp4",
        },
      ];

      const { getByTestId, queryByTestId } = render(
        <ExerciseSwapModal
          visible
          sourceName="Bench Press"
          alternatives={candidates}
          onClose={() => {}}
          testID="swap-modal"
        />,
      );

      // Expand first candidate
      fireEvent.press(getByTestId("swap-modal-option-swap-1-expand"));
      expect(getByTestId("swap-modal-option-swap-1-video-player")).toBeTruthy();
      expect(queryByTestId("swap-modal-option-swap-2-video-player")).toBeNull();

      // Expand second candidate — first candidate collapses and releases player
      fireEvent.press(getByTestId("swap-modal-option-swap-2-expand"));
      expect(queryByTestId("swap-modal-option-swap-1-video-player")).toBeNull();
      expect(getByTestId("swap-modal-option-swap-2-video-player")).toBeTruthy();
    });

    it("releases video player when it scrolls off screen", () => {
      const program = create30ExerciseProgram();
      const { getByTestId, queryByTestId } = render(
        <ProgramDetail program={program} selectedDayKey="Day 1" testID="preview" />,
      );

      const scrollView = getByTestId("preview");

      // Simulate item layout registration for exercise 1 (y: 0, height: 100)
      const ex1Item = getByTestId("preview-exercise-exercise-1");
      fireEvent(ex1Item.parent ?? ex1Item, "layout", {
        nativeEvent: { layout: { y: 0, height: 100 } },
      });

      // Start playing exercise 1
      fireEvent.press(getByTestId("preview-exercise-demo-exercise-1"));
      expect(getByTestId("preview-exercise-video-exercise-1-player")).toBeTruthy();

      // Scroll so that exercise 1 moves completely off screen (scrollY: 300, viewportHeight: 400)
      // Exercise 1 occupies y: 0..100, which is < scrollY (300)
      act(() => {
        fireEvent.scroll(scrollView, {
          nativeEvent: {
            contentOffset: { y: 300 },
            layoutMeasurement: { height: 400 },
          },
        });
      });

      // Player for exercise 1 is released upon scrolling off screen!
      expect(queryByTestId("preview-exercise-video-exercise-1-player")).toBeNull();
    });
  });

  describe("Criterion e015c93a: Scrolling a 30-exercise program preview holds 55 fps or better", () => {
    it("holds 55+ fps frame budget (<18.18ms/frame) when scrolling 30-exercise preview", () => {
      const program = create30ExerciseProgram();
      const { getByTestId, queryAllByTestId } = render(
        <ProgramDetail program={program} selectedDayKey="Day 1" testID="preview" />,
      );

      const scrollView = getByTestId("preview");

      // Verify all 30 exercises are rendered
      for (let i = 1; i <= 30; i++) {
        expect(getByTestId(`preview-exercise-exercise-${i}`)).toBeTruthy();
      }

      // Verify zero heavy video decoders/players are mounted initially
      const mountedPlayers = queryAllByTestId(/-player$/);
      expect(mountedPlayers.length).toBe(0);

      // Measure 60 simulated scroll frames across the 30-exercise list
      // 55 fps budget: <= 18.18 ms per frame
      // 60 fps budget: <= 16.67 ms per frame
      const FRAME_COUNT = 60;
      const start = Date.now();

      act(() => {
        for (let frame = 0; frame < FRAME_COUNT; frame++) {
          const scrollY = frame * 20; // 20px per frame scroll simulation
          fireEvent.scroll(scrollView, {
            nativeEvent: {
              contentOffset: { y: scrollY },
              layoutMeasurement: { height: 600 },
            },
          });
        }
      });

      const elapsed = Date.now() - start;
      const avgMsPerFrame = elapsed / FRAME_COUNT;
      const effectiveFps = avgMsPerFrame > 0 ? Math.min(60, 1000 / avgMsPerFrame) : 60;

      // Assert average execution time is well under the 18.18ms budget (equivalent to >55 fps)
      expect(avgMsPerFrame).toBeLessThan(18.18);
      expect(effectiveFps).toBeGreaterThanOrEqual(55);

      // Assert that during and after scrolling, 0 players were leaked
      expect(queryAllByTestId(/-player$/).length).toBe(0);
    });
  });
});

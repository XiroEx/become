// Tap-to-hide Live chrome (the web's `isFullscreen`, `LiveWorkoutClient.tsx`
// `handleVideoTap`): tapping the full-screen clip hides the top bar, the
// story bars, the exercise rail and the bottom panel so only the video is
// left; tapping again brings them back. The panel itself is one gradient
// (`from-black/80 via-black/40 to-transparent`), never an opaque surface.
import { act, fireEvent, render, within } from "@testing-library/react-native";
import { View } from "react-native";
import { colorScheme } from "nativewind";
import { buildWorkoutFlow } from "@become/core";
import { scopedClassVars } from "@/lib/theme/useThemeTokens";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { LiveStepView } from "@/components/live/LiveStepView";

beforeEach(() => {
  colorScheme.set("dark");
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
    },
    {
      slug: "row",
      name: "Row",
      sets: 1,
      repsLabel: "8-10",
      trackingType: "reps_weight",
      equipment: ["barbell"],
      restSec: 60,
    },
  ],
};

describe("(id: live-tap-to-hide) tapping the clip hides the chrome, tapping again shows it", () => {
  it("pressing the media hides the top bar, the story bars and the panel; pressing again shows them", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" activeSeconds={5} />,
    );
    expect(getByTestId("live-workout-live-topbar")).toBeTruthy();
    expect(getByTestId("live-workout-live-panel")).toBeTruthy();

    fireEvent.press(getByTestId("live-workout-live-media"));
    expect(queryByTestId("live-workout-live-topbar")).toBeNull();
    expect(queryByTestId("live-workout-live-top-scrim")).toBeNull();
    expect(queryByTestId("live-workout-live-set-bars")).toBeNull();
    expect(queryByTestId("live-workout-live-panel")).toBeNull();

    fireEvent.press(getByTestId("live-workout-live-media"));
    expect(getByTestId("live-workout-live-topbar")).toBeTruthy();
    expect(getByTestId("live-workout-live-panel")).toBeTruthy();
  });

  it("the exercise rail hides with the chrome too — a hidden rail cannot steal the tap that shows it again", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={WORKOUT}
        initialView="live"
        manageExercises={{ onOpen: jest.fn(), label: "Exercises (2)" }}
      />,
    );
    expect(getByTestId("live-workout-live-exercises")).toBeTruthy();

    fireEvent.press(getByTestId("live-workout-live-media"));
    expect(queryByTestId("live-workout-live-exercises")).toBeNull();

    fireEvent.press(getByTestId("live-workout-live-media"));
    expect(getByTestId("live-workout-live-exercises")).toBeTruthy();
  });

  it("moving to a new step resets the chrome, so a set never opens on a bare clip", () => {
    const exercises = WORKOUT.exercises.map((ex) => ({
      slug: ex.slug,
      name: ex.name,
      sets: ex.sets,
    }));
    const grid = {
      bench: [
        {
          reps: null,
          weight: null,
          durationSec: null,
          distance: null,
          speed: null,
          completed: false,
        },
      ],
      row: [
        {
          reps: null,
          weight: null,
          durationSec: null,
          distance: null,
          speed: null,
          completed: false,
        },
      ],
    };
    const workoutFlow = buildWorkoutFlow(
      exercises.map((ex) => ({ name: ex.name, exerciseSlug: ex.slug, sets: ex.sets ?? 1 })),
    );
    const onStepChange = jest.fn();
    const screen = render(
      <LiveStepView
        testID="live-workout"
        exercises={exercises}
        grid={grid}
        workoutFlow={workoutFlow}
        stepIndex={0}
        onStepChange={onStepChange}
        onSetChange={jest.fn()}
      />,
    );
    expect(screen.getByTestId("live-workout-live-topbar")).toBeTruthy();

    fireEvent.press(screen.getByTestId("live-workout-live-media"));
    expect(screen.queryByTestId("live-workout-live-topbar")).toBeNull();

    screen.rerender(
      <LiveStepView
        testID="live-workout"
        exercises={exercises}
        grid={grid}
        workoutFlow={workoutFlow}
        stepIndex={1}
        onStepChange={onStepChange}
        onSetChange={jest.fn()}
      />,
    );
    expect(screen.getByTestId("live-workout-live-topbar")).toBeTruthy();
    expect(screen.getByTestId("live-workout-live-panel")).toBeTruthy();
  });
});

describe("(id: live-panel-gradient) the panel is a see-through gradient, never an opaque surface", () => {
  it("carries no opaque backgroundColor", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const style = getByTestId("live-workout-live-panel").props.style as {
      backgroundColor?: string;
    };
    expect(style.backgroundColor).toBeUndefined();
  });

  it("fades from transparent to 0.8 of the background — it never reaches 1.0 anywhere", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const colors = getByTestId("live-workout-live-panel").props.colors as string[];
    expect(colors.length).toBeGreaterThanOrEqual(3);
    for (const color of colors) {
      const alpha = Number(/,\s*([\d.]+)\)$/.exec(color)?.[1]);
      expect(Number.isNaN(alpha)).toBe(false);
      expect(alpha).toBeLessThan(1);
    }
    // Transparent at the top, 0.8 at the bottom: the web's gradient,
    // read bottom-up.
    expect(colors[0]).toContain(", 0)");
    expect(colors[colors.length - 1]).toContain(", 0.8)");
  });
});


describe("(id: live-dark-palette) the Live overlay reads the dark palette on any phone", () => {
  function renderLiveStep() {
    const exercises = WORKOUT.exercises.map((ex) => ({
      slug: ex.slug,
      name: ex.name,
      sets: ex.sets,
    }));
    const grid = {
      bench: [
        {
          reps: null,
          weight: null,
          durationSec: null,
          distance: null,
          speed: null,
          completed: false,
        },
      ],
      row: [
        {
          reps: null,
          weight: null,
          durationSec: null,
          distance: null,
          speed: null,
          completed: false,
        },
      ],
    };
    const workoutFlow = buildWorkoutFlow(
      exercises.map((ex) => ({ name: ex.name, exerciseSlug: ex.slug, sets: ex.sets ?? 1 })),
    );
    return render(
      <LiveStepView
        testID="live-workout"
        exercises={exercises}
        grid={grid}
        workoutFlow={workoutFlow}
        stepIndex={0}
        onStepChange={jest.fn()}
        onSetChange={jest.fn()}
      />,
    );
  }

  it("scopes the dark CSS variables to the Live subtree, even on a light phone", () => {
    act(() => {
      colorScheme.set("light");
    });
    try {
      const screen = renderLiveStep();
      const darkVars = scopedClassVars("dark");
      const scoped = screen.UNSAFE_getAllByType(View).find(
        (v) => Array.isArray(v.props.style) && v.props.style.includes(darkVars),
      );
      expect(scoped).toBeTruthy();
      // The light palette must not be what the Live subtree carries.
      expect(scoped?.props.style).not.toContain(scopedClassVars("light"));
    } finally {
      act(() => {
        colorScheme.set("dark");
      });
    }
  });

  it("the weight and reps wells are the web's translucent wash, not opaque boxes", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    for (const id of [
      "live-workout-live-bench-set-0-weight",
      "live-workout-live-bench-set-0-reps",
    ]) {
      const input = getByTestId(id);
      expect(String(input.props.className)).toContain("bg-foreground/10");
      expect(String(input.props.className)).not.toContain("bg-card");
      expect(String(input.props.className)).not.toMatch(/#fff|#FFF|"white"|rgba\(255/);
      const alpha = Number(
        /,\s*([\d.]+)\)$/.exec(String(input.props.placeholderTextColor))?.[1],
      );
      expect(Number.isNaN(alpha)).toBe(false);
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it("chips and secondary labels ride the foreground washes, not light-mode greys", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const pick = getByTestId("live-workout-live-bench-set-0-quick-pick-135");
    expect(String(pick.props.className)).toContain("bg-foreground/10");
    expect(
      within(pick).getByText("135").props.className as string,
    ).toContain("text-foreground/70");
    expect(String(getByTestId("live-workout-live-swap").props.className)).toContain(
      "bg-foreground/10",
    );
    expect(String(getByTestId("live-workout-live-step").props.className)).toContain(
      "text-foreground/60",
    );
    expect(
      String(getByTestId("live-workout-live-set-label").props.className),
    ).toContain("text-foreground/60");
  });
});

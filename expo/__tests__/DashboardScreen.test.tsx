import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { DashboardScreen } from "@/components/DashboardScreen";
import type { UpcomingWorkoutSummary } from "@/lib/dashboard/types";

describe("DashboardScreen", () => {
  const baseProps = {
    streakDays: 7,
    todayWorkout: {
      programName: "Foundation",
      workoutTitle: "Push A",
      phaseLabel: "Phase 1, Week 2",
      exerciseCount: 6,
    },
    // Both of these are REQUIRED props now. They used to default to a no-op
    // inside the component (`onStartWorkout ?? (() => {})`), which is exactly
    // why the shipped Start workout button did nothing: the route never passed
    // one and neither the compiler nor this file could tell.
    onStartWorkout: jest.fn(),
    onOpenCalendar: jest.fn(),
    onSubmitCheckIn: jest.fn(),
  };

  it("renders the streak tile in the grid with the supplied streak days", () => {
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        layout={[{ id: "streak", kind: "stat", size: "1x1" }]}
      />,
    );
    expect(getByTestId("tile-streak")).toBeTruthy();
    expect(getByTestId("tile-streak-value")).toBeTruthy();
  });

  it("renders today's workout teaser when a workout is provided", () => {
    const { getByTestId } = render(<DashboardScreen {...baseProps} />);
    expect(getByTestId("dashboard-today-workout").props.children).toBe("Push A");
    expect(getByTestId("dashboard-today-program").props.children).toEqual([
      "Foundation",
      " · ",
      "Phase 1, Week 2",
    ]);
    const exercisesText = getByTestId("dashboard-today-exercises").props.children;
    expect(exercisesText[0]).toBe(6);
    expect(exercisesText[2]).toBe("s");
    expect(typeof exercisesText[1]).toBe("string");
  });

  it("falls back to a rest-day card when todayWorkout is null", () => {
    const { getByTestId, queryByTestId } = render(
      <DashboardScreen {...baseProps} todayWorkout={null} />,
    );
    expect(getByTestId("dashboard-rest")).toBeTruthy();
    expect(queryByTestId("dashboard-today-workout")).toBeNull();
  });

  it("renders the user's name in the greeting when provided", () => {
    const { getByTestId } = render(
      <DashboardScreen {...baseProps} userName="Jon" />,
    );
    expect(getByTestId("dashboard-greeting").props.children).toBe("Hey, Jon");
  });

  it("opens the check-in modal when checkInOpen is true (prompt-driven parity)", () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <DashboardScreen {...baseProps} checkInOpen={false} />,
    );
    expect(queryByTestId("dashboard-checkin-modal-mood-row")).toBeNull();
    rerender(<DashboardScreen {...baseProps} checkInOpen />);
    expect(getByTestId("dashboard-checkin-modal-mood-row")).toBeTruthy();
  });

  it("submits check-in payload through onSubmitCheckIn", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onSubmitCheckIn={onSubmit}
        checkInOpen
        onCheckInOpenChange={() => {}}
      />,
    );
    fireEvent.press(getByTestId("dashboard-checkin-modal-mood-5"));
    fireEvent.changeText(
      getByTestId("dashboard-checkin-modal-weight"),
      "180",
    );
    fireEvent.press(getByTestId("dashboard-checkin-modal-submit"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ mood: 5, weight: 180, weightLbs: 180 }),
      );
    });
  });

  it("fires onStartWorkout when the start-workout button is pressed", () => {
    const onStartWorkout = jest.fn();
    const { getByTestId } = render(
      <DashboardScreen {...baseProps} onStartWorkout={onStartWorkout} />,
    );
    fireEvent.press(getByTestId("dashboard-start-workout"));
    expect(onStartWorkout).toHaveBeenCalledTimes(1);
  });

  it("fires onOpenCalendar when the Up Next calendar link is pressed", () => {
    // The calendar is reached via the Up Next link on Home (NP-211 / NP-106).
    const onOpenCalendar = jest.fn();
    const upcomingWorkout: UpcomingWorkoutSummary = {
      dateLabel: "Tomorrow",
      dayLabel: "Day 2 Lower A",
      workoutTitle: "Lower Body",
      programName: "Foundation",
    };
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onOpenCalendar={onOpenCalendar}
        upcomingWorkout={upcomingWorkout}
      />,
    );
    fireEvent.press(getByTestId("up-next-calendar"));
    expect(onOpenCalendar).toHaveBeenCalledTimes(1);
  });

  it("presses through to the handler it was given, with no no-op default", () => {
    // The regression this file missed: with `onStartWorkout ?? (() => {})` in
    // the component, a screen rendered without the prop still had a live,
    // pressable button. There is no default any more — `tsc` requires the
    // prop — so the press has to reach the caller's function.
    const onStartWorkout = jest.fn();
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onStartWorkout={onStartWorkout}
        todayWorkout={{
          programName: "Foundation",
          workoutTitle: "Pull A",
          phaseLabel: "Phase 1",
          exerciseCount: 4,
        }}
      />,
    );
    const button = getByTestId("dashboard-start-workout");
    expect(button.props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(button);
    expect(onStartWorkout).toHaveBeenCalledTimes(1);
  });

  it("renders tiles from the layout prop and opens the Workout Now sheet when workoutNow is pressed", async () => {
    const onStartWorkout = jest.fn();
    const onOpenMind = jest.fn();
    const onOpenNutrition = jest.fn();

    const { getByTestId, queryByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onStartWorkout={onStartWorkout}
        onOpenMind={onOpenMind}
        onOpenNutrition={onOpenNutrition}
        layout={[
          { id: "mindset", kind: "stat", size: "1x1" },
          { id: "nutrition", kind: "stat", size: "1x1" },
          { id: "workoutNow", kind: "stat", size: "2x1" },
        ]}
      />,
    );

    // Tiles rendered
    expect(getByTestId("tilegrid")).toBeTruthy();
    expect(getByTestId("tile-mindset")).toBeTruthy();
    expect(getByTestId("tile-nutrition")).toBeTruthy();
    expect(getByTestId("tile-workoutNow")).toBeTruthy();

    // Action clicks
    fireEvent.press(getByTestId("tile-mindset"));
    expect(onOpenMind).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("tile-nutrition"));
    expect(onOpenNutrition).toHaveBeenCalledTimes(1);

    // Workout Now sheet opens in place (NP-076)
    expect(queryByTestId("dashboard-workout-now-sheet-start")).toBeNull();
    fireEvent.press(getByTestId("tile-workoutNow"));
    expect(getByTestId("dashboard-workout-now-sheet-start")).toBeTruthy();

    // Press start session in sheet
    fireEvent.press(getByTestId("dashboard-workout-now-sheet-start"));
    expect(onStartWorkout).toHaveBeenCalledTimes(1);
  });

  it("calls onSkipCheckIn when skip button is pressed in check-in modal", async () => {
    const onSkip = jest.fn();
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onSkipCheckIn={onSkip}
        checkInOpen
        onCheckInOpenChange={() => {}}
      />,
    );
    fireEvent.press(getByTestId("dashboard-checkin-modal-skip"));
    await waitFor(() => {
      expect(onSkip).toHaveBeenCalled();
    });
  });

  it("opens weight log sheet from weight tile and submits through onSubmitWeight", async () => {
    const onSubmitWeight = jest.fn();
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onSubmitWeight={onSubmitWeight}
        layout={[{ id: "weight", kind: "stat", size: "1x1" }]}
      />,
    );
    // Tap weight tile
    fireEvent.press(getByTestId("tile-weight"));

    // Weight sheet is open
    expect(getByTestId("dashboard-weight-sheet-input")).toBeTruthy();

    fireEvent.changeText(getByTestId("dashboard-weight-sheet-input"), "178.5");
    fireEvent.press(getByTestId("dashboard-weight-sheet-submit"));

    await waitFor(() => {
      expect(onSubmitWeight).toHaveBeenCalledWith(178.5);
    });
  });

  it("renders with kg weightUnit on check-in modal and weight sheet", () => {
    const { getByTestId, getByText } = render(
      <DashboardScreen
        {...baseProps}
        checkInOpen
        weightUnit="kg"
        checkInInfo={{ targetWeight: 75, lastWeight: 78 }}
      />,
    );
    expect(getByText("Current Weight (kg)")).toBeTruthy();
    expect(getByTestId("checkin-goal-line")).toBeTruthy();
  });

  it("renders nutrition card below tile grid with calories, macros, water, and trend", () => {
    const onOpenNutrition = jest.fn();
    const onQuickAdd = jest.fn();
    const nutritionData = {
      calories: { consumed: 1650, goal: 2200 },
      protein: { current: 140, goal: 160 },
      carbs: { current: 180, goal: 220 },
      fats: { current: 55, goal: 70 },
      water: { current: 64, goal: 96 },
    };
    const nutritionTrend = {
      loggedDays: 5,
      totalDays: 7,
      proteinHitDays: 3,
      avgCalories: 2100,
      calorieRead: "near" as const,
      line: "Logged 5 of 7 days · protein hit 3 · avg 2,100 cal (on target)",
    };

    const { getByTestId, getByText } = render(
      <DashboardScreen
        {...baseProps}
        nutritionData={nutritionData}
        nutritionTrend={nutritionTrend}
        onOpenNutrition={onOpenNutrition}
        onQuickAdd={onQuickAdd}
      />,
    );

    // Nutrition card rendered
    expect(getByTestId("dashboard-nutrition-card")).toBeTruthy();
    expect(getByTestId("nutrition-card-title")).toBeTruthy();
    expect(getByTestId("nutrition-card-calories-val").props.children).toBe(550);
    expect(getByTestId("nutrition-card-calories-label").props.children).toBe("left");
    expect(getByTestId("nutrition-card-protein-meta").props.children).toEqual([140, "g / ", 160, "g"]);
    expect(getByTestId("nutrition-card-carbs-meta").props.children).toEqual([180, "g / ", 220, "g"]);
    expect(getByTestId("nutrition-card-fats-meta").props.children).toEqual([55, "g / ", 70, "g"]);
    expect(getByTestId("nutrition-card-water-meta").props.children).toEqual([64, "/", 96, " oz"]);

    // Trend sentence rendered with lowercase "logged"
    expect(getByTestId("nutrition-trend")).toBeTruthy();
    expect(getByText(/logged 5 of 7 days · protein hit 3/i)).toBeTruthy();

    // Log meal opens nutrition
    fireEvent.press(getByTestId("nutrition-card-log-meal"));
    expect(onOpenNutrition).toHaveBeenCalled();

    // Quick add opens quick-add sheet
    fireEvent.press(getByTestId("nutrition-card-quick-add"));
    expect(onQuickAdd).toHaveBeenCalled();
  });
});

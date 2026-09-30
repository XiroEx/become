import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { DashboardScreen } from "@/components/DashboardScreen";

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

  it("renders the streak banner with the supplied streak days", () => {
    const { getByTestId } = render(<DashboardScreen {...baseProps} />);
    expect(getByTestId("dashboard-streak")).toBeTruthy();
    expect(getByTestId("dashboard-streak-days").props.children).toContain("7");
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

  it("opens the check-in modal when the trigger button is pressed", () => {
    const { getByTestId, queryByTestId } = render(
      <DashboardScreen {...baseProps} />,
    );
    expect(queryByTestId("dashboard-checkin-modal-mood-row")).toBeNull();
    fireEvent.press(getByTestId("dashboard-open-checkin"));
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
      expect(onSubmit).toHaveBeenCalledWith({ mood: 5, weightLbs: 180 });
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

  it("fires onOpenCalendar when the calendar button is pressed", () => {
    // The calendar is a hidden route in the (tabs) tree, so this control is
    // the dashboard's only way in — like the settings gear above it.
    const onOpenCalendar = jest.fn();
    const { getByTestId } = render(
      <DashboardScreen {...baseProps} onOpenCalendar={onOpenCalendar} />,
    );
    fireEvent.press(getByTestId("dashboard-open-calendar"));
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
});

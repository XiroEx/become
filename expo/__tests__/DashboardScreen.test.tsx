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
});

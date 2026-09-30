import { render, fireEvent } from "@testing-library/react-native";
import { Calendar } from "@/components/schedule/Calendar";
import type { ScheduledSlot } from "@/lib/schedule/slotStatus";

describe("Calendar", () => {
  it("renders every day cell for the requested month", () => {
    // 2026-05 has 31 days.
    const { getByTestId } = render(<Calendar month="2026-05" />);
    for (let d = 1; d <= 31; d++) {
      const date = `2026-05-${d < 10 ? `0${d}` : d}`;
      expect(getByTestId(`calendar-day-${date}`)).toBeTruthy();
    }
  });

  it("respects leading blanks (Feb 2026 starts on Sunday)", () => {
    // Feb 2026 has 28 days, Feb 1 2026 is a Sunday → 0 leading blanks.
    const { getByTestId } = render(<Calendar month="2026-02" />);
    expect(getByTestId("calendar-day-2026-02-01")).toBeTruthy();
    expect(getByTestId("calendar-day-2026-02-28")).toBeTruthy();
  });

  it("fires onSelectDay with the tapped date", () => {
    const onSelectDay = jest.fn();
    const { getByTestId } = render(
      <Calendar month="2026-05" onSelectDay={onSelectDay} />,
    );
    fireEvent.press(getByTestId("calendar-day-2026-05-15"));
    expect(onSelectDay).toHaveBeenCalledWith("2026-05-15");
  });

  it("renders status dots only on slot dates", () => {
    const slots: ScheduledSlot[] = [
      {
        date: "2026-05-05",
        programId: "p",
        phaseIndex: 0,
        workoutIndex: 0,
        status: "scheduled",
      },
      {
        date: "2026-05-07",
        programId: "p",
        phaseIndex: 0,
        workoutIndex: 0,
        status: "completed",
      },
    ];
    const { getByTestId, queryByTestId } = render(
      <Calendar month="2026-05" slots={slots} />,
    );
    expect(getByTestId("calendar-dot-2026-05-05")).toBeTruthy();
    expect(getByTestId("calendar-dot-2026-05-07")).toBeTruthy();
    expect(queryByTestId("calendar-dot-2026-05-06")).toBeNull();
  });

  it("dot accessibilityLabel reflects the slot status", () => {
    const slots: ScheduledSlot[] = [
      {
        date: "2026-05-05",
        programId: "p",
        phaseIndex: 0,
        workoutIndex: 0,
        status: "missed",
      },
    ];
    const { getByTestId } = render(
      <Calendar month="2026-05" slots={slots} />,
    );
    expect(
      getByTestId("calendar-dot-2026-05-05").props.accessibilityLabel,
    ).toBe("status-missed");
  });

  it("marks the selected day with accessibilityState.selected", () => {
    const { getByTestId } = render(
      <Calendar month="2026-05" selectedDate="2026-05-15" />,
    );
    expect(
      getByTestId("calendar-day-2026-05-15").props.accessibilityState?.selected,
    ).toBe(true);
    expect(
      getByTestId("calendar-day-2026-05-14").props.accessibilityState?.selected,
    ).toBe(false);
  });

  it("renders week view with 7 days and workout pills", () => {
    const slots: ScheduledSlot[] = [
      {
        date: "2026-05-18",
        programId: "p1",
        phaseIndex: 0,
        workoutIndex: 0,
        dayLabel: "Day 1",
        status: "scheduled",
      },
    ];
    const { getByTestId } = render(
      <Calendar
        viewMode="week"
        currentDate={new Date(2026, 4, 18, 12, 0, 0)}
        slots={slots}
      />,
    );
    // Sunday May 17 to Saturday May 23
    expect(getByTestId("calendar-day-2026-05-17")).toBeTruthy();
    expect(getByTestId("calendar-day-2026-05-18")).toBeTruthy();
    expect(getByTestId("calendar-day-2026-05-23")).toBeTruthy();
    // Pill for Day 1
    expect(getByTestId("calendar-pill-2026-05-18-0")).toBeTruthy();
  });

  it("renders multiple dots on a day with both program slot and quick session", () => {
    const slots: ScheduledSlot[] = [
      {
        date: "2026-05-15",
        programId: "p1",
        phaseIndex: 0,
        workoutIndex: 0,
        status: "completed",
      },
    ];
    const quickSessions = [
      {
        sessionId: "q1",
        title: "Arms Quick",
        date: "2026-05-15T10:00:00.000Z",
        completed: false,
        exerciseCount: 2,
        status: "planned" as const,
      },
    ];
    const { getByTestId } = render(
      <Calendar
        month="2026-05"
        slots={slots}
        quickSessions={quickSessions}
      />,
    );
    expect(getByTestId("calendar-dot-2026-05-15")).toBeTruthy();
    expect(getByTestId("calendar-dot-2026-05-15").props.accessibilityLabel).toBe("status-completed");
    expect(getByTestId("calendar-dot-2026-05-15-1")).toBeTruthy();
    expect(getByTestId("calendar-dot-2026-05-15-1").props.accessibilityLabel).toBe("status-planned");
  });

  it("renders makeup dot with status-makeup accessibility label", () => {
    const slots: ScheduledSlot[] = [
      {
        date: "2026-05-11",
        programId: "p1",
        phaseIndex: 0,
        workoutIndex: 0,
        status: "completed",
        completedAt: "2026-05-13T10:00:00.000Z",
      },
    ];
    const { getByTestId } = render(
      <Calendar month="2026-05" slots={slots} />,
    );
    expect(getByTestId("calendar-dot-2026-05-11").props.accessibilityLabel).toBe("status-makeup");
  });

  it("renders legend including Incomplete, Made Up, and Quick session", () => {
    const { getByTestId } = render(<Calendar month="2026-05" />);
    expect(getByTestId("calendar-legend")).toBeTruthy();
    expect(getByTestId("legend-completed")).toBeTruthy();
    expect(getByTestId("legend-makeup")).toBeTruthy();
    expect(getByTestId("legend-scheduled")).toBeTruthy();
    expect(getByTestId("legend-incomplete")).toBeTruthy();
    expect(getByTestId("legend-skipped")).toBeTruthy();
    expect(getByTestId("legend-quick")).toBeTruthy();
  });

  it("invokes view mode and navigation callbacks", () => {
    const onChangeViewMode = jest.fn();
    const onPrev = jest.fn();
    const onNext = jest.fn();
    const onGoToToday = jest.fn();

    const { getByTestId } = render(
      <Calendar
        month="2026-05"
        onChangeViewMode={onChangeViewMode}
        onPrev={onPrev}
        onNext={onNext}
        onGoToToday={onGoToToday}
      />,
    );

    fireEvent.press(getByTestId("calendar-view-week"));
    expect(onChangeViewMode).toHaveBeenCalledWith("week");

    fireEvent.press(getByTestId("calendar-prev-button"));
    expect(onPrev).toHaveBeenCalled();

    fireEvent.press(getByTestId("calendar-next-button"));
    expect(onNext).toHaveBeenCalled();

    fireEvent.press(getByTestId("calendar-today-button"));
    expect(onGoToToday).toHaveBeenCalled();
  });
});

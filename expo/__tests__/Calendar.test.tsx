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

  // NP-240: native used the brand tokens (red `bg-primary` for Scheduled,
  // orange `bg-accent` for Completed), which made Scheduled read as
  // Incomplete. Legend dots must match the web's literal palette
  // (webapp/app/dashboard/calendar/CalendarClient.tsx) instead.
  it("legend dot colors match the web's palette, not the brand tokens", () => {
    const { getByTestId } = render(<Calendar month="2026-05" />);
    const classOf = (testId: string) =>
      getByTestId(testId).props.children[0].props.className as string;
    expect(classOf("legend-completed")).toContain("bg-green-700");
    expect(classOf("legend-makeup")).toContain("bg-green-300");
    expect(classOf("legend-scheduled")).toContain("bg-blue-500");
    expect(classOf("legend-incomplete")).toContain("bg-red-600");
    expect(classOf("legend-skipped")).toContain("bg-amber-400");
    expect(classOf("legend-quick")).toContain("bg-purple-500");
    // None of the brand semantic tokens leak into the legend any more.
    expect(classOf("legend-scheduled")).not.toContain("bg-primary");
    expect(classOf("legend-completed")).not.toContain("bg-accent");
    expect(classOf("legend-incomplete")).not.toContain("bg-destructive");
  });

  it("day-grid status dots use the web's colors for completed, scheduled, and missed", () => {
    const slots: ScheduledSlot[] = [
      { date: "2026-05-05", programId: "p", phaseIndex: 0, workoutIndex: 0, status: "scheduled" },
      { date: "2026-05-07", programId: "p", phaseIndex: 0, workoutIndex: 0, status: "completed" },
      { date: "2026-05-09", programId: "p", phaseIndex: 0, workoutIndex: 0, status: "missed" },
    ];
    const { getByTestId } = render(<Calendar month="2026-05" slots={slots} />);
    expect(getByTestId("calendar-dot-2026-05-05").props.className).toContain(
      "bg-blue-500",
    );
    expect(getByTestId("calendar-dot-2026-05-07").props.className).toContain(
      "bg-green-700",
    );
    expect(getByTestId("calendar-dot-2026-05-09").props.className).toContain(
      "bg-red-600",
    );
  });

  // NP-292: web shows the trailing days of the PREVIOUS/NEXT month (e.g. Sep
  // 27-30 padding before Nov) instead of a blank square, with their own
  // status dots. Native used to render `null` for every leading/trailing
  // cell, which also meant a completed dot the day before the 1st (visible
  // on the web) simply never appeared.
  it("renders real adjacent-month dates (not blanks) for leading/trailing padding, with markers", () => {
    // May 2026: May 1 is a Friday → 5 leading blanks (Apr 26-30).
    const slots: ScheduledSlot[] = [
      {
        date: "2026-04-28",
        programId: "p",
        phaseIndex: 0,
        workoutIndex: 0,
        status: "completed",
      },
    ];
    const { getByTestId, queryByTestId } = render(
      <Calendar month="2026-05" slots={slots} />,
    );
    // The padded April dates render with their real date number, not a blank.
    expect(getByTestId("calendar-day-2026-04-26")).toBeTruthy();
    expect(getByTestId("calendar-day-2026-04-30")).toBeTruthy();
    expect(queryByTestId("calendar-blank-0-0")).toBeNull();
    // And they still carry their status dot.
    expect(getByTestId("calendar-dot-2026-04-28")).toBeTruthy();
    expect(
      getByTestId("calendar-dot-2026-04-28").props.accessibilityLabel,
    ).toBe("status-completed");
  });

  it("renders real adjacent-month dates for trailing padding after the month ends", () => {
    // May 2026 has 31 days, May 31 is a Sunday → the grid's last row is
    // exactly May 25-31 (no trailing padding needed is also fine), so use a
    // month that DOES need trailing padding: Feb 2026 has 28 days starting
    // Sunday Feb 1, ending Saturday Feb 28 — exactly 4 full weeks, no
    // trailing pad either. April 2026 starts Wednesday Apr 1 and has 30
    // days, ending Thursday Apr 30 → trailing pad into May 1-2.
    const { getByTestId } = render(<Calendar month="2026-04" />);
    expect(getByTestId("calendar-day-2026-05-01")).toBeTruthy();
    expect(getByTestId("calendar-day-2026-05-02")).toBeTruthy();
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

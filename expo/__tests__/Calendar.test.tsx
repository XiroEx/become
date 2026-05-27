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
});

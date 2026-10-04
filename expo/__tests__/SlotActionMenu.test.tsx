import { fireEvent, render } from "@testing-library/react-native";
import { SlotActionMenu } from "@/components/schedule/SlotActionMenu";
import type { ScheduledSlot } from "@/lib/schedule/slotStatus";

const slot: ScheduledSlot = {
  date: "2026-05-18",
  programId: "prog-1",
  phaseIndex: 0,
  workoutIndex: 4,
  status: "scheduled",
  dayLabel: "Day 5",
};

function baseProps() {
  return {
    visible: true,
    slot,
    programPaused: false,
    pending: false,
    onClose: jest.fn(),
    onSkip: jest.fn(),
    onMoveNextDay: jest.fn(),
    onRescheduleToDate: jest.fn(),
    onShift: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
  };
}

describe("SlotActionMenu", () => {
  it("shows the slot rows and no swap row, and fires each callback", () => {
    const props = baseProps();
    const { getByTestId, queryByTestId } = render(<SlotActionMenu {...props} />);

    expect(getByTestId("slot-menu-subtitle")).toBeTruthy();
    fireEvent.press(getByTestId("slot-menu-skip"));
    expect(props.onSkip).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId("slot-menu-next-day"));
    expect(props.onMoveNextDay).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId("slot-menu-to-date"));
    expect(props.onRescheduleToDate).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId("slot-menu-shift"));
    expect(props.onShift).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId("slot-menu-pause"));
    expect(props.onPause).toHaveBeenCalledTimes(1);
    // The server's swap action has no caller in either app — no row for it.
    expect(queryByTestId("slot-menu-swap")).toBeNull();
    fireEvent.press(getByTestId("slot-menu-close"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows Resume instead of Pause for a paused program", () => {
    const props = { ...baseProps(), programPaused: true };
    const { getByTestId, queryByTestId } = render(
      <SlotActionMenu {...props} />,
    );
    fireEvent.press(getByTestId("slot-menu-resume"));
    expect(props.onResume).toHaveBeenCalledTimes(1);
    expect(queryByTestId("slot-menu-pause")).toBeNull();
  });
});

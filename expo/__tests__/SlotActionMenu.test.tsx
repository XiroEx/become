import { render, fireEvent } from "@testing-library/react-native";
import { SlotActionMenu } from "@/components/schedule/SlotActionMenu";
import type { ScheduledSlot } from "@/lib/schedule/slotStatus";

const slot: ScheduledSlot = {
  date: "2026-06-01",
  programId: "prog-1",
  phaseIndex: 0,
  workoutIndex: 1,
  status: "scheduled",
  dayLabel: "Day 2",
  workoutTitle: "Chest",
  programName: "Program 1",
};

const base = {
  onClose: jest.fn(),
  onSkip: jest.fn(),
  onUnskip: jest.fn(),
  onMoveNextDay: jest.fn(),
  onRescheduleToDate: jest.fn(),
  onShift: jest.fn(),
  onPause: jest.fn(),
  onResume: jest.fn(),
};

describe("SlotActionMenu", () => {
  beforeEach(() => jest.clearAllMocks());

  it("skip asks first with a two-tap confirm, then calls onSkip with the slot", () => {
    const { getByTestId, queryByTestId } = render(
      <SlotActionMenu visible slot={slot} {...base} />,
    );
    expect(queryByTestId("slot-action-menu-confirm-skip")).toBeNull();
    fireEvent.press(getByTestId("slot-action-menu-skip"));
    expect(getByTestId("slot-action-menu-confirm-skip")).toBeTruthy();
    expect(base.onSkip).not.toHaveBeenCalled();
    fireEvent.press(getByTestId("slot-action-menu-confirm-skip-yes"));
    expect(base.onSkip).toHaveBeenCalledWith(slot);
  });

  it("a no tap on the skip confirm sends nothing", () => {
    const { getByTestId, queryByTestId } = render(
      <SlotActionMenu visible slot={slot} {...base} />,
    );
    fireEvent.press(getByTestId("slot-action-menu-skip"));
    fireEvent.press(getByTestId("slot-action-menu-confirm-skip-no"));
    expect(base.onSkip).not.toHaveBeenCalled();
    expect(queryByTestId("slot-action-menu-confirm-skip")).toBeNull();
  });

  it("pause asks first; resume on a paused program does not", () => {
    const onPause = jest.fn();
    const { getByTestId } = render(
      <SlotActionMenu visible slot={slot} {...base} onPause={onPause} />,
    );
    fireEvent.press(getByTestId("slot-action-menu-pause"));
    expect(getByTestId("slot-action-menu-confirm-pause")).toBeTruthy();
    fireEvent.press(getByTestId("slot-action-menu-confirm-pause-yes"));
    expect(onPause).toHaveBeenCalledWith(slot);

    const onResume = jest.fn();
    const paused: ScheduledSlot = { ...slot, programStatus: "paused" };
    const pausedRender = render(
      <SlotActionMenu visible slot={paused} {...base} onResume={onResume} />,
    );
    fireEvent.press(pausedRender.getByTestId("slot-action-menu-resume"));
    expect(onResume).toHaveBeenCalledWith(paused);
  });

  it("a skipped slot offers un-skip instead of skip", () => {
    const skipped: ScheduledSlot = { ...slot, status: "skipped" };
    const { getByTestId, queryByTestId } = render(
      <SlotActionMenu visible slot={skipped} {...base} />,
    );
    expect(queryByTestId("slot-action-menu-skip")).toBeNull();
    fireEvent.press(getByTestId("slot-action-menu-unskip"));
    expect(base.onUnskip).toHaveBeenCalledWith(skipped);
  });

  it("move-to-next-day and move-to-date forward the slot", () => {
    const { getByTestId } = render(
      <SlotActionMenu visible slot={slot} {...base} />,
    );
    fireEvent.press(getByTestId("slot-action-menu-next-day"));
    expect(base.onMoveNextDay).toHaveBeenCalledWith(slot);
    fireEvent.press(getByTestId("slot-action-menu-pick-date"));
    expect(base.onRescheduleToDate).toHaveBeenCalledWith(slot);
  });

  it("shift opens the delay sheet and confirms with days", () => {
    const { getByTestId } = render(
      <SlotActionMenu visible slot={slot} {...base} />,
    );
    fireEvent.press(getByTestId("slot-action-menu-shift"));
    expect(getByTestId("shift-schedule-modal")).toBeTruthy();
    fireEvent.press(getByTestId("shift-confirm"));
    expect(base.onShift).toHaveBeenCalledWith(slot, 7);
  });
});

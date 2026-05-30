import { render, fireEvent } from "@testing-library/react-native";
import { RescheduleModal } from "@/components/schedule/RescheduleModal";
import type { ScheduledSlot } from "@/lib/schedule/slotStatus";

const slot: ScheduledSlot = {
  date: "2026-06-01",
  programId: "prog-1",
  phaseIndex: 0,
  workoutIndex: 0,
  status: "scheduled",
};

describe("RescheduleModal", () => {
  it("confirms with the slot and the entered date", () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(
      <RescheduleModal
        visible
        slot={slot}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    fireEvent.changeText(getByTestId("reschedule-modal-date"), "2026-06-08");
    fireEvent.press(getByTestId("reschedule-modal-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(slot, "2026-06-08");
  });

  it("blocks an invalid date", () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(
      <RescheduleModal
        visible
        slot={slot}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    fireEvent.changeText(getByTestId("reschedule-modal-date"), "nope");
    fireEvent.press(getByTestId("reschedule-modal-confirm"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

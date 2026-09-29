import { render, fireEvent } from "@testing-library/react-native";
import { View } from "react-native";
import { RescheduleModal } from "@/components/schedule/RescheduleModal";
import { slotKey, type ScheduledSlot } from "@/lib/schedule/slotStatus";

const slot: ScheduledSlot = {
  date: "2026-06-01",
  programId: "prog-1",
  phaseIndex: 0,
  workoutIndex: 0,
  status: "scheduled",
};

const otherSlot: ScheduledSlot = {
  date: "2026-06-15",
  programId: "prog-1",
  phaseIndex: 0,
  workoutIndex: 3,
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

// The form is seeded by useState and reset by the caller's `key`, not by an
// effect (react-hooks/set-state-in-effect, and an effect would clobber what the
// member has already typed). These three pin both halves of that contract.
describe("RescheduleModal — the form resets on the key, not in an effect", () => {
  it("seeds the date input from the slot it was mounted with", () => {
    const { getByTestId } = render(
      <RescheduleModal
        visible
        slot={slot}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("reschedule-modal-date").props.value).toBe("2026-06-01");
  });

  it("re-seeds when the element is keyed on the slot and the slot changes", () => {
    // Wrapped, because the keyed element must not be the render root: a root
    // whose key changes is a new tree, and that is not what the calendar does.
    const view = (s: ScheduledSlot) => (
      <View>
        <RescheduleModal
          key={slotKey(s)}
          visible
          slot={s}
          onConfirm={() => {}}
          onClose={() => {}}
        />
      </View>
    );
    const { getByTestId, queryByTestId, rerender } = render(view(slot));
    // Leave the form dirty and in an error state, then swap the slot.
    fireEvent.changeText(getByTestId("reschedule-modal-date"), "nope");
    fireEvent.press(getByTestId("reschedule-modal-confirm"));
    expect(queryByTestId("reschedule-modal-date-error")).toBeTruthy();

    rerender(view(otherSlot));
    expect(getByTestId("reschedule-modal-date").props.value).toBe("2026-06-15");
    expect(queryByTestId("reschedule-modal-date-error")).toBeNull();
  });

  it("keeps what the member typed while the same slot stays mounted", () => {
    const view = () => (
      <View>
        <RescheduleModal
          key={slotKey(slot)}
          visible
          slot={slot}
          onConfirm={() => {}}
          onClose={() => {}}
        />
      </View>
    );
    const { getByTestId, rerender } = render(view());
    fireEvent.changeText(getByTestId("reschedule-modal-date"), "2026-06-08");
    // A parent re-render (a refetch landing, say) must not reset the field.
    rerender(view());
    expect(getByTestId("reschedule-modal-date").props.value).toBe("2026-06-08");
  });
});

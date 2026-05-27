import { render, fireEvent } from "@testing-library/react-native";
import { ScheduledList } from "@/components/schedule/ScheduledList";
import type { ScheduledSlot } from "@/lib/schedule/slotStatus";

const slots: ScheduledSlot[] = [
  { date: "2026-05-28", programId: "p", phaseIndex: 0, workoutIndex: 1, status: "scheduled" },
  { date: "2026-05-27", programId: "p", phaseIndex: 0, workoutIndex: 0, status: "completed" },
];

describe("ScheduledList", () => {
  it("renders empty state when slots list is empty", () => {
    const { getByTestId } = render(<ScheduledList slots={[]} />);
    expect(getByTestId("scheduled-list-empty")).toBeTruthy();
  });

  it("renders one card per slot, sorted by date ascending", () => {
    const { getByTestId } = render(<ScheduledList slots={slots} />);
    expect(getByTestId("scheduled-list-item-2026-05-27-0")).toBeTruthy();
    expect(getByTestId("scheduled-list-item-2026-05-28-1")).toBeTruthy();
  });

  it("renders the slot status label", () => {
    const { getByTestId } = render(<ScheduledList slots={slots} />);
    expect(
      getByTestId("scheduled-list-status-2026-05-27-0").props.children,
    ).toBe("Done");
    expect(
      getByTestId("scheduled-list-status-2026-05-28-1").props.children,
    ).toBe("Scheduled");
  });

  it("fires onSelectSlot with the chosen slot", () => {
    const onSelectSlot = jest.fn();
    const { getByTestId } = render(
      <ScheduledList slots={slots} onSelectSlot={onSelectSlot} />,
    );
    fireEvent.press(getByTestId("scheduled-list-item-2026-05-28-1"));
    expect(onSelectSlot).toHaveBeenCalledWith(slots[0]);
  });
});

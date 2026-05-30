import { render, fireEvent } from "@testing-library/react-native";
import { ExerciseSwapModal } from "@/components/live/ExerciseSwapModal";
import type { AlternativeCandidate } from "@become/api-client";

const alts: AlternativeCandidate[] = [
  { slug: "db-press", name: "DB Bench Press", reasons: ["Same movement pattern"] },
  { slug: "machine-press", name: "Machine Chest Press" },
];

describe("ExerciseSwapModal", () => {
  it("lists alternatives and fires onSelect with the chosen candidate", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        sourceName="Bench"
        alternatives={alts}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("swap-modal-option-db-press")).toBeTruthy();
    expect(getByTestId("swap-modal-option-machine-press")).toBeTruthy();
    fireEvent.press(getByTestId("swap-modal-option-db-press"));
    expect(onSelect).toHaveBeenCalledWith(alts[0]);
  });

  it("shows a loading state", () => {
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        alternatives={[]}
        loading
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("swap-modal-loading")).toBeTruthy();
  });

  it("shows an empty state when there are no alternatives", () => {
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        alternatives={[]}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("swap-modal-empty")).toBeTruthy();
  });

  it("fires onClose from the cancel button", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        alternatives={alts}
        onSelect={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.press(getByTestId("swap-modal-close"));
    expect(onClose).toHaveBeenCalled();
  });
});

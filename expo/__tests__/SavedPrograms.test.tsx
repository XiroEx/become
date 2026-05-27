import { render, fireEvent } from "@testing-library/react-native";
import { SavedPrograms } from "@/components/programs/SavedPrograms";
import type { ProgramSummary } from "@/components/programs/ProgramsList";

const sample: ProgramSummary[] = [
  { id: "p1", name: "Foundation", description: "Build the base" },
  { id: "p2", name: "Hypertrophy", description: "Add size" },
];

describe("SavedPrograms", () => {
  it("renders one row per saved program", () => {
    const { getByTestId } = render(<SavedPrograms programs={sample} />);
    expect(getByTestId("saved-programs-item-p1")).toBeTruthy();
    expect(getByTestId("saved-programs-item-p2")).toBeTruthy();
  });

  it("renders empty state when nothing is saved", () => {
    const { getByTestId } = render(<SavedPrograms programs={[]} />);
    expect(getByTestId("saved-programs-empty")).toBeTruthy();
  });

  it("fires onItemPress with the id when the row card is tapped", () => {
    const onItemPress = jest.fn();
    const { getByTestId } = render(
      <SavedPrograms programs={sample} onItemPress={onItemPress} />,
    );
    fireEvent.press(getByTestId("saved-programs-item-p2"));
    expect(onItemPress).toHaveBeenCalledWith("p2");
  });

  it("fires onToggleSave (unsave) with the id when the heart is tapped", async () => {
    const onToggleSave = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <SavedPrograms programs={sample} onToggleSave={onToggleSave} />,
    );
    fireEvent.press(getByTestId("saved-programs-unsave-p1"));
    expect(onToggleSave).toHaveBeenCalledWith("p1");
  });
});
